"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { UNITS } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// Categories this screen is allowed to create. 'processed' items are
// created by the Finished Product flow elsewhere (docs/DESIGN.md §4.2 /
// the task brief) — never offered here.
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
    return { error: "Category must be Raw Material or Packaging." };
  }
  if (unit && !UNITS.includes(unit as (typeof UNITS)[number])) return { error: "Invalid unit." };

  const default_qc_qty = numOrNull(formData, "default_qc_qty");
  if (default_qc_qty && typeof default_qc_qty === "object") return default_qc_qty;
  const default_stability_qty = numOrNull(formData, "default_stability_qty");
  if (default_stability_qty && typeof default_stability_qty === "object") return default_stability_qty;
  const default_rnd_qty = numOrNull(formData, "default_rnd_qty");
  if (default_rnd_qty && typeof default_rnd_qty === "object") return default_rnd_qty;
  const low_stock_threshold = numOrNull(formData, "low_stock_threshold");
  if (low_stock_threshold && typeof low_stock_threshold === "object") return low_stock_threshold;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: itemCode, error: codeError } = await supabase.rpc("get_next_item_code", {
    p_category: category,
  });
  if (codeError) return { error: `Could not generate item code: ${codeError.message}` };

  const { data: inserted, error } = await supabase
    .from("items")
    .insert({
      item_code: itemCode,
      name,
      botanical_alias,
      category,
      item_type_id,
      unit,
      default_qc_qty,
      default_stability_qty,
      default_rnd_qty,
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
  redirect(`/items/${inserted.id}`);
}

export async function updateItem(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const botanical_alias = String(formData.get("botanical_alias") || "").trim() || null;
  const item_type_id = String(formData.get("item_type_id") || "") || null;
  const unit = String(formData.get("unit") || "") || null;
  const barcode = String(formData.get("barcode") || "").trim() || null;
  const active = formData.get("active") === "on";

  // Category can only move between raw/packaging here; an item already
  // 'processed' keeps that category (the field is disabled in the form).
  const submittedCategory = String(formData.get("category") || "");

  if (!name) return { error: "Name is required." };
  if (unit && !UNITS.includes(unit as (typeof UNITS)[number])) return { error: "Invalid unit." };

  const default_qc_qty = numOrNull(formData, "default_qc_qty");
  if (default_qc_qty && typeof default_qc_qty === "object") return default_qc_qty;
  const default_stability_qty = numOrNull(formData, "default_stability_qty");
  if (default_stability_qty && typeof default_stability_qty === "object") return default_stability_qty;
  const default_rnd_qty = numOrNull(formData, "default_rnd_qty");
  if (default_rnd_qty && typeof default_rnd_qty === "object") return default_rnd_qty;
  const low_stock_threshold = numOrNull(formData, "low_stock_threshold");
  if (low_stock_threshold && typeof low_stock_threshold === "object") return low_stock_threshold;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "items")) return { error: "Not authorized." };

  const supabase = await createClient();

  const update: Record<string, unknown> = {
    name,
    botanical_alias,
    item_type_id,
    unit,
    default_qc_qty,
    default_stability_qty,
    default_rnd_qty,
    low_stock_threshold,
    barcode,
    active,
  };
  // Only allow the raw<->packaging swap; never let a client set category to
  // 'processed' or move a processed item out of it.
  if (CREATABLE_CATEGORIES.includes(submittedCategory as (typeof CREATABLE_CATEGORIES)[number])) {
    update.category = submittedCategory;
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
