"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// Assign step — assign an AR number to an incoming raw-material batch and
// pull the sample out of stock (the pull itself is automatic: trg_qc_sample_pull
// in 0002_transactions.sql fires on this insert, this action never touches
// inventory_ledger directly). Whoever assigns an AR is no longer tracked as
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
    return { error: error.message };
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
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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
  _formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) return { error: "Not authorized." };

  const supabase = await createClient();

  const { data: line, error: lineError } = await supabase
    .from("purchase_lines")
    .select("id, item_id, stability_qty, unit")
    .eq("id", purchaseLineId)
    .maybeSingle();
  if (lineError || !line) return { error: "Selected batch could not be found." };

  const stabilityQty = Number(line.stability_qty ?? 0);
  if (!(stabilityQty > 0)) return { error: "No stability sample remaining for this batch." };

  // Re-check the trigger condition server-side rather than trusting that
  // the "Due for retest" list the user clicked from is still current.
  const { data: latestQc, error: latestError } = await supabase
    .from("quality_checks")
    .select("status, retest_date")
    .eq("purchase_line_id", purchaseLineId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { error: latestError.message };
  if (!latestQc || latestQc.status !== "approved") {
    return { error: "This batch is not due for retest." };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!latestQc.retest_date || latestQc.retest_date > today) {
    return { error: "This batch's retest date has not arrived yet." };
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
      sample_qty: stabilityQty,
      sample_unit: line.unit,
      is_retest: true,
      // created_by: see the matching comment in createQualityCheck above —
      // audit only, not enforced as a distinct identity.
      created_by: user!.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // quality_checks_purchase_line_pending_unique (0025_qc_retest_workflow.sql)
      // — another submission against this batch landed between our check
      // and this insert.
      return { error: "This batch already has a QC record submitted against it." };
    }
    return { error: error.message };
  }

  revalidatePath("/qc");
  redirect(`/qc/${inserted.id}`);
}
