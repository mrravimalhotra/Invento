"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createItemType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const description = String(formData.get("description") || "").trim();
  if (!description) return { error: "Description is required." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "item_types")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("item_types").insert({ description });
  if (error) {
    if (error.code === "23505") return { error: "An item type with this description already exists." };
    return { error: error.message };
  }

  revalidatePath("/item-types");
  // No redirect — the add form lives inline on /item-types (see
  // docs/modules/item-types.md), so staying put and surfacing a success
  // message lets the person add several item types back-to-back without
  // a page round-trip.
  return { success: `New item type "${description}" has been successfully added.` };
}

export async function updateItemType(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const description = String(formData.get("description") || "").trim();
  const active = formData.get("active") === "on";
  if (!description) return { error: "Description is required." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "item_types")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("item_types").update({ description, active }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "An item type with this description already exists." };
    return { error: error.message };
  }

  revalidatePath("/item-types");
  revalidatePath(`/item-types/${id}`);
  redirect("/item-types");
}

export async function deleteItemType(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  // FB-0004: delete is intentionally gated tighter than the other item-type
  // actions — canWrite() allows system_admin, inventory_manager and
  // mfr_manager, but the ticket specifically asked for Admin-only delete, so
  // this checks the role directly. Matches the item_types_delete RLS policy
  // in 0008_item_type_delete_policy.sql (app check is UI-affordance only,
  // RLS is the real backstop).
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete item types." };

  const supabase = await createClient();
  const { error } = await supabase.from("item_types").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Can't delete — one or more items in Item Master still use this item type. Reassign or remove those items first, or deactivate this item type instead.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/item-types");
  redirect("/item-types");
}
