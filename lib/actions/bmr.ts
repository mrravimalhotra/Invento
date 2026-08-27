"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

// Postgres raises this text (see check_batch_qc_approved() in
// supabase/migrations/0001_init.sql) when a weighment line's chosen batch
// isn't QC-Approved. trg_bmr_weighment_qc_gate fires the same function that
// gates finished_product_components — we translate it into a clear form
// error here instead of letting the exception surface as a raw PG error.
const QC_GATE_MARKER = "is not QC-Approved and cannot be consumed";

export async function createBmrRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fpBatchId = String(formData.get("finished_product_batch_id") || "");
  if (!fpBatchId) return { error: "Select a finished product batch." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "bmr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bmr_records")
    .insert({ finished_product_batch_id: fpBatchId })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/bmr");
  redirect(`/bmr/${data.id}`);
}

export async function addWeighmentLine(
  bmrRecordId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const itemId = String(formData.get("item_id") || "");
  const purchaseLineId = String(formData.get("purchase_line_id") || "");
  const standardQtyRaw = String(formData.get("standard_qty") || "").trim();
  const actualQtyRaw = String(formData.get("actual_qty") || "").trim();

  if (!itemId) return { error: "Select an item." };
  if (!purchaseLineId) return { error: "Select a QC-Approved batch." };

  const standardQty = Number(standardQtyRaw);
  if (!standardQtyRaw || Number.isNaN(standardQty)) {
    return { error: "Standard qty is required (from the MFR line, or enter manually)." };
  }
  let actualQty: number | null = null;
  if (actualQtyRaw) {
    actualQty = Number(actualQtyRaw);
    if (Number.isNaN(actualQty)) return { error: "Actual qty must be a number." };
  }

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "bmr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("bmr_weighment_lines").insert({
    bmr_record_id: bmrRecordId,
    item_id: itemId,
    purchase_line_id: purchaseLineId,
    standard_qty: standardQty,
    actual_qty: actualQty,
  });
  if (error) {
    if (error.message.includes(QC_GATE_MARKER)) {
      return { error: "That batch is not QC-Approved and cannot be used for weighment. Choose an Approved batch." };
    }
    return { error: error.message };
  }

  revalidatePath(`/bmr/${bmrRecordId}`);
  return { success: "Weighment line added." };
}

export async function addObservation(
  bmrRecordId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const stepLabel = String(formData.get("step_label") || "").trim();
  const reading = String(formData.get("reading") || "").trim();
  if (!stepLabel) return { error: "Step label is required." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "bmr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("bmr_observations").insert({
    bmr_record_id: bmrRecordId,
    step_label: stepLabel,
    reading: reading || null,
    recorded_by: user!.id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/bmr/${bmrRecordId}`);
  return { success: "Observation added." };
}

async function signOffStep(
  bmrRecordId: string,
  step: "prepared" | "checked" | "approved",
  requiredPriorStep: "prepared" | "checked" | null
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "bmr")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { data: record } = await supabase
    .from("bmr_records")
    .select("prepared_at, checked_at, approved_at")
    .eq("id", bmrRecordId)
    .maybeSingle();
  if (!record) return { error: "BMR not found." };

  const atCol = `${step}_at` as const;
  if (record[atCol]) return { error: `Already marked ${step}.` };
  if (requiredPriorStep && !record[`${requiredPriorStep}_at` as const]) {
    return { error: `Mark ${requiredPriorStep} first.` };
  }

  const { error } = await supabase
    .from("bmr_records")
    .update({ [`${step}_by`]: user!.id, [atCol]: new Date().toISOString() })
    .eq("id", bmrRecordId);
  if (error) return { error: error.message };

  revalidatePath(`/bmr/${bmrRecordId}`);
  revalidatePath("/bmr");
  return { success: `Marked ${step}.` };
}

export async function markPrepared(bmrRecordId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return signOffStep(bmrRecordId, "prepared", null);
}

export async function markChecked(bmrRecordId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return signOffStep(bmrRecordId, "checked", "prepared");
}

export async function markApproved(bmrRecordId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return signOffStep(bmrRecordId, "approved", "checked");
}
