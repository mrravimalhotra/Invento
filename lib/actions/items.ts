"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// Categories this screen is allowed to create/edit directly. 'processed'
// ("Finished Product") is deliberately NOT here — per the "MFR screen be
// entry point for Finished Product master list creation" request, a
// Finished Product item can now only come into existence alongside an MFR
// recipe (createMfrDefinition() in lib/actions/mfr.ts creates both
// together). This screen still lists and edits existing 'processed' items
// (including ones created before this change), it just can't create new
// ones or promote a raw/packaging item into one.
const CREATABLE_CATEGORIES = ["raw", "packaging"] as const;

function numOrNull(formData: FormData, key: string): number | null | { error: string } {
  const raw = String(formData.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return { error: `${key} must be a number.` };
  return n;
}

export async function createItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const botanical_alias = String(formData.get("botanical_alias") || "").trim() || null;
  const category = String(formData.get("category") || "");
  const item_type_id = String(formData.get("item_type_id") || "") || null;
  const unit = String(formData.get("unit") || "") || null;
  const barcode = String(formData.get("barcode") || "").trim() || null;

  if (!name) return { error: "Name is required." };
  if (!CREATABLE_CATEGORIES.includes(category as (typeof CREATABLE_CATEGORIES)[number])) {
    return {
      error:
        category === "processed"
          ? "Finished Product items are created from the MFR screen, not here — go to MFR → New MFR."
          : "Category must be Raw Material or Packaging.",
    };
  }
  if (unit && !UNITS.includes(unit as (typeof UNITS)[number])) return { error: "Invalid unit." };

  const low_stock_threshold = numOrNull(formData, "low_stock_threshold");
  if (low_stock_threshold && typeof low_stock_threshold === "object") return low_stock_threshold;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: itemCode, error: codeError } = await supabase.rpc("get_next_item_code", {
    p_category: category,
  });
  if (codeError) return { error: `Could not generate item code: ${codeError.message}` };

  // default_qc_qty / default_stability_qty / default_rnd_qty /
  // default_sample_unit are deliberately NOT set here (2 Sept 2026 — "no
  // need to capture QC/Stability/R&D Quantity while creating new item
  // entry, it will be done at Purchase screen"): they're left null on
  // insert and captured instead per-batch at Purchase (Raw Material /
  // Packaging) or at Finished Product → New Batch. Purchase's Add-line
  // form already handles a null item default gracefully (falls back to
  // "0" / the line's own unit), so no change was needed there.
  const { data: inserted, error } = await supabase
    .from("items")
    .insert({
      item_code: itemCode,
      name,
      botanical_alias,
      category,
      item_type_id,
      unit,
      low_stock_threshold,
      barcode,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "This barcode is already in use." : "That item code already exists." };
    }
    return { error: error.message };
  }

  revalidatePath("/items");
  // FB-0005: ?created=1 flags the detail page to show a one-time success
  // banner — createItem redirects (unlike updateItem, which stays on the
  // same page and can just return {success}), so the confirmation has to
  // travel via the URL instead of component state.
  redirect(`/items/${inserted.id}?created=1`);
}

export async function updateItem(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const botanical_alias = String(formData.get("botanical_alias") || "").trim() || null;
  const item_type_id = String(formData.get("item_type_id") || "") || null;
  const unit = String(formData.get("unit") || "") || null;
  const barcode = String(formData.get("barcode") || "").trim() || null;
  const active = formData.get("active") === "on";

  // Category is only free to move between raw <-> packaging here.
  // 'processed' ("Finished Product") is a one-way, MFR-only door: an item
  // that's already 'processed' stays 'processed' (its detail page renders
  // Category as fixed, not a select, once it's linked to an MFR the same
  // way an item can't be deleted out from under one — see deleteItem()),
  // and a raw/packaging item can't be promoted into 'processed' from here,
  // since that would recreate an FP item with no MFR behind it. See
  // CREATABLE_CATEGORIES above for why 'processed' creation moved to MFR.
  const submittedCategory = String(formData.get("category") || "");

  if (!name) return { error: "Name is required." };
  if (unit && !UNITS.includes(unit as (typeof UNITS)[number])) return { error: "Invalid unit." };

  const low_stock_threshold = numOrNull(formData, "low_stock_threshold");
  if (low_stock_threshold && typeof low_stock_threshold === "object") return low_stock_threshold;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("items")
    .select("category")
    .eq("id", id)
    .single();
  if (existingError || !existing) return { error: existingError?.message || "Item not found." };

  // default_qc_qty / default_stability_qty / default_rnd_qty /
  // default_sample_unit are deliberately NOT in this update object (2 Sept
  // 2026 — the Item Master form no longer has fields for them, per "no
  // need to capture QC/Stability/R&D Quantity while creating new item
  // entry, it will be done at Purchase screen"). If they were included
  // here read from a formData that no longer sends them, every future
  // save of an EXISTING item — even something as small as a name edit —
  // would silently overwrite that item's legacy default values with null.
  // Leaving them out of `update` entirely means saving an item never
  // touches these columns; any pre-existing values on legacy items are
  // left exactly as they are.
  const update: Record<string, unknown> = {
    name,
    botanical_alias,
    item_type_id,
    unit,
    low_stock_threshold,
    barcode,
    active,
  };
  if (existing.category === "processed") {
    // Locked — see the comment above. The edit form doesn't render an
    // editable Category field for these, so this is a defensive backstop,
    // not the primary guard.
    update.category = "processed";
  } else if (CREATABLE_CATEGORIES.includes(submittedCategory as (typeof CREATABLE_CATEGORIES)[number])) {
    update.category = submittedCategory;
  } else if (submittedCategory === "processed") {
    return { error: "Finished Product items are created from the MFR screen, not here — go to MFR → New MFR." };
  } else {
    return { error: "Category must be Raw Material or Packaging." };
  }

  const { error } = await supabase.from("items").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: error.message.includes("barcode") ? "This barcode is already in use." : "Duplicate value." };
    }
    return { error: error.message };
  }

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { success: "Item saved." };
}

export async function deleteItem(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  // Delete is intentionally gated tighter than create/update — canWrite()
  // allows system_admin, inventory_manager and mfr_manager, but delete is
  // Admin-only, same convention as deleteItemType() in
  // lib/actions/item-types.ts (FB-0004). Matches the items_delete RLS
  // policy in 0009_master_data_delete_policy.sql.
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete items." };

  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Can't delete — this item has purchase, QC, inventory, production, or MFR records on file. Deactivate it instead.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/items");
  redirect("/items");
}
