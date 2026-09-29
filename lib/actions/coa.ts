"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionState = { error?: string; success?: string } | undefined;

export type HeaderField = { label: string; value: string };
export type ResultLine = { seq: number; test: string; specification: string; result: string };

// Certificate of Analysis generation (22 Sept 2026), step 2 of 2 — see
// docs/modules/coa.md and 0060_coa_generation.sql for the full design
// story. Replaces the old createCoaRecord flow (pick an Approved QC,
// paste a file URL) per Ravi's confirmation on the templates patch: this
// is the only way to issue a COA going forward, though every coa_records
// row the old flow ever created is untouched.
//
// header_data/result_lines arrive as JSON strings from hidden form
// fields (built client-side by generate-coa-form.tsx from the same
// server-fetched data this page rendered, so nothing here is typed from
// scratch by the browser) — parsed and re-validated here, not trusted
// blindly, same "server re-checks what the form claims" posture as
// createCoaRecord's own status re-check below.
export async function generateCoaCertificate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "coa")) return { error: "Not authorized." };

  const qualityCheckId = String(formData.get("quality_check_id") || "");
  const subjectType = String(formData.get("subject_type") || "");
  const remarks = String(formData.get("remarks") || "").trim();
  if (!qualityCheckId) return { error: "Missing quality check." };
  if (subjectType !== "raw_material" && subjectType !== "finished_product") {
    return { error: "Missing subject type." };
  }

  let headerData: HeaderField[];
  let resultLines: ResultLine[];
  try {
    headerData = JSON.parse(String(formData.get("header_data") || "[]"));
    resultLines = JSON.parse(String(formData.get("result_lines") || "[]"));
  } catch {
    return { error: "Could not read the submitted form data." };
  }
  if (!Array.isArray(headerData) || !Array.isArray(resultLines) || resultLines.length === 0) {
    return { error: "Missing header fields or test results." };
  }
  if (!remarks) return { error: "Remarks is required." };
  for (const line of resultLines) {
    if (!String(line.result ?? "").trim()) {
      return { error: `Result is required for "${line.test}".` };
    }
  }
  // Header values are editable on the form (see coa.md's "header field
  // sourcing" note — some, like Sampled Qty, are hand-composed wording,
  // not a raw stored value), but every label/value pair must at least be
  // non-empty text — an empty label would mean the form sent something
  // this action doesn't recognize.
  for (const field of headerData) {
    if (!String(field.label ?? "").trim() || !String(field.value ?? "").trim()) {
      return { error: "Every header field must have a value before generating the certificate." };
    }
  }

  const supabase = await createClient();

  // Re-verify server-side: the QC is actually Approved, its subject
  // matches what the form claims, and a template still exists for its
  // item type — never trust that the page the form was rendered from is
  // still the current state by the time Submit is clicked.
  //
  // FP's item_type_id is read via finished_product_batches -> mfr_definitions
  // -> finished_product_item_id -> items.item_type_id, NOT
  // mfr_definitions.item_type_id directly — that column is deprecated
  // (0010_mfr_finished_product_link.sql) and can be null/stale even when
  // the item's own item_type_id (what the MFR detail page shows) is set.
  // See docs/modules/coa.md's "Post-launch fixes" note — the page resolver
  // (app/(dashboard)/coa/new/page.tsx) had this exact same bug, fixed
  // first; this is the same mistake in this Server Action's own
  // independent re-check, missed in that pass.
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select(
      "id, status, purchase_line_id, finished_product_batch_id, purchase_lines(item_id, items(item_type_id)), finished_product_batches(mfr_definitions(items(item_type_id)))"
    )
    .eq("id", qualityCheckId)
    .maybeSingle<{
      id: string;
      status: string;
      purchase_line_id: string | null;
      finished_product_batch_id: string | null;
      purchase_lines: { item_id: string; items: { item_type_id: string | null } | null } | null;
      finished_product_batches: { mfr_definitions: { items: { item_type_id: string | null } | null } | null } | null;
    }>();
  if (qcError || !qc) return { error: "Selected quality check could not be found." };
  if (qc.status !== "approved") return { error: "Only an Approved quality check can be issued a COA." };
  // ACC-15: and only the batch's current approval (latest QC record, not
  // due for retest) — 0082 also enforces this on insert.
  const { data: isCurrent } = await supabase.rpc("qc_is_current_approval", { p_quality_check_id: qc.id });
  if (isCurrent !== true) {
    return {
      error: "This AR is no longer the batch's current approval (it was retested, rejected or is due for retest) — reload and pick the batch again.",
    };
  }

  const isRm = !!qc.purchase_line_id;
  if ((subjectType === "raw_material") !== isRm) {
    return { error: "Subject type no longer matches this quality check — reload and try again." };
  }

  const itemTypeId = isRm
    ? qc.purchase_lines?.items?.item_type_id
    : qc.finished_product_batches?.mfr_definitions?.items?.item_type_id;
  if (!itemTypeId) {
    return { error: "This item has no Item Type set, so no COA template can be resolved for it." };
  }

  const { data: template } = await supabase
    .from("coa_templates")
    .select("id")
    .eq("item_type_id", itemTypeId)
    .maybeSingle();
  if (!template) {
    return { error: "No COA template is defined for this item type anymore — check Manage Templates." };
  }

  const { data: coaNumber, error: coaNumError } = await supabase.rpc("get_next_coa_number");
  if (coaNumError || !coaNumber) return { error: friendlyDbError(coaNumError, "Could not generate a COA number.") };

  const { data: inserted, error } = await supabase
    .from("coa_records")
    .insert({
      coa_number: coaNumber,
      quality_check_id: qc.id,
      finished_product_batch_id: qc.finished_product_batch_id,
      coa_template_id: template.id,
      coa_type: subjectType,
      header_data: headerData,
      result_lines: resultLines,
      remarks,
      issued_by: user!.id,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: friendlyDbError(error, "Could not save the certificate.") };

  revalidatePath("/coa");
  redirect(`/coa/${inserted.id}?created=1`);
}
