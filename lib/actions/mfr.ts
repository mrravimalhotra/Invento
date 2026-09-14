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
// request, this screen (not Item Master — see CREATABLE_CATEGORIES in
// lib/actions/items.ts) is the only way a Finished Product item ever
// comes into existence. Task F (claude/packaged-fp-redesign.md) pairs it
// with a second, 'packaged_fp' item (same name, its own PKG-FP-##### code)
// via items.packaged_item_id.
//
// Ravi (14 Sept 2026): "while creating MFR, transaction should be atomic,
// new MFR, Finished Product or Packaged Finished Product should only get
// created once MFR is approved otherwise there is no point of creating
// these." Two changes from the previous design:
//
// 1. This action no longer creates the Finished Product / Packaged FP
//    item pair at all — that moved to approveMfrDefinition() below, the
//    only place it happens now (see that function's header comment).
//    This just creates the recipe: mfr_definitions (unapproved,
//    finished_product_item_id left null) + its version-1 mfr_lines.
// 2. Both steps run inside one real Postgres transaction via the new
//    create_mfr_definition() RPC (0041_mfr_deferred_approval.sql),
//    replacing the old manual two-insert-with-best-effort-rollback
//    pattern — same "security definer function body = one transaction"
//    approach bulk_create_mfr_definitions() already used, now applied to
//    the single-entry path too. A mid-failure now genuinely rolls back
//    everything the call did, not just what a .delete() call after the
//    fact remembered to clean up.
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

  const { data, error } = await supabase.rpc("create_mfr_definition", {
    p_name: name,
    p_batch_size_qty: batchSizeQty,
    p_batch_size_unit: batchSizeUnit,
    p_item_type_id: itemTypeId,
    p_lines: lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit: l.unit })),
  });
  if (error) return { error: error.message };
  const def = (data as { id: string; code: string }[] | null)?.[0];
  if (!def) return { error: "Could not create the MFR definition." };

  revalidatePath("/mfr");
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

  // Optimistic lock, and deliberately done *before* inserting any lines:
  // only bump the header if version is still what we just read. Two
  // concurrent edits both reading version=1 would otherwise both insert
  // lines tagged version=2 and both "succeed," silently interleaving two
  // different recipes under one version number. Checking first means a
  // losing writer's lines are never inserted at all, instead of left behind
  // as an orphaned half-write next to the winner's.
  const { data: updated, error: updateError } = await supabase
    .from("mfr_definitions")
    .update({ version: newVersion, approved_by: null, approved_at: null })
    .eq("id", id)
    .eq("version", def.version)
    .select("id");
  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) {
    return {
      error:
        "This recipe was edited by someone else while you were working on it. Please reopen this MFR to see the current recipe, then re-apply your changes.",
    };
  }

  const { error: linesError } = await supabase.from("mfr_lines").insert(
    lines.map((l) => ({
      mfr_definition_id: id,
      version: newVersion,
      item_id: l.itemId,
      quantity: l.quantity,
      unit: l.unit,
    }))
  );
  if (linesError) {
    // We already bumped the header to newVersion, but the lines that should
    // back it failed to insert — revert the header rather than leaving
    // mfr_definitions.version pointing at a version with zero mfr_lines
    // rows (the detail page would render an empty recipe with no
    // indication anything went wrong).
    await supabase
      .from("mfr_definitions")
      .update({ version: def.version })
      .eq("id", id)
      .eq("version", newVersion);
    return { error: linesError.message };
  }

  revalidatePath(`/mfr/${id}`);
  revalidatePath("/mfr");
  redirect(`/mfr/${id}`);
}

// Delete is Admin-only, same convention as deleteItemType()/deleteItem()/
// deleteVendor() — canWrite() allows system_admin and mfr_manager, but
// delete is tighter. Matches the mfr_def_delete RLS policy in
// 0011_mfr_delete_policy.sql. mfr_lines for this definition (all versions)
// are removed automatically — mfr_lines.mfr_definition_id is `on delete
// cascade` (0001_init.sql) — so no separate cleanup step is needed here,
// unlike createMfrDefinition()'s manual multi-insert rollback. The linked
// Finished Product item (finished_product_item_id) is deliberately left
// alone: deleting the recipe doesn't delete the item it produces — that's
// still an independent Item Master record, deletable on its own (subject
// to its own FK checks) via deleteItem().
export async function deleteMfrDefinition(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete MFR records." };

  const supabase = await createClient();
  const { error } = await supabase.from("mfr_definitions").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      // finished_product_batches.mfr_definition_id has no ON DELETE clause
      // (RESTRICT, the Postgres default) — an MFR that's been used to
      // produce a batch can't be deleted. setMfrActive() below now gives
      // this a real fallback, so point at it the same way deleteItem()
      // points at its Active toggle, instead of a dead-end "remove those
      // first."
      return {
        error:
          "Can't delete — this MFR has finished product batches on file. Deactivate it instead.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/mfr");
  redirect("/mfr");
}

// Deactivate/reactivate — the write path for mfr_definitions.active, which
// existed in the schema since 0001_init.sql and is already READ in two
// places (the /mfr list's default filter, and finished-product/new's
// recipe picker) but until now had no screen that could ever set it to
// false. Same canWrite(roles, "mfr") gate as approve/edit — deliberately
// NOT restricted to system_admin like deleteMfrDefinition(): deactivating
// is reversible and much lower-stakes than deleting (it just retires a
// recipe from being picked for new production; nothing is removed), so an
// mfr_manager doesn't need an admin's help to do it.
export async function setMfrActive(id: string, active: boolean, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("mfr_definitions").update({ active }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/mfr");
  revalidatePath(`/mfr/${id}`);
  return { success: active ? "MFR reactivated." : "MFR deactivated." };
}

// The Finished Product / Packaged FP item pair now comes into existence
// HERE, not at MFR creation — see createMfrDefinition()'s header comment
// and 0041_mfr_deferred_approval.sql for the full reasoning (Ravi, 14
// Sept 2026: "...should only get created once MFR is approved otherwise
// there is no point of creating these"). The whole thing — the "already
// approved" guard, the item pair creation (first approval only; an edited
// recipe's re-approval reuses the pair already on file, never creates a
// second one), and setting approved_by/approved_at — runs as one
// transaction inside approve_mfr_definition(), replacing the old
// select-then-conditional-update optimistic lock with a real `for update`
// row lock (same concurrent-double-click protection, enforced by Postgres
// itself now instead of a second round trip from the app).
export async function approveMfrDefinition(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!canWrite(user.roles, "mfr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_mfr_definition", { p_id: id });
  if (error) return { error: error.message };
  const result = (data as { fp_item_code: string | null; packaged_item_code: string | null; items_created: boolean }[] | null)?.[0];

  revalidatePath(`/mfr/${id}`);
  revalidatePath("/mfr");
  revalidatePath("/items");
  return {
    success:
      result?.items_created && result.fp_item_code
        ? `MFR approved — created Finished Product ${result.fp_item_code}${result.packaged_item_code ? ` and Packaged Finished Product ${result.packaged_item_code}` : ""}.`
        : "MFR approved.",
  };
}
