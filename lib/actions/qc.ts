"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionState = { error?: string; success?: string } | undefined;

// Assign step — assign an AR number to an incoming raw-material batch and
// record the sample. This does not move stock (ACC-38, 29 Sept 2026): since
// 0028 the QC sample is pulled when the purchase order is submitted
// (submit_purchase_order) and trg_qc_sample_pull is retired to a no-op. Whoever assigns an AR is no longer tracked as
// a distinct "maker" identity (20 Sept 2026, see docs/modules/qc.md's
// "Two-round QC review" entry) — they may go on to be its own Round 1 QC
// Checker.
export async function createQualityCheck(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) return { error: "Not authorized." };

  const purchaseLineId = String(formData.get("purchase_line_id") || "");
  const sampleQtyRaw = formData.get("sample_qty");
  const sampleUnit = String(formData.get("sample_unit") || "").trim();

  if (!purchaseLineId) return { error: "Select a batch." };

  const sampleQty = sampleQtyRaw ? Number(sampleQtyRaw) : null;
  if (sampleQtyRaw && (sampleQty === null || !Number.isFinite(sampleQty) || sampleQty < 0)) {
    return { error: "Sample quantity must be a non-negative number." };
  }

  const supabase = await createClient();

  // Re-derive item_id from the batch server-side rather than trusting a
  // hidden form field, and confirm the batch is still open for QC.
  const { data: line, error: lineError } = await supabase
    .from("purchase_lines")
    .select("id, item_id, pushed_at")
    .eq("id", purchaseLineId)
    .maybeSingle();
  if (lineError || !line) return { error: "Selected batch could not be found." };
  // ACC-06 (29 Sept 2026): only a batch whose purchase order is submitted is
  // in stock — a draft (or reopened) PO's batch can't be sampled for QC.
  if (!line.pushed_at) {
    return { error: "This batch's purchase order isn't submitted (it may have been reopened for editing). Submit it first." };
  }

  const { data: status } = await supabase
    .from("purchase_batch_status")
    .select("qc_status")
    .eq("purchase_line_id", purchaseLineId)
    .maybeSingle();
  if (status && status.qc_status !== "not_submitted") {
    return { error: "This batch already has a QC record submitted against it." };
  }

  const { data: arNumber, error: arError } = await supabase.rpc("get_next_ar_number");
  if (arError || !arNumber) return { error: friendlyDbError(arError, "Could not generate an AR number.") };

  const { data: inserted, error } = await supabase
    .from("quality_checks")
    .insert({
      ar_number: arNumber,
      purchase_line_id: line.id,
      item_id: line.item_id,
      finished_product_batch_id: null,
      sample_qty: sampleQty,
      sample_unit: sampleUnit || null,
      // expiry_date (3 Sept 2026): no longer collected here — see the
      // matching comment in lib/actions/purchase.ts. The retest workflow
      // relies solely on quality_checks.retest_date, computed automatically
      // by trg_qc_compute_retest_date from Retest period (days) + the
      // review date at Round 2 (reviewQcRound2 below); nothing needs a
      // manually-entered expiry to work.
      // created_by: who assigned this AR — recorded for audit only, not
      // enforced as a distinct "maker" identity (20 Sept 2026 — see
      // reviewQcRound1/reviewQcRound2 below).
      created_by: user!.id,
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
    return { error: friendlyDbError(error) };
  }

  revalidatePath("/qc");
  redirect(`/qc/${inserted.id}`);
}

// Two-round review (20 Sept 2026, replacing the old single-decision
// reviewQualityCheck): Ravi — "the first round of approval will be given
// by Quality Checker... If approved, it will show as approved - Awaiting
// Review and will be moved from QC Checker's queue to QC Reviewer's
// queue... One QC Reviewer approves it, the batch will be shown as Fully
// QC approved." No separate "assignee/maker" identity is enforced any
// more (Ravi's own correction — "no need for the assignee role, 2 roles
// suffice") — only that Round 2's actor differs from Round 1's. Both
// actions are final/one-way for their own round, same "can't be re-edited
// once decided" posture the old single-step action had.

// Round 1 — "QC Checker": submitted -> checker_approved/rejected. No
// retest period here — the batch isn't actually usable yet even on
// approval (Round 2 still has to clear it), so asking for a retest period
// this early would be premature; it's collected at Round 2 instead, right
// when it starts to matter.
export async function reviewQcRound1(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_review_round1")) return { error: "Not authorized." };

  const status = String(formData.get("status") || "");
  if (status !== "checker_approved" && status !== "rejected") {
    return { error: "Choose Approved or Rejected." };
  }
  const checkerComments = String(formData.get("checker_comments") || "").trim();

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("quality_checks")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) return { error: "Record not found." };
  if (existing.status !== "submitted") {
    return { error: "This record has already had its first QC decision and cannot be changed." };
  }

  const { error } = await supabase
    .from("quality_checks")
    .update({
      status,
      checker_comments: checkerComments || null,
      checker_by: user!.id,
      checker_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/qc");
  revalidatePath(`/qc/${id}`);
  redirect(`/qc/${id}`);
}

// Round 2 — "QC Reviewer": checker_approved -> approved/rejected. This is
// the decision that actually clears the batch into inventory (on
// approve) — retest period stays mandatory-on-approve here, same rule the
// old single-step action had (Ravi, 14 Sept 2026: "make retest period
// entry mandatory," approve-only, since a rejected batch is never
// retested).
export async function reviewQcRound2(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_review_round2")) return { error: "Not authorized." };

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
  if (status === "approved" && !retestPeriodRaw) {
    return { error: "Retest period (days) is required to approve a batch." };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("quality_checks")
    .select("status, checker_by")
    .eq("id", id)
    .maybeSingle();
  if (existingError || !existing) return { error: "Record not found." };
  if (existing.status !== "checker_approved") {
    return { error: "This record isn't awaiting a final QC Reviewer decision." };
  }
  // Two-round distinctness (20 Sept 2026, retiring the old maker/checker
  // created_by check): the QC Reviewer must differ from whoever made the
  // Round 1 (QC Checker) decision — System Admin exempt. This is the
  // friendly, early version; 0054_qc_two_round_review.sql's trigger is
  // the real backstop that can't be bypassed even if this check is ever
  // skipped by a bug here.
  const isSameAsChecker = existing.checker_by != null && existing.checker_by === user!.id;
  const isAdmin = (user!.roles ?? []).includes("system_admin");
  if (isSameAsChecker && !isAdmin) {
    return { error: "You made the first QC decision — a different QC Reviewer must make the final decision." };
  }

  const { error } = await supabase
    .from("quality_checks")
    .update({
      status,
      review_comments: reviewComments || null,
      retest_period_days: status === "approved" ? retestPeriodDays : null,
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/qc");
  revalidatePath(`/qc/${id}`);
  redirect(`/qc/${id}`);
}

// Retest workflow (Part B) — once an approved batch's QC-computed
// retest_date has arrived, this starts a new QC record against the same
// purchase_line using the stability sample already reserved at Purchase
// time, instead of a fresh sample pull. One-click action, no form fields:
// every value it needs is re-derived from the database, matching the
// non-destructive/server-re-derived pattern used elsewhere in this file.
export async function startRetestQualityCheck(
  purchaseLineId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return startRetest({ purchaseLineId, productionBatchId: null }, formData);
}

// ACC-10 / ACC-16 (29 Sept 2026): a retest takes the sample size entered on
// the "Due for retest" card, drawn from the batch's stability reserve first
// and only the rest from its remaining stock — start_retest() (0080) does
// the checks and the stock movement in one transaction. Before, a retest
// always recorded the FULL stability reserve as its sample (which never went
// down), and a batch with no reserve could never be retested at all.
async function startRetest(
  batch: { purchaseLineId: string | null; productionBatchId: string | null },
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) return { error: "Not authorized." };

  const sampleQty = Number(formData.get("sample_qty"));
  const sampleUnit = String(formData.get("sample_unit") || "").trim();
  if (!Number.isFinite(sampleQty) || sampleQty <= 0) return { error: "Enter the retest sample quantity." };
  if (!sampleUnit) return { error: "Select the sample unit." };

  const supabase = await createClient();
  const { data: qcId, error } = await supabase.rpc("start_retest", {
    p_purchase_line_id: batch.purchaseLineId,
    p_production_batch_id: batch.productionBatchId,
    p_sample_qty: sampleQty,
    p_sample_unit: sampleUnit,
  });
  if (error) {
    if (error.code === "23505") {
      // one-open-QC-per-batch unique index (0025 / 0068)
      return { error: "This batch already has a QC record submitted against it." };
    }
    return { error: friendlyDbError(error) };
  }

  revalidatePath("/qc");
  redirect(`/qc/${qcId as string}`);
}

// FB-0043 (28 Sept 2026) — Production-issued RM equivalent of
// createQualityCheck above. One-click, no form fields: unlike a purchased
// batch (where sample_qty/unit are chosen at AR-assign time), a
// Production issue's QC/Stability/R&D quantities were already fixed on
// the Packaging New Issue form at the moment the batch was created
// (production_issue_batches.qc_qty, in the batch's own unit) — same
// "already fixed at source, nothing left to enter" reasoning
// submitFinishedProductToQc() uses for Finished Product batches. Confirmed
// decision #3: raised manually (this action), never auto-submitted.
export async function createProductionQualityCheck(
  productionBatchId: string,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from("production_issue_batches")
    .select("id, item_id, qc_qty, unit")
    .eq("id", productionBatchId)
    .maybeSingle();
  if (batchError || !batch) return { error: "Selected batch could not be found." };

  const { data: status } = await supabase
    .from("production_batch_status")
    .select("qc_status")
    .eq("production_batch_id", productionBatchId)
    .maybeSingle();
  if (status && status.qc_status !== "not_submitted") {
    return { error: "This batch already has a QC record submitted against it." };
  }

  const { data: arNumber, error: arError } = await supabase.rpc("get_next_ar_number");
  if (arError || !arNumber) return { error: friendlyDbError(arError, "Could not generate an AR number.") };

  const { data: inserted, error: insertError } = await supabase
    .from("quality_checks")
    .insert({
      ar_number: arNumber,
      production_batch_id: batch.id,
      item_id: batch.item_id,
      purchase_line_id: null,
      finished_product_batch_id: null,
      sample_qty: batch.qc_qty,
      sample_unit: batch.unit,
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      // quality_checks_production_batch_pending_unique (0068) — another
      // submission against this batch landed between our check and this
      // insert.
      return { error: "This batch already has a QC record submitted against it." };
    }
    return { error: friendlyDbError(insertError) };
  }

  revalidatePath("/qc");
  redirect(`/qc/${inserted.id}`);
}

// Production equivalent of startRetestQualityCheck above — same one-click,
// no-form pattern, pulling from production_issue_batches.stability_qty
// (reserved once at issue time) instead of purchase_lines.stability_qty.
export async function startProductionRetestQualityCheck(
  productionBatchId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  return startRetest({ purchaseLineId: null, productionBatchId }, formData);
}
