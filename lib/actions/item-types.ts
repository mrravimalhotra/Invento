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
