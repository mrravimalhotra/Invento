"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { convertUnit } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

type ComponentInput = { itemId: string; quantity: number; purchaseLineId: string };

function parseComponents(formData: FormData): ComponentInput[] | { error: string } {
  const count = Number(formData.get("lineCount") || 0);
  const components: ComponentInput[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = String(formData.get(`item_id_${i}`) || "");
    if (!itemId) continue;
    const rawQty = formData.get(`quantity_${i}`);
    const quantity = Number(rawQty);
    const purchaseLineId = String(formData.get(`purchase_line_id_${i}`) || "");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Line ${i + 1}: invalid quantity.` };
    }
    if (!purchaseLineId) {
      return { error: `Line ${i + 1}: choose a QC-Approved batch — none is currently selected.` };
    }
    components.push({ itemId, quantity, purchaseLineId });
  }
  if (components.length === 0) return { error: "This MFR has no recipe lines to consume." };
  return components;
}

// Step 2 of "New Finished Product Batch" (see app/(dashboard)/finished-product/new/compose).
// Inserts the batch header, then the per-ingredient components in a single bulk insert so
// the QC-gate trigger (0002_transactions.sql: trg_fp_component_qc_gate) either accepts every
// line or rolls the whole insert back atomically. A rejection there is DB-level enforcement
// of "no material moves without quality clearance," not a bug — we catch it and surface a
// plain-language form error instead of a stack trace.
export async function createFinishedProductBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const mfrDefinitionId = String(formData.get("mfr_definition_id") || "");
  const mfrVersion = Number(formData.get("mfr_version"));
  const targetQty = Number(formData.get("target_qty"));
  const unit = String(formData.get("unit") || "");
  // Ravi (15 Sept 2026): Expiry date is no longer collected here — it can
  // only be known once the batch is actually finished (see the Complete
  // Batch fields below, and the migration 0044 comment for the full
  // reasoning). Batch Start Date replaces it: when this batch's
  // production run actually started, as distinct from `created_at`
  // (a plain row-audit timestamp, not a value a user enters or sees).
  const batchStartDate = String(formData.get("batch_start_date") || "") || null;

  if (!mfrDefinitionId) return { error: "MFR definition is required." };
  if (!mfrVersion || mfrVersion <= 0) return { error: "MFR version is missing — go back and reselect the MFR." };
  if (!targetQty || !Number.isFinite(targetQty) || targetQty <= 0) {
    return { error: "Target quantity must be greater than 0." };
  }
  if (!unit) return { error: "Unit is required." };
  if (!batchStartDate) return { error: "Batch start date is required." };

  const componentsOrError = parseComponents(formData);
  if ("error" in componentsOrError) return componentsOrError;
  const components = componentsOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "finished_product")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: batchNumber, error: numError } = await supabase.rpc("get_next_fp_batch_number");
  if (numError || !batchNumber) return { error: numError?.message || "Could not generate a batch number." };

  const { data: batch, error: batchError } = await supabase
    .from("finished_product_batches")
    .insert({
      batch_number: batchNumber,
      mfr_definition_id: mfrDefinitionId,
      mfr_version: mfrVersion,
      target_qty: targetQty,
      unit,
      batch_start_date: batchStartDate,
      // Ravi (15 Sept 2026): batch creation is now two-step. This insert
      // still pulls RM immediately (finished_product_components below,
      // same as before this change), but the batch now lands in "draft"
      // rather than "in_process" — it only actually starts production
      // once confirmFinishedProductBatch() below is called from the
      // detail page's "Create Batch" button. A draft left untouched for
      // 30 minutes auto-cancels (expire_stale_fp_drafts(), called lazily
      // from the FP list/detail pages — see 0046_fp_batch_draft_cancel.sql)
      // and its RM is returned to inventory, same as a manual Cancel.
      status: "draft",
    })
    .select("id")
    .single();
  if (batchError || !batch) return { error: batchError?.message || "Could not create the batch." };

  const { error: componentsError } = await supabase.from("finished_product_components").insert(
    components.map((c) => ({
      finished_product_batch_id: batch.id,
      item_id: c.itemId,
      purchase_line_id: c.purchaseLineId,
      quantity: c.quantity,
    }))
  );
  if (componentsError) {
    // Best-effort cleanup: don't leave a headerless (component-free) batch behind,
    // and don't burn the batch number silently — the user retries from scratch.
    await supabase.from("finished_product_batches").delete().eq("id", batch.id);
    if (componentsError.message.includes("is not QC-Approved")) {
      return { error: "That batch is no longer QC-Approved — refresh and pick another." };
    }
    // Phase 2 (0029_purchase_line_live_remaining_qty.sql) — the new
    // live_remaining_not_negative check constraint, a real DB-level guard
    // against consuming more of a batch than it actually has left
    // (previously nothing enforced this at all).
    if (componentsError.message.includes("live_remaining_not_negative")) {
      return { error: "Not enough of that batch remaining — refresh and pick another batch or a smaller quantity." };
    }
    return { error: componentsError.message };
  }

  revalidatePath("/finished-product");
  redirect(`/finished-product/${batch.id}`);
}

// "Create Batch" on the detail page — the second, explicit step that
// actually starts production. Only a batch still in "draft" can be
// confirmed; the WHERE clause below is the real enforcement (a stale
// page, or a batch someone else already cancelled/confirmed/auto-expired
// in the meantime, just gets a "no longer a draft" error rather than a
// silent no-op or a double-confirm).
export async function confirmFinishedProductBatch(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!canWrite(user.roles, "finished_product")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finished_product_batches")
    .update({ status: "in_process" })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) {
    return {
      error: "This batch is no longer a draft — it may already have been confirmed, cancelled, or auto-cancelled after 30 minutes. Refresh to see its current status.",
    };
  }

  revalidatePath(`/finished-product/${id}`);
  revalidatePath("/finished-product");
  return { success: "Batch created — now in process." };
}

// "Cancel" on the detail page, only available while a batch is still a
// draft. Ravi (15 Sept 2026): a cancelled draft's Raw Material is
// returned to inventory — same reversal, whether it's this manual click
// or the 30-minute auto-cancel (expire_stale_fp_drafts()) that gets a
// batch to "cancelled"; both just do this same status update, and
// trg_fp_batch_draft_cancel_reversal (0046_fp_batch_draft_cancel.sql)
// is the single trigger that reacts to it either way.
export async function cancelFinishedProductBatch(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!canWrite(user.roles, "finished_product")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finished_product_batches")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) {
    return {
      error: "This batch is no longer a draft — it may already have been confirmed, cancelled, or auto-cancelled after 30 minutes. Refresh to see its current status.",
    };
  }

  revalidatePath(`/finished-product/${id}`);
  revalidatePath("/finished-product");
  return { success: "Batch cancelled — its raw material has been returned to inventory." };
}

// "Complete batch". As of 0022_fp_batch_yield.sql (2 Sept 2026), Batch Yield
// is entered here manually (same unit as the batch's own `unit`, i.e. the
// Finished Product item's unit) — actual_yield_pct is a DB-generated column
// (batch_yield / target_qty * 100); we never compute it client-side.
//
// Ravi (15 Sept 2026): "Once the batch is finished, 'Finish Date' will be
// added along with 'Expiry Date'. Both of these fields should be
// mandatory... all sample quantities and sample unit should be made
// mandatory." Before this, every field on this screen was optional and
// could be saved piecemeal across several visits while a batch was still
// "in_process" — that partial-save shape is gone now: completing a batch
// is one all-or-nothing action, matching the real-world process ("a
// finished product can take a few days to get completed... once the
// batch is finished" every one of these is known at the same time).
// Mirrored at the DB level by fp_completion_fields_required_together
// (0044_fp_batch_start_date.sql) as a defense-in-depth backstop against a
// direct API call bypassing this action.
export async function completeFinishedProductBatch(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "finished_product")) return { error: "Not authorized." };

  const batchYieldRaw = formData.get("batch_yield");
  const finishDate = String(formData.get("finish_date") || "");
  const expiryMonth = String(formData.get("expiry_month") || "");
  const qcSampleQtyRaw = formData.get("qc_sample_qty");
  const stabilityQtyRaw = formData.get("stability_qty");
  const rndQtyRaw = formData.get("rnd_qty");
  const sampleUnitRaw = String(formData.get("sample_unit") || "");

  const batchYield = batchYieldRaw ? Number(batchYieldRaw) : NaN;
  if (!Number.isFinite(batchYield) || batchYield <= 0) {
    return { error: "Batch yield is required and must be greater than 0." };
  }
  if (!finishDate) return { error: "Finish date is required." };
  if (!expiryMonth) return { error: "Expiry date is required." };
  if (!sampleUnitRaw) return { error: "Sample unit is required." };
  const qcSampleQtyNum = qcSampleQtyRaw ? Number(qcSampleQtyRaw) : NaN;
  const stabilityQtyNum = stabilityQtyRaw ? Number(stabilityQtyRaw) : NaN;
  const rndQtyNum = rndQtyRaw ? Number(rndQtyRaw) : NaN;
  if (!Number.isFinite(qcSampleQtyNum) || qcSampleQtyNum <= 0) {
    return { error: "QC sample qty is required and must be greater than 0." };
  }
  if (!Number.isFinite(stabilityQtyNum) || stabilityQtyNum <= 0) {
    return { error: "Stability sample qty is required and must be greater than 0." };
  }
  if (!Number.isFinite(rndQtyNum) || rndQtyNum <= 0) {
    return { error: "R&D sample qty is required and must be greater than 0." };
  }

  const supabase = await createClient();
  const { data: current, error: fetchError } = await supabase
    .from("finished_product_batches")
    .select("status, unit")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !current) return { error: fetchError?.message || "Batch not found." };
  if (current.status !== "in_process") {
    return {
      error: "This batch is no longer in progress — it may already be completed or submitted to QC. Refresh to see its current status.",
    };
  }

  // 0021_fp_stability_rnd_qty.sql: QC sample / Stability sample / R&D
  // sample quantity can be entered in a "sample unit" that differs from
  // the batch's own `unit` (e.g. grams while the batch itself is tracked
  // in kg) — same convention purchase_lines uses (FB-0017). Converted
  // values are what's stored; no separate "as entered" unit column is
  // kept on this table.
  const qcSampleQty = convertUnit(qcSampleQtyNum, sampleUnitRaw, current.unit);
  const stabilityQty = convertUnit(stabilityQtyNum, sampleUnitRaw, current.unit);
  const rndQty = convertUnit(rndQtyNum, sampleUnitRaw, current.unit);
  if (qcSampleQty === null || stabilityQty === null || rndQty === null) {
    return {
      error: `Sample unit "${sampleUnitRaw}" can't be converted to the batch's unit "${current.unit}" — pick a compatible unit.`,
    };
  }

  // wastage / total_units / net_qty are deliberately NOT in this update
  // object (2 Sept 2026 — removed from the Complete Batch form). Same
  // non-destructive fix as updateItem() in lib/actions/items.ts: reading
  // an empty value from a form that no longer sends these fields and
  // writing it back would silently wipe wastage/total_units/net_qty on
  // every future save of an existing batch (wastage in particular used
  // to default to 0 when absent, which would have been actively wrong,
  // not just a no-op). Leaving them out of `update` entirely means a
  // batch that already had these values keeps them untouched;
  // net_weight/actual_yield_pct (generated from wt_total_rm - wastage)
  // simply stop moving with wastage for any batch completed after this
  // change, since there's no longer a field to set it from.
  const { error } = await supabase
    .from("finished_product_batches")
    .update({
      batch_yield: batchYield,
      finish_date: finishDate,
      expiry_month: expiryMonth,
      qc_sample_qty: qcSampleQty,
      stability_qty: stabilityQty,
      rnd_qty: rndQty,
      // Ravi (15 Sept 2026): completing a batch now moves it straight to a
      // new "Complete - Awaiting QC" stage rather than leaving it sitting
      // at "in_process" — a genuinely new status value (0047_fp_batch_complete_awaiting_qc.sql),
      // not a relabel of submitted_to_qc. "Submit to QC" (below) stays a
      // separate, still-manual next step per Ravi's explicit answer to
      // keep the two actions apart.
      status: "complete_awaiting_qc",
    })
    .eq("id", id);
  if (error) {
    // Phase 3 (0030_finished_product_ledger.sql) — fp_batch_yield_not_negative:
    // this is the one screen where batch_yield and the three sample
    // quantities are all set together, so it's the one place this new
    // constraint can actually be hit (mirrors Phase 2's live_remaining_not_negative
    // translation in lib/actions/inventory.ts).
    if (error.message.includes("fp_batch_yield_not_negative")) {
      return { error: "QC + stability + R&D sample quantities can't exceed the batch yield — reduce one of the sample amounts." };
    }
    return { error: error.message };
  }

  revalidatePath(`/finished-product/${id}`);
  revalidatePath("/finished-product");
  return { success: "Batch completed — now Complete - Awaiting QC." };
}

// Status flow gap fix (DESIGN.md §4.8): in_process -> submitted_to_qc closes the
// corrected finding that the legacy system DOES gate FP release on QC approval.
// This inserts a quality_checks row keyed by finished_product_batch_id (same table,
// same AR-number RPC QC uses for RM batches); the existing /qc/[id] review screen is
// where a reviewer actually sets it approved/rejected. See docs/modules/finished-product.md
// for how the resulting approval is then reflected back onto this batch's displayed status
// (application-level join, not a DB trigger — no new migrations allowed this pass).
export async function submitFinishedProductToQc(
  id: string,
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in." };
  if (!canWrite(user.roles, "finished_product")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: batch, error: fetchError } = await supabase
    .from("finished_product_batches")
    .select("status, batch_yield, finish_date, qc_sample_qty, unit, expiry_month")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !batch) return { error: fetchError?.message || "Batch not found." };
  // Ravi (15 Sept 2026): a batch now has to pass through "Complete -
  // Awaiting QC" (set by completeFinishedProductBatch above) before it
  // can be submitted to QC — this used to gate on "in_process" directly,
  // back when completing a batch didn't move its status at all.
  if (batch.status !== "complete_awaiting_qc") {
    return { error: "Only a batch that has been completed (Complete - Awaiting QC) can be submitted to QC." };
  }
  if (!batch.batch_yield || !batch.finish_date) {
    return { error: "Complete the batch (batch yield, finish date, expiry date, sample quantities) before submitting to QC." };
  }

  const { data: arNumber, error: arError } = await supabase.rpc("get_next_ar_number");
  if (arError || !arNumber) return { error: arError?.message || "Could not generate an AR number." };

  // expiry_month (not expiry_date — see migration 0044's comment): the
  // Complete Batch screen's Expiry date field is the batch's one real
  // expiry value now, only knowable once the batch is actually finished.
  const { error: qcError } = await supabase.from("quality_checks").insert({
    ar_number: arNumber,
    finished_product_batch_id: id,
    sample_qty: batch.qc_sample_qty,
    sample_unit: batch.unit,
    expiry_date: batch.expiry_month,
    // Maker/checker (17 Sept 2026): see the matching comment in
    // lib/actions/qc.ts's createQualityCheck — whoever submits this batch
    // to QC is its maker.
    created_by: user.id,
  });
  if (qcError) {
    if (qcError.code === "42501") {
      return {
        error:
          "Your role can manage this batch but current access rules don't let it create the QC record — ask an Inventory Manager, Quality Checker, QC Reviewer, or System Admin to submit this batch to QC.",
      };
    }
    if (qcError.code === "23505") {
      // quality_checks_fp_batch_unique (0015_qc_duplicate_backstop.sql) —
      // backstop for the status-check-above-then-insert race: someone else
      // already submitted this same batch to QC between our check and this
      // insert.
      return { error: "This batch has already been submitted to QC." };
    }
    return { error: qcError.message };
  }

  const { error: statusError } = await supabase
    .from("finished_product_batches")
    .update({ status: "submitted_to_qc" })
    .eq("id", id);
  if (statusError) return { error: statusError.message };

  revalidatePath(`/finished-product/${id}`);
  revalidatePath("/finished-product");
  return { success: "Submitted to QC." };
}
