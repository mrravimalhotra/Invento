"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";
import { fetchCompany } from "@/lib/company-server";
import { resolveRawMaterial, resolveFinishedProduct } from "@/lib/coa-draft";
import { finalResults, type QcResultLine } from "@/lib/qc-results";

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
    if (!String(field.label ?? "").trim()) {
      return { error: "Could not read the certificate header — reload the page and try again." };
    }
  }

  const supabase = await createClient();

  // Re-verify server-side: the QC is actually Approved, its subject
  // matches what the form claims, and a template still exists for the
  // raw material (purchase line's item) or the MFR (the FP batch's recipe)
  // — never trust that the page the form was rendered from is still the
  // current state by the time Submit is clicked. Since 3 Oct 2026 (Ravi)
  // templates belong to each raw material and each MFR, not to an Item Type
  // (0096_coa_template_per_item.sql).
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select("id, status, purchase_line_id, finished_product_batch_id, checker_results, reviewer_results, purchase_lines(item_id), finished_product_batches(mfr_definition_id)")
    .eq("id", qualityCheckId)
    .maybeSingle<{
      id: string;
      status: string;
      purchase_line_id: string | null;
      finished_product_batch_id: string | null;
      checker_results: QcResultLine[] | null;
      reviewer_results: QcResultLine[] | null;
      purchase_lines: { item_id: string } | null;
      finished_product_batches: { mfr_definition_id: string } | null;
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

  const templateQuery = supabase.from("coa_templates").select("id, coa_template_lines(seq, test, specification)");
  const { data: template } = await (isRm
    ? templateQuery.eq("item_id", qc.purchase_lines?.item_id ?? "")
    : templateQuery.eq("mfr_definition_id", qc.finished_product_batches?.mfr_definition_id ?? "")
  ).maybeSingle();
  if (!template) {
    return {
      error: isRm
        ? "This raw material has no COA template — add one on its Item Master page first."
        : "This product's MFR has no COA template — add one on its MFR page first.",
    };
  }

  // SCAN-P4-08 (Ravi, 12 Oct 2026): the certificate is issued for THIS batch and THIS
  // template. The header is rebuilt from the batch and QC record and the test list from the
  // template; only the results, the remarks and the hand-composed "Sampled Qty" wording
  // are taken from the form. Anything else that differs is refused.
  const draft = isRm ? await resolveRawMaterial(supabase, qc.id) : await resolveFinishedProduct(supabase, qc.id);
  if (!draft.ok) return { error: draft.reason };
  if (headerData.length !== draft.headerFields.length) {
    return { error: "The certificate header does not match this batch — reload the page and try again." };
  }
  for (let i = 0; i < draft.headerFields.length; i++) {
    const want = draft.headerFields[i];
    const got = headerData[i];
    if (String(got.label ?? "").trim().toLowerCase() !== want.label.trim().toLowerCase()) {
      return { error: "The certificate header does not match this batch — reload the page and try again." };
    }
    const handWritten = want.label.trim().toLowerCase() === "sampled qty";
    if (!handWritten && String(got.value ?? "").trim() !== want.value.trim()) {
      return {
        error: `"${want.label}" does not match the batch record ("${want.value}"). It is filled in from the batch and cannot be changed — reload the page and try again.`,
      };
    }
    if (handWritten && !String(got.value ?? "").trim()) {
      return { error: "Sampled Qty is required before generating the certificate." };
    }
    if (handWritten && String(got.value ?? "").length > 100) {
      return { error: "Sampled Qty must be 100 characters or fewer." };
    }
  }
  const templateLines = (template.coa_template_lines ?? []).slice().sort((a, b) => a.seq - b.seq);
  if (resultLines.length !== templateLines.length) {
    return { error: "The test list does not match the COA template — reload the page and try again." };
  }
  for (let i = 0; i < templateLines.length; i++) {
    const t = templateLines[i];
    const r = resultLines[i];
    if (Number(r.seq) !== t.seq || String(r.test ?? "") !== t.test || String(r.specification ?? "") !== t.specification) {
      return { error: `The test "${t.test}" or its specification differs from the COA template — reload the page and try again.` };
    }
    if (String(r.result ?? "").length > 500) {
      return { error: `The result for "${t.test}" must be 500 characters or fewer.` };
    }
  }
  // 0119 (Ravi, 12 Oct 2026): when QC recorded test results, the certificate carries QC's
  // final results (the QC Reviewer's if he edited any, otherwise the Quality Checker's);
  // nothing typed here can replace them. A record with no QC results, or results taken
  // against an earlier version of the template, keeps typing them here as before.
  const qcFinal = finalResults(qc);
  const qcMatchesTemplate =
    !!qcFinal &&
    qcFinal.length === templateLines.length &&
    qcFinal.every((l, i) => Number(l.seq) === templateLines[i].seq && l.test === templateLines[i].test && l.specification === templateLines[i].specification);
  if (qcMatchesTemplate && qcFinal) {
    for (let i = 0; i < templateLines.length; i++) {
      if (String(resultLines[i].result ?? "").trim() !== String(qcFinal[i].result ?? "").trim()) {
        return { error: `The result for "${templateLines[i].test}" comes from the QC record and cannot be changed here. Reload the page and try again.` };
      }
    }
  }
  // Store exactly what was checked, in the template's own order, not what the browser sent.
  headerData = draft.headerFields.map((f, i) => ({ label: f.label, value: String(headerData[i].value).trim() }));
  resultLines = templateLines.map((t, i) => ({
    seq: t.seq,
    test: t.test,
    specification: t.specification,
    result: String(resultLines[i].result).trim(),
  }));

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
      // SCAN-P2-13: the company details as they are now, kept with the certificate.
      company_snapshot: await fetchCompany(supabase),
      issued_by: user!.id,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: friendlyDbError(error, "Could not save the certificate.") };

  revalidatePath("/coa");
  redirect(`/coa/${inserted.id}?saved=coa_generated`);
}
