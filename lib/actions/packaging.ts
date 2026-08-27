"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { DEPARTMENTS } from "@/lib/constants/units";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

const TRANSACTION_TYPES = ["pack", "repack", "unpack"] as const;

export async function createPackagingIssue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fpBatchId = String(formData.get("finished_product_batch_id") || "");
  const packSize = String(formData.get("pack_size") || "").trim();
  const unitCountRaw = String(formData.get("unit_count") || "").trim();
  const department = String(formData.get("department") || "");
  const packagingItemId = String(formData.get("packaging_item_id") || "");
  const packagingQtyRaw = String(formData.get("packaging_qty_used") || "").trim();
  const transactionType = String(formData.get("transaction_type") || "pack");

  if (!fpBatchId) return { error: "Select a finished product batch." };
  if (!packSize) return { error: "Pack size is required." };
  if (!(DEPARTMENTS as readonly string[]).includes(department)) return { error: "Select a department." };
  if (!packagingItemId) return { error: "Select a packaging item." };
  if (!(TRANSACTION_TYPES as readonly string[]).includes(transactionType)) {
    return { error: "Invalid transaction type." };
  }

  const unitCount = Number(unitCountRaw);
  if (!unitCountRaw || Number.isNaN(unitCount) || unitCount <= 0) {
    return { error: "Unit count must be a positive number." };
  }
  const packagingQty = Number(packagingQtyRaw);
  if (!packagingQtyRaw || Number.isNaN(packagingQty) || packagingQty <= 0) {
    return { error: "Packaging qty used must be a positive number." };
  }

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "packaging")) return { error: "Not authorized." };

  const supabase = await createClient();

  // Belt-and-suspenders: the /packaging/new form only lists approved FP
  // batches, but re-check here since nothing in the schema stops an insert
  // against an unapproved batch (packaging_issues has no status FK gate).
  const { data: fpBatch } = await supabase
    .from("finished_product_batches")
    .select("status")
    .eq("id", fpBatchId)
    .maybeSingle();
  if (!fpBatch) return { error: "Finished product batch not found." };
  if (fpBatch.status !== "approved") {
    return { error: "Packaging can only be issued against an Approved finished product batch." };
  }

  const { error } = await supabase.from("packaging_issues").insert({
    finished_product_batch_id: fpBatchId,
    pack_size: packSize,
    unit_count: unitCount,
    department,
    packaging_item_id: packagingItemId,
    packaging_qty_used: packagingQty,
    transaction_type: transactionType,
  });
  if (error) return { error: error.message };

  revalidatePath("/packaging");
  redirect("/packaging");
}
