"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export type EditableTemplateLine = { test: string; specification: string };

// Same formData shape/parsing convention as parseProcedureSteps
// (lib/actions/mfr.ts) — stepCount/rowCount + indexed fields, so a row
// removed client-side (both fields blank) is silently dropped rather than
// erroring, and any row with only one side filled in is a real validation
// error.
function parseTemplateLines(formData: FormData): EditableTemplateLine[] | { error: string } {
  const count = Number(formData.get("lineCount") || 0);
  const lines: EditableTemplateLine[] = [];
  for (let i = 0; i < count; i++) {
    const test = String(formData.get(`test_${i}`) || "").trim();
    const specification = String(formData.get(`specification_${i}`) || "").trim();
    if (!test && !specification) continue; // removed row
    if (!test) return { error: `Row ${i + 1}: Test is required.` };
    if (!specification) return { error: `Row ${i + 1}: Specification is required.` };
    lines.push({ test, specification });
  }
  if (lines.length === 0) return { error: "At least one test is required." };
  return lines;
}

// Ravi (22 Sept 2026) — Certificate of Analysis templates, step 1 of the
// COA generation feature (see 0059_coa_templates.sql for the full design
// story). One call creates-or-updates the item type's template and
// replaces its lines in place — same "no versioning, edit in place"
// shape as updateMfrProcedure(), via the same kind of security definer
// RPC (upsert_coa_template()) so the whole replace happens in one
// transaction.
export async function upsertCoaTemplate(itemTypeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const linesOrError = parseTemplateLines(formData);
  if ("error" in linesOrError) return linesOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "coa")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_coa_template", {
    p_item_type_id: itemTypeId,
    p_lines: linesOrError,
  });
  if (error) return { error: error.message };

  revalidatePath("/coa/templates");
  revalidatePath(`/coa/templates/${itemTypeId}`);
  redirect(`/coa/templates/${itemTypeId}?saved=1`);
}
