"use server";

import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { COA_TEMPLATE_COLUMNS } from "@/lib/bulk-upload/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { cell, loadSheetOrError, type BulkUploadState } from "@/lib/bulk-upload/server";

// ------------------------------------------------------------------
// COA Templates
// ------------------------------------------------------------------
// Ravi (22 Sept 2026, reworked 3 Oct 2026): one row = one Test/Specification
// line; rows sharing the same Code are grouped into one template. Since
// 3 Oct a template belongs to a raw material (Code = Item Code, e.g. RM-001)
// or to an MFR (Code = MFR Code), not to an Item Type. Goes through the
// bulk_create_coa_templates() RPC for all-or-nothing atomicity.
type CoaTemplateGroupPayload = {
  item_id?: string;
  mfr_definition_id?: string;
  lines: { test: string; specification: string }[];
};

export async function bulkUploadCoaTemplates(_prev: BulkUploadState, formData: FormData): Promise<BulkUploadState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const loaded = await loadSheetOrError(formData, COA_TEMPLATE_COLUMNS, "coa-templates");
  if ("error" in loaded) return { error: loaded.error };
  const { headers, rows, rowNumbers } = loaded.sheet;

  const supabase = await createClient();
  const [{ data: rawItems }, { data: mfrs }, { data: existingTemplates }] = await Promise.all([
    fetchAllRows((from, to) => supabase.from("items").select("id, item_code, name").eq("category", "raw").eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("mfr_definitions").select("id, code, name, items:finished_product_item_id(item_code)").eq("active", true).order("id", { ascending: true }).range(from, to)),
    fetchAllRows((from, to) => supabase.from("coa_templates").select("item_id, mfr_definition_id").order("id", { ascending: true }).range(from, to)),
  ]);
  // Item codes and MFR codes are unique in the database, so a code resolves to at most one record.
  const itemByCode = new Map((rawItems ?? []).map((i) => [i.item_code.trim().toLowerCase(), i]));
  // A finished product is identified by its Finished Product item code (FP-00001); the MFR code
  // (MFR-0001) is also accepted, and is the only code before the MFR is approved.
  const mfrByCode = new Map<string, NonNullable<typeof mfrs>[number]>();
  for (const m of mfrs ?? []) {
    mfrByCode.set(m.code.trim().toLowerCase(), m);
    const fpCode = (m.items as unknown as { item_code: string } | null)?.item_code;
    if (fpCode) mfrByCode.set(fpCode.trim().toLowerCase(), m);
  }
  const templatedItemIds = new Set((existingTemplates ?? []).map((t) => t.item_id).filter(Boolean));
  const templatedMfrIds = new Set((existingTemplates ?? []).map((t) => t.mfr_definition_id).filter(Boolean));

  const rowErrors: string[] = [];
  const groups = new Map<string, { kind: "item" | "mfr"; id: string; lines: { test: string; specification: string }[] }>();

  rows.forEach((row, i) => {
    const r = rowNumbers[i];
    const codeRaw = cell(row, headers, COA_TEMPLATE_COLUMNS[0]).trim();
    const testRaw = cell(row, headers, COA_TEMPLATE_COLUMNS[1]);
    const specRaw = cell(row, headers, COA_TEMPLATE_COLUMNS[2]);

    const item = itemByCode.get(codeRaw.toLowerCase());
    const mfr = mfrByCode.get(codeRaw.toLowerCase());
    if (!codeRaw || (!item && !mfr)) {
      rowErrors.push(`Row ${r}: Code "${codeRaw}" is not the Item Code of an active raw material or the Finished Product code (or MFR code) of an active MFR.`);
      return;
    }
    if (!testRaw || !specRaw) {
      rowErrors.push(`Row ${r} ("${codeRaw}"): Test and Specification are both required.`);
      return;
    }

    const key = item ? `i:${item.id}` : `m:${mfr!.id}`;
    const existing = groups.get(key);
    if (!existing) {
      const alreadyHas = item ? templatedItemIds.has(item.id) : templatedMfrIds.has(mfr!.id);
      if (alreadyHas) {
        rowErrors.push(`Row ${r}: "${codeRaw}" already has a COA template — edit it on its own page instead of uploading it again.`);
        return;
      }
      groups.set(key, { kind: item ? "item" : "mfr", id: item ? item.id : mfr!.id, lines: [{ test: testRaw, specification: specRaw }] });
      return;
    }
    existing.lines.push({ test: testRaw, specification: specRaw });
  });

  if (rowErrors.length > 0) {
    return { error: `Found ${rowErrors.length} problem${rowErrors.length > 1 ? "s" : ""} — nothing was imported.`, rowErrors };
  }

  const payload: CoaTemplateGroupPayload[] = Array.from(groups.values()).map((g) =>
    g.kind === "item" ? { item_id: g.id, lines: g.lines } : { mfr_definition_id: g.id, lines: g.lines }
  );
  if (payload.length === 0) return { error: "No COA template rows found in that file." };

  const { data, error } = await supabase.rpc("bulk_create_coa_templates", { p_payload: payload });
  if (error) return { error: friendlyDbError(error, "Nothing was imported — the COA template upload failed.") };

  revalidatePath("/coa/templates");
  const templateCount = data?.length ?? payload.length;
  const lineCount = payload.reduce((sum, p) => sum + p.lines.length, 0);
  return {
    success: `Imported ${templateCount} COA template${templateCount === 1 ? "" : "s"} (${lineCount} test${lineCount === 1 ? "" : "s"}).`,
  };
}
