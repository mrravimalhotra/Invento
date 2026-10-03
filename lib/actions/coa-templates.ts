"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/db-errors";
import { parseCoaTemplateLines } from "@/lib/coa-template-lines";

export type ActionState = { error?: string; success?: string } | undefined;

// Ravi (3 Oct 2026): COA templates belong to each raw material and each
// MFR, not to an Item Type (see 0096_coa_template_per_item.sql). One call
// creates the template (first save) or replaces its tests in place; the
// database function also writes a revision row for the history screen.
// Who may save: whoever may edit the item (Item Master writers) or the MFR
// (System Admin, MFR Manager) — checked here for a friendly message and
// again inside upsert_coa_template().
async function saveTemplate(
  kind: "item" | "mfr",
  subjectId: string,
  formData: FormData
): Promise<ActionState> {
  const linesOrError = parseCoaTemplateLines(formData, { optional: false });
  if ("error" in linesOrError) return linesOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], kind === "item" ? "items" : "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_coa_template", {
    p_item_id: kind === "item" ? subjectId : null,
    p_mfr_definition_id: kind === "mfr" ? subjectId : null,
    p_lines: linesOrError,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath(kind === "item" ? `/items/${subjectId}` : `/mfr/${subjectId}`);
  revalidatePath("/coa/templates");
  return { success: "COA template saved." };
}

export async function saveItemCoaTemplate(itemId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveTemplate("item", itemId, formData);
}

export async function saveMfrCoaTemplate(mfrId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return saveTemplate("mfr", mfrId, formData);
}
