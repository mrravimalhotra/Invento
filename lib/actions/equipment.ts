"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";

export type ActionState = { error?: string; success?: string } | undefined;

const CALIBRATION_STATUSES = ["calibrated", "due", "not_applicable"] as const;

const equipmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  room_no: z.string().trim().optional(),
  section: z.string().trim().optional(),
  legacy_asset_id: z.string().trim().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than zero.").default(1),
  calibration_status: z
    .string()
    .trim()
    .refine((v) => v === "" || (CALIBRATION_STATUSES as readonly string[]).includes(v), {
      message: "Invalid calibration status.",
    })
    .optional(),
  last_calibration_date: z.string().trim().optional(),
  next_calibration_due: z.string().trim().optional(),
});

function parseEquipmentForm(formData: FormData) {
  return equipmentSchema.safeParse({
    name: String(formData.get("name") || ""),
    room_no: String(formData.get("room_no") || ""),
    section: String(formData.get("section") || ""),
    legacy_asset_id: String(formData.get("legacy_asset_id") || ""),
    quantity: String(formData.get("quantity") || "1"),
    calibration_status: String(formData.get("calibration_status") || ""),
    last_calibration_date: String(formData.get("last_calibration_date") || ""),
    next_calibration_due: String(formData.get("next_calibration_due") || ""),
  });
}

export async function createEquipment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "equipment")) return { error: "Not authorized." };

  const parsed = parseEquipmentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: equipmentCode, error: codeError } = await supabase.rpc("get_next_equipment_code");
  if (codeError) return { error: codeError.message };

  const { error } = await supabase.from("equipment").insert({
    equipment_code: equipmentCode,
    name: parsed.data.name,
    room_no: parsed.data.room_no || null,
    section: parsed.data.section || null,
    legacy_asset_id: parsed.data.legacy_asset_id || null,
    quantity: parsed.data.quantity,
    calibration_status: parsed.data.calibration_status || null,
    last_calibration_date: parsed.data.last_calibration_date || null,
    next_calibration_due: parsed.data.next_calibration_due || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/equipment");
  // Same "add form lives inline on the list page" pattern as Vendor Master
  // (see createVendor()) — ?created= carries the code so the list page can
  // show a one-time success banner without a detail-page round trip.
  redirect(`/equipment?created=${encodeURIComponent(equipmentCode)}`);
}

export async function updateEquipment(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "equipment")) return { error: "Not authorized." };

  const parsed = parseEquipmentForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const active = formData.get("active") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("equipment")
    .update({
      name: parsed.data.name,
      room_no: parsed.data.room_no || null,
      section: parsed.data.section || null,
      legacy_asset_id: parsed.data.legacy_asset_id || null,
      quantity: parsed.data.quantity,
      calibration_status: parsed.data.calibration_status || null,
      last_calibration_date: parsed.data.last_calibration_date || null,
      next_calibration_due: parsed.data.next_calibration_due || null,
      active,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/equipment");
  revalidatePath(`/equipment/${id}`);
  return { success: "Equipment updated." };
}

export async function deleteEquipment(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  // Admin-only, same convention as every other master-data delete
  // (deleteItemType/deleteItem/deleteVendor) — matches the equipment_delete
  // RLS policy in 0034_equipment_master.sql.
  const user = await getCurrentUser();
  if (!user?.roles?.includes("system_admin")) return { error: "Only System Admin can delete equipment." };

  const supabase = await createClient();
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/equipment");
  redirect("/equipment");
}
