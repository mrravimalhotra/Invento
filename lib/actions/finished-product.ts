"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
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
  const expiryDate = String(formData.get("expiry_date") || "") || null;

  if (!mfrDefinitionId) return { error: "MFR definition is required." };
  if (!mfrVersion || mfrVersion <= 0) return { error: "MFR version is missing — go back and reselect the MFR." };
  if (!targetQty || !Number.isFinite(targetQty) || targetQty <= 0) {
    return { error: "Target quantity must be greater than 0." };
  }
  if (!unit) return { error: "Unit is required." };

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
      expiry_date: expiryDate,
      status: "in_process",
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
    return { error: componentsError.message };
  }

  revalidatePath("/finished-product");
  redirect(`/finished-product/${batch.id}`);
}

// "Complete batch" — the full yield/wastage field set from the legacy Creation Finish
// Good screen (gap fix vs. the old baseline's bare "Quantity" field). net_weight and
// actual_yield_pct are DB-generated columns; we never compute them client-side.
export async function completeFinishedProductBatch(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "finished_product")) return { error: "Not authorized." };

  const wtTotalRm = formData.get("wt_total_rm");
  const wastage = formData.get("wastage");
  const totalUnits = formData.get("total_units");
  const netQty = formData.get("net_qty");
  const finishDate = String(formData.get("finish_date") || "");
  const expiryMonth = String(formData.get("expiry_month") || "");
  const qcSampleQty = formData.get("qc_sample_qty");

  const supabase = await createClient();
  const { data: current, error: fetchError } = await supabase
    .from("finished_product_batches")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !current) return { error: fetchError?.message || "Batch not found." };
  if (current.status !== "in_process") {
    return { error: "This batch has already been submitted to QC — details can no longer be edited." };
  }

  const { error } = await supabase
    .from("finished_product_batches")
    .update({
      wt_total_rm: wtTotalRm ? Number(wtTotalRm) : null,
      wastage: wastage ? Number(wastage) : 0,
      total_units: totalUnits ? Number(totalUnits) : null,
      net_qty: netQty ? Number(netQty) : null,
      finish_date: finishDate || null,
      expiry_month: expiryMonth || null,
      qc_sample_qty: qcSampleQty ? Number(qcSampleQty) : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/finished-product/${id}`);
  revalidatePath("/finished-product");
  return { success: "Batch details saved." };
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
    .select("status, wt_total_rm, finish_date, qc_sample_qty, unit, expiry_date")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !batch) return { error: fetchError?.message || "Batch not found." };
  if (batch.status !== "in_process") return { error: "Only an in-process batch can be submitted to QC." };
  if (!batch.wt_total_rm || !batch.finish_date) {
    return { error: "Complete the batch (total weight, wastage, finish date) before submitting to QC." };
  }

  const { data: arNumber, error: arError } = await supabase.rpc("get_next_ar_number");
  if (arError || !arNumber) return { error: arError?.message || "Could not generate an AR number." };

  const { error: qcError } = await supabase.from("quality_checks").insert({
    ar_number: arNumber,
    finished_product_batch_id: id,
    sample_qty: batch.qc_sample_qty,
    sample_unit: batch.unit,
    expiry_date: batch.expiry_date,
  });
  if (qcError) {
    if (qcError.code === "42501") {
      return {
        error:
          "Your role can manage this batch but current access rules don't let it create the QC record — ask an Inventory Manager, Quality Checker, QC Reviewer, or System Admin to submit this batch to QC.",
      };
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
