"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { DEPARTMENTS } from "@/lib/constants/units";
import { resolveDisplayStatus } from "@/lib/finished-product-status";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

const TRANSACTION_TYPES = ["pack", "repack", "unpack"] as const;

type MaterialInput = { itemId: string; quantity: number; unit: string };

// "Allow selection of multiple packaging materials such as bottles, caps
// etc. Each material can have a different unit/quantity" (Ravi, 3 Sept
// 2026) — same lineCount + item_id_i/quantity_i/unit_i shape as
// finished-product.ts's parseComponents(), read by
// packaging-materials-editor.tsx's PackagingMaterialsEditor.
function parseMaterials(formData: FormData): MaterialInput[] | { error: string } {
  const count = Number(formData.get("lineCount") || 0);
  const materials: MaterialInput[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = String(formData.get(`item_id_${i}`) || "");
    if (!itemId) continue;
    const rawQty = formData.get(`quantity_${i}`);
    const quantity = Number(rawQty);
    const unit = String(formData.get(`unit_${i}`) || "").trim();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `Material line ${i + 1}: quantity used must be a positive number.` };
    }
    if (!unit) {
      return { error: `Material line ${i + 1}: unit is required.` };
    }
    materials.push({ itemId, quantity, unit });
  }
  if (materials.length === 0) return { error: "Add at least one packaging material." };
  return materials;
}

export async function createPackagingIssue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fpBatchId = String(formData.get("finished_product_batch_id") || "");
  const packSize = String(formData.get("pack_size") || "").trim();
  const unitCountRaw = String(formData.get("unit_count") || "").trim();
  const department = String(formData.get("department") || "");
  const transactionType = String(formData.get("transaction_type") || "pack");

  if (!fpBatchId) return { error: "Select a finished product batch." };
  if (!packSize) return { error: "Pack size is required." };
  if (!(DEPARTMENTS as readonly string[]).includes(department)) return { error: "Select a department." };
  if (!(TRANSACTION_TYPES as readonly string[]).includes(transactionType)) {
    return { error: "Invalid transaction type." };
  }

  const unitCount = Number(unitCountRaw);
  if (!unitCountRaw || Number.isNaN(unitCount) || unitCount <= 0) {
    return { error: "Unit count must be a positive number." };
  }

  const materialsOrError = parseMaterials(formData);
  if ("error" in materialsOrError) return materialsOrError;
  const materials = materialsOrError;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "packaging")) return { error: "Not authorized." };

  const supabase = await createClient();

  // Belt-and-suspenders: the /packaging/new form only lists approved FP
  // batches, but re-check here since nothing in the schema stops an insert
  // against an unapproved batch (packaging_issues has no status FK gate).
  // The approved/rejected verdict lives on the linked quality_checks row,
  // not on finished_product_batches.status itself (see
  // lib/finished-product-status.ts) — resolve it the same way the list and
  // /packaging/new pages do, rather than comparing the raw column, which
  // would reject every batch.
  const [{ data: fpBatch }, { data: latestQcRow }] = await Promise.all([
    supabase.from("finished_product_batches").select("status").eq("id", fpBatchId).maybeSingle(),
    supabase
      .from("quality_checks")
      .select("status, created_at")
      .eq("finished_product_batch_id", fpBatchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!fpBatch) return { error: "Finished product batch not found." };
  const displayStatus = resolveDisplayStatus(fpBatch.status, latestQcRow);
  if (displayStatus !== "approved") {
    return { error: "Packaging can only be issued against an Approved finished product batch." };
  }

  // packaging_item_id / packaging_qty_used (0027_packaging_multi_material.sql)
  // are no longer written here — one packaging_issues row is now just the
  // header (FP batch, pack size, unit count, department, type); the
  // materials themselves go into packaging_issue_items below, one row per
  // line, same header/lines split already used for MFR recipe lines and FP
  // composition.
  const { data: issue, error } = await supabase
    .from("packaging_issues")
    .insert({
      finished_product_batch_id: fpBatchId,
      pack_size: packSize,
      unit_count: unitCount,
      department,
      transaction_type: transactionType,
    })
    .select("id")
    .single();
  if (error || !issue) return { error: error?.message || "Could not create the packaging issue." };

  const { error: materialsError } = await supabase.from("packaging_issue_items").insert(
    materials.map((m) => ({
      packaging_issue_id: issue.id,
      item_id: m.itemId,
      quantity: m.quantity,
      unit: m.unit,
    }))
  );
  if (materialsError) {
    // Same best-effort cleanup as createFinishedProductBatch(): don't leave
    // a materials-free packaging_issues header behind if the lines insert
    // fails partway through.
    await supabase.from("packaging_issues").delete().eq("id", issue.id);
    return { error: materialsError.message };
  }

  revalidatePath("/packaging");
  redirect("/packaging?created=1");
}
