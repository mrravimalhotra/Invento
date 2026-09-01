"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// "Maker" step — assign an AR number to an incoming raw-material batch and
// pull the sample out of stock (the pull itself is automatic: trg_qc_sample_pull
// in 0002_transactions.sql fires on this insert, this action never touches
// inventory_ledger directly).
export async function createQualityCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) return { error: "Not authorized." };

  const purchaseLineId = String(formData.get("purchase_line_id") || "");
  const sampleQtyRaw = formData.get("sample_qty");
  const sampleUnit = String(formData.get("sample_unit") || "").trim();
  const expiryDate = String(formData.get("expiry_date") || "");

  if (!purchaseLineId) return { error: "Select a batch." };
  if (!expiryDate) return { error: "Expiry date is required." };

  const sampleQty = sampleQtyRaw ? Number(sampleQtyRaw) : null;
  if (sampleQtyRaw && (sampleQty === null || !Number.isFinite(sampleQty) || sampleQty < 0)) {
    return { error: "Sample quantity must be a non-negative number." };
  }

  const supabase = await createClient();

  // Re-derive item_id from the batch server-side rather than trusting a
  // hidden form field, and confirm the batch is still open for QC.
  const { data: line, error: lineError } = await supabase
    .from("purchase_lines")
    .select("id, item_id")
    .eq("id", purchaseLineId)
    .maybeSingle();
  if (lineError || !line) return { error: "Selected batch could not be found." };

  const { data: status } = await supabase
    .from("purchase_batch_status")
    .select("qc_status")
    .eq("purchase_line_id", purchaseLineId)
    .maybeSingle();
  if (status && status.qc_status !== "not_submitted") {
    return { error: "This batch already has a QC record submitted against it." };
  }

  const { data: arNumber, error: arError } = await supabase.rpc("get_next_ar_number");
  if (arError || !arNumber) return { error: arError?.message ?? "Could not generate an AR number." };

  const { data: inserted, error } = await supabase
    .from("quality_checks")
    .insert({
      ar_number: arNumber,
      purchase_line_id: line.id,
      item_id: line.item_id,
      finished_product_batch_id: null,
      sample_qty: sampleQty,
      sample_unit: sampleUnit || null,
      expiry_date: expiryDate,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // quality_checks_purchase_line_unique (0015_qc_duplicate_backstop.sql)
      // — backstop for the check-above-then-insert race: someone else's
      // submission against this same batch landed between our check and
      // this insert.
      return { error: "This batch already has a QC record submitted against it." };
    }
    return { error: error.message };
  }

  revalidatePath("/qc");
  redirect(`/qc/${inserted.id}`);
}

// "Checker" step — final, one-way: once a record leaves 'submitted' it can
// never be edited again through this action (matches the existing baseline
// behavior, kept as-is per the module brief).
export async function reviewQualityCheck(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_review")) return { error: "Not authorized." };

  const status = String(formData.get("status") || "");
  if (status !== "approved" && status !== "rejected") {
    return { error: "Choose Approved or Rejected." };
  }

  const reviewComments = String(formData.get("review_comments") || "").trim();
  const retestPeriodRaw = formData.get("retest_period_days");
  const retestPeriodDays = retestPeriodRaw ? Number(retestPeriodRaw) : null;
  if (retestPeriodRaw && (retestPeriodDays === null || !Number.isFinite(retestPeriodDays) || retestPeriodDays <= 0)) {
    return { error: "Retest period must be a positive whole number of days." };
  }

  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("quality_checks")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) return { error: "Record not found." };
  if (existing.status !== "submitted") {
    return { error: "This record has already been reviewed and cannot be changed." };
  }

  const { error } = await supabase
    .from("quality_checks")
    .update({
      status,
      review_comments: reviewComments || null,
      retest_period_days: retestPeriodDays,
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/qc");
  revalidatePath(`/qc/${id}`);
  redirect(`/qc/${id}`);
}
