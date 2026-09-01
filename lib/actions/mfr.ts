"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

type LineInput = { itemId: string; quantity: number; unit: string };

// Recipe lines are submitted as item_0/quantity_0/unit_0 .. item_N/quantity_N/unit_N,
// with lineCount telling us how many slots the client rendered (some may have been
// removed client-side and are simply absent/blank — skip those instead of erroring).
function parseLines(formData: FormData): LineInput[] | { error: string } {
  const count = Number(formData.get("lineCount") || 0);
  const lines: LineInput[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = String(formData.get(`item_${i}`) || "");
    const rawQty = formData.get(`quantity_${i}`);
    const unit = String(formData.get(`unit_${i}`) || "");
    if (!itemId && !rawQty && !unit) continue; // removed row
    const quantity = Number(rawQty);
    if (!itemId) return { error: `Line ${i + 1}: item is required.` };
    if (!rawQty || !Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Line ${i + 1}: quantity must be greater than 0.` };
    }
    if (!unit) return { error: `Line ${i + 1}: unit is required.` };
    lines.push({ itemId, quantity, unit });
  }
  if (lines.length === 0) return { error: "Add at least one recipe line." };
  return lines;
}

// Every MFR is the recipe for exactly one Finished Product — per the
// "MFR screen be entry point for Finished Product master list creation"
// request, creating the MFR now also creates that item's Item Master
// entry (FP- coded, same numbering as Raw material/Packaging), instead of
// requiring a separate trip through Item Master. Item Master no longer
// offers "Finished product" as a create-able category at all (see
// CREATABLE_CATEGORIES in lib/actions/items.ts) — this screen is the only
// way a Finished Product item comes into existence from here on.
//
// Three inserts (item → mfr_definitions → mfr_lines), each with
// best-effort cleanup of what came before it on failure, since the
// Supabase client doesn't give us a real multi-statement transaction —
// same pattern this action already used for the definition+lines pair.
export async function createMfrDefinition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const batchSizeQty = Number(formData.get("batch_size_qty"));
  const batchSizeUnit = String(formData.get("batch_size_unit") || "");
  const itemTypeIdRaw = String(formData.get("item_type_id") || "");
  const itemTypeId = itemTypeIdRaw || null;

  if (!name) return { error: "Name is required." };
  if (!batchSizeQty || !Number.isFinite(batchSizeQty) || batchSizeQty <= 0) {
    return { error: "Batch size must be greater than 0." };
  }
  if (!batchSizeUnit) return { error: "Batch size unit is required." };

  const linesOrError = parseLines(formData);
  if ("error" in linesOrError) return linesOrError;
  const lines = linesOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: itemCode, error: itemCodeError } = await supabase.rpc("get_next_item_code", {
    p_category: "processed",
  });
  if (itemCodeError || !itemCode) {
    return { error: itemCodeError?.message || "Could not generate a Finished Product item code." };
  }

  const { data: item, error: itemError } = await supabase
    .from("items")
    .insert({
      item_code: itemCode,
      name,
      category: "processed",
      item_type_id: itemTypeId,
      unit: batchSizeUnit,
    })
    .select("id")
    .single();
  if (itemError || !item) {
    return { error: itemError?.message || "Could not create the Finished Product item." };
  }

  const { data: code, error: codeError } = await supabase.rpc("get_next_mfr_code");
  if (codeError || !code) {
    await supabase.from("items").delete().eq("id", item.id);
    return { error: codeError?.message || "Could not generate an MFR code." };
  }

  const { data: def, error: defError } = await supabase
    .from("mfr_definitions")
    .insert({
      code,
      name,
      batch_size_qty: batchSizeQty,
      batch_size_unit: batchSizeUnit,
      finished_product_item_id: item.id,
    })
    .select("id")
    .single();
  if (defError || !def) {
    await supabase.from("items").delete().eq("id", item.id);
    return { error: defError?.message || "Could not create the MFR definition." };
  }

  const { error: linesError } = await supabase.from("mfr_lines").insert(
    lines.map((l) => ({
      mfr_definition_id: def.id,
      version: 1,
      item_id: l.itemId,
      quantity: l.quantity,
      unit: l.unit,
    }))
  );
  if (linesError) {
    // Best-effort cleanup so a failed recipe insert doesn't leave a headerless
    // definition — or its linked Finished Product item — behind.
    await supabase.from("mfr_definitions").delete().eq("id", def.id);
    await supabase.from("items").delete().eq("id", item.id);
    return { error: linesError.message };
  }

  revalidatePath("/mfr");
  revalidatePath("/items");
  redirect(`/mfr/${def.id}`);
}

// Gap fix (DESIGN.md §4.7/§7.4): editing recipe lines never overwrites mfr_lines in
// place. It increments mfr_definitions.version and inserts a fresh set of mfr_lines
// tagged with that version — old versions stay in the table for history. Since the
// recipe changed, any prior approval no longer describes what's on file, so approval
// is cleared and must be re-granted against the new version.
export async function updateMfrLines(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const linesOrError = parseLines(formData);
  if ("error" in linesOrError) return linesOrError;
  const lines = linesOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: def, error: defError } = await supabase
    .from("mfr_definitions")
    .select("version")
    .eq("id", id)
    .single();
  if (defError || !def) return { error: defError?.message || "MFR definition not found." };

  const newVersion = def.version + 1;
  const { error: linesError } = await supabase.from("mfr_lines").insert(
    lines.map((l) => ({
      mfr_definition_id: id,
      version: newVersion,
      item_id: l.itemId,
      quantity: l.quantity,
      unit: l.unit,
    }))
  );
  if (linesError) return { error: linesError.message };

  const { error: updateError } = await supabase
    .from("mfr_definitions")
    .update({ version: newVersion, approved_by: null, approved_at: null })
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/mfr/${id}`);
  revalidatePath("/mfr");
  redirect(`/mfr/${id}`);
}

export async function approveMfrDefinition(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!canWrite(user.roles, "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: def, error: defError } = await supabase
    .from("mfr_definitions")
    .select("approved_by")
    .eq("id", id)
    .single();
  if (defError || !def) return { error: defError?.message || "MFR definition not found." };
  if (def.approved_by) return { error: "This MFR is already approved." };

  const { error } = await supabase
    .from("mfr_definitions")
    .update({ approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/mfr/${id}`);
  revalidatePath("/mfr");
  return { success: "MFR approved." };
}
