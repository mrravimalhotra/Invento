"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createCoaRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "coa")) return { error: "Not authorized." };

  const qualityCheckId = String(formData.get("quality_check_id") || "");
  const fileUrl = String(formData.get("file_url") || "").trim();
  if (!qualityCheckId) return { error: "Select an approved quality check." };

  const supabase = await createClient();

  // Re-check the QC record is actually approved server-side rather than
  // trusting the dropdown was built from a correctly-filtered list.
  const { data: qc, error: qcError } = await supabase
    .from("quality_checks")
    .select("id, status, finished_product_batch_id")
    .eq("id", qualityCheckId)
    .maybeSingle();
  if (qcError || !qc) return { error: "Selected quality check could not be found." };
  if (qc.status !== "approved") return { error: "Only an Approved quality check can be issued a COA." };

  const { data: coaNumber, error: coaNumError } = await supabase.rpc("get_next_coa_number");
  if (coaNumError || !coaNumber) return { error: coaNumError?.message ?? "Could not generate a COA number." };

  const { error } = await supabase.from("coa_records").insert({
    coa_number: coaNumber,
    quality_check_id: qc.id,
    finished_product_batch_id: qc.finished_product_batch_id,
    issued_by: user!.id,
    file_url: fileUrl || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/coa");
  redirect("/coa?created=1");
}
