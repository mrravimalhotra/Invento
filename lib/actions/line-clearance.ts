"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createLineClearanceCheck(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const area = String(formData.get("area") || "").trim();
  const batchReference = String(formData.get("batch_reference") || "").trim();
  const status = String(formData.get("status") || "");

  if (!area) return { error: "Area is required." };
  if (status !== "clear" && status !== "not_clear") return { error: "Status is required." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "line_clearance")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("line_clearance_checks").insert({
    area,
    batch_reference: batchReference || null,
    status,
    checked_by: user!.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/line-clearance");
  redirect("/line-clearance?created=1");
}
