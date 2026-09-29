"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { DEPARTMENTS, UNITS, convertUnit } from "@/lib/constants/units";
import { resolveDisplayStatus } from "@/lib/finished-product-status";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";

export type ActionState = { error?: string; success?: string } | undefined;


type MaterialInput = { itemId: string; quantity: number; unit: string };

// "Allow selection of multiple packaging materials such as bottles, caps
// etc. Each material can have a different unit/quantity" (Ravi, 3 Sept
// 2026) — same lineCount + item_id_i/quantity_i/unit_i shape as
// finished-product.ts's parseComponents(), read by
// packaging-materials-editor.tsx's PackagingMaterialsEditor.
//
// Only called for Store/R&D issues (19 Sept 2026 Production redesign
// below) — Production no longer uses packaging materials at all.
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

// Task F (claude/packaged-fp-redesign.md) — department Store/R&D
// restructures "pack size" from free text into a real quantity + unit, so
// "how much bulk Finished Product this run consumed" can be computed
// automatically (Ravi's explicit choice, overriding the safer manual-entry
// option).
function parseStructuredPackSize(formData: FormData): { qty: number; unit: string } | { error: string } {
  const rawQty = String(formData.get("pack_size_qty") || "").trim();
  const unit = String(formData.get("pack_size_unit") || "").trim();
  const qty = Number(rawQty);
  if (!rawQty || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Pack size quantity must be a positive number." };
  }
  if (!(UNITS as readonly string[]).includes(unit)) return { error: "Select a valid pack size unit." };
  return { qty, unit };
}

// Production redesign (Ravi, 19 Sept 2026): "when Packaging is issued to
// production - it would become available as Raw material for another
// Finished Product... similar to how PKG-FP-00001 is created, we should
// create a new Raw Material code example RM-FP-00001... There are no
// packaging items required when a finished product is issued to
// Production." Confirmed 19 Sept: this REPLACES Production's earlier
// materials-only packaging behavior entirely (never fully developed —
// no UI ever shipped a distinct treatment for it beyond the generic
// free-text pack-size path every non-transform department fell into) —
// there's no toggle back to the old shape.
//
// A Production issue is a single, direct, same-unit quantity: no pack
// size multiplication, no unit selector (the paired Raw Material item
// always shares the Finished Product item's own unit — see the DB
// trigger in 0050_production_rm_from_packaging.sql), no packaging
// materials.
function parseProductionQty(formData: FormData): number | { error: string } {
  const raw = String(formData.get("production_qty") || "").trim();
  const qty = Number(raw);
  if (!raw || !Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity to convert must be a positive number." };
  }
  return qty;
}

// FB-0043 (28 Sept 2026): "it should be treated as new Raw material
// reserving quantity for stability, R&D and QC" — same UX Purchase's line
// form already has (see purchase-line-form.tsx), entered in whatever
// sample unit is convenient and converted down to the Finished Product's
// own unit at submit, same "no separate as-entered unit column" pattern
// purchase_lines/finished_product_batches both use (0021's comment).
// Unlike Purchase, these three are NOT mandatory here — a Production
// issue with zero sampling is a legitimate choice a user can make (0 is
// the honest default, not a placeholder to fill in later), so a blank
// field is treated as 0 rather than rejected.
function parseProductionSampleQtys(formData: FormData): { qc: number; stability: number; rnd: number } | { error: string } {
  const qcRaw = String(formData.get("production_qc_qty") || "").trim();
  const stabilityRaw = String(formData.get("production_stability_qty") || "").trim();
  const rndRaw = String(formData.get("production_rnd_qty") || "").trim();

  const qc = qcRaw ? Number(qcRaw) : 0;
  const stability = stabilityRaw ? Number(stabilityRaw) : 0;
  const rnd = rndRaw ? Number(rndRaw) : 0;

  if (!Number.isFinite(qc) || qc < 0) return { error: "QC quantity can't be negative." };
  if (!Number.isFinite(stability) || stability < 0) return { error: "Stability quantity can't be negative." };
  if (!Number.isFinite(rnd) || rnd < 0) return { error: "R&D quantity can't be negative." };

  return { qc, stability, rnd };
}

export async function createPackagingIssue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const fpBatchId = String(formData.get("finished_product_batch_id") || "");
  const department = String(formData.get("department") || "");

  if (!fpBatchId) return { error: "Select a finished product batch." };
  if (!(DEPARTMENTS as readonly string[]).includes(department)) return { error: "Select a department." };

  const isStoreOrRnd = department === "store" || department === "rnd";
  const isProduction = department === "production";

  // Store/R&D: pack size is captured structured (qty + unit) so the bulk
  // FP consumed can be computed, plus a separate "unit count" (how many
  // packaged units this run produced) and packaging materials.
  // Production: one direct "quantity to convert" field — see
  // parseProductionQty() above — no separate unit count field, no
  // materials.
  let packSize: string;
  let packSizeQty: number | null = null;
  let packSizeUnit: string | null = null;
  let unitCount: number;
  let materials: MaterialInput[] = [];
  let productionQty = 0;
  let productionSampleUnit = "";
  let productionQc = 0;
  let productionStability = 0;
  let productionRnd = 0;

  if (isStoreOrRnd) {
    const structured = parseStructuredPackSize(formData);
    if ("error" in structured) return structured;
    packSizeQty = structured.qty;
    packSizeUnit = structured.unit;
    packSize = `${structured.qty} ${structured.unit}`;

    const unitCountRaw = String(formData.get("unit_count") || "").trim();
    unitCount = Number(unitCountRaw);
    if (!unitCountRaw || Number.isNaN(unitCount) || unitCount <= 0) {
      return { error: "Unit count must be a positive number." };
    }

    const materialsOrError = parseMaterials(formData);
    if ("error" in materialsOrError) return materialsOrError;
    materials = materialsOrError;
  } else {
    // isProduction — DEPARTMENTS is exactly ["production", "rnd", "store"],
    // so this is the only remaining case, but keep it as an explicit branch
    // (rather than assuming) in case DEPARTMENTS ever grows.
    if (!isProduction) return { error: "Select a department." };
    const qtyOrError = parseProductionQty(formData);
    if (typeof qtyOrError !== "number") return qtyOrError;
    productionQty = qtyOrError;
    unitCount = productionQty;
    // pack_size stays a required text column for every department
    // (0001_init.sql) — filled in below once the Finished Product's own
    // unit is known, e.g. "20 kg".
    packSize = "";

    // FB-0043: QC/Stability/R&D sample quantities, entered in whatever
    // sample unit is convenient — converted down to the Finished
    // Product's own unit below, once fpUnit is known (mirrors the
    // isStoreOrRnd pack-size conversion just below this branch).
    const sampleQtysOrError = parseProductionSampleQtys(formData);
    if ("error" in sampleQtysOrError) return sampleQtysOrError;
    productionQc = sampleQtysOrError.qc;
    productionStability = sampleQtysOrError.stability;
    productionRnd = sampleQtysOrError.rnd;
    productionSampleUnit = String(formData.get("production_sample_unit") || "").trim();
    if (productionQc + productionStability + productionRnd > 0 && !productionSampleUnit) {
      return { error: "Select a sample unit for the QC/Stability/R&D quantities entered." };
    }
  }

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

  // Every department now consumes bulk Finished Product (19 Sept 2026 —
  // previously only Store/R&D did; Production's old materials-only,
  // FP-untouched behavior is retired). Resolve the batch's own FP item
  // (same mfr_definitions.finished_product_item_id link Phase 3's fp_yield
  // push uses) to get its unit and, for Store/R&D, its paired Packaged FP
  // item (items.packaged_item_id, Task F) — the DB trigger
  // (trg_fn_packaging_transform_and_issue) silently skips the transform if
  // fp_qty_consumed isn't set, which would look like a no-op success from
  // here, so every precondition it needs is checked and reported up front
  // instead.
  const { data: batchRow } = await supabase
    .from("finished_product_batches")
    .select("mfr_definition_id")
    .eq("id", fpBatchId)
    .maybeSingle();
  const { data: mfrDef } = batchRow
    ? await supabase
        .from("mfr_definitions")
        .select("finished_product_item_id")
        .eq("id", batchRow.mfr_definition_id)
        .maybeSingle()
    : { data: null };
  const fpItemId = mfrDef?.finished_product_item_id ?? null;
  if (!fpItemId) {
    return { error: "This batch's MFR has no linked Finished Product item — can't compute quantity consumed." };
  }
  const { data: fpItem } = await supabase
    .from("items")
    .select("unit, packaged_item_id")
    .eq("id", fpItemId)
    .maybeSingle();
  const fpUnit = fpItem?.unit ?? null;

  let fpQtyConsumed: number;
  if (isStoreOrRnd) {
    if (!fpItem?.packaged_item_id) {
      return {
        error:
          "This Finished Product has no paired Packaged Finished Product item on file yet (older MFR) — Store/R&D issue isn't available for it.",
      };
    }
    const converted = fpUnit ? convertUnit(packSizeQty as number, packSizeUnit as string, fpUnit) : null;
    if (!fpUnit || converted === null) {
      return {
        error: `Pack size unit (${packSizeUnit}) isn't compatible with this Finished Product's unit (${fpUnit ?? "unset"}).`,
      };
    }
    fpQtyConsumed = converted * unitCount;
  } else {
    // Production: no unit selector was offered, so productionQty is
    // already in the Finished Product's own unit by construction — a
    // straight same-unit conversion (Ravi, 19 Sept 2026), never a
    // pack-size multiplication. Its paired Raw Material item
    // (production_rm_item_id) is lazily created by the DB trigger itself
    // on first use, so — unlike Store/R&D's packaged_item_id — there's no
    // "not paired yet" precondition to check here.
    fpQtyConsumed = productionQty;
    packSize = fpUnit ? `${productionQty} ${fpUnit}` : String(productionQty);
  }

  // FB-0043: convert the QC/Stability/R&D sample quantities (entered in
  // productionSampleUnit) down to the Finished Product's own unit —
  // exactly the conversion createPurchaseLine() does for purchase_lines.
  // qc_qty/stability_qty/rnd_qty, same reasoning: those three columns
  // share production_issue_batches' own `unit` with `quantity`, so they
  // have to already be expressed in it by the time they're stored.
  let productionQcConverted = 0;
  let productionStabilityConverted = 0;
  let productionRndConverted = 0;
  if (isProduction && productionQc + productionStability + productionRnd > 0) {
    if (!fpUnit) return { error: "Could not determine this Finished Product's unit for sample conversion." };
    const qcConv = convertUnit(productionQc, productionSampleUnit, fpUnit);
    const stabilityConv = convertUnit(productionStability, productionSampleUnit, fpUnit);
    const rndConv = convertUnit(productionRnd, productionSampleUnit, fpUnit);
    if (qcConv === null || stabilityConv === null || rndConv === null) {
      return { error: `Sample unit (${productionSampleUnit}) isn't compatible with this Finished Product's unit (${fpUnit}).` };
    }
    if (qcConv + stabilityConv + rndConv > fpQtyConsumed) {
      return { error: "QC + Stability + R&D quantities can't exceed the quantity being converted." };
    }
    productionQcConverted = qcConv;
    productionStabilityConverted = stabilityConv;
    productionRndConverted = rndConv;
  }

  // packaging_item_id / packaging_qty_used (0027_packaging_multi_material.sql)
  // are no longer written here — one packaging_issues row is now just the
  // header (FP batch, pack size, unit count, department, type); the
  // materials themselves go into packaging_issue_items below, one row per
  // line, same header/lines split already used for MFR recipe lines and FP
  // composition. Production issues have zero material lines.
  //
  // code (0067_packaging_issue_code.sql) — the plain sequential PKG-####
  // identifier, same pattern as get_next_po_number()/get_next_equipment_code(),
  // generated once up front so it can be included directly in the insert
  // below rather than a separate update after.
  const { data: issueCode, error: codeError } = await supabase.rpc("get_next_packaging_issue_code");
  if (codeError || !issueCode) return { error: friendlyDbError(codeError, "Could not generate a packaging issue code.") };

  // ACC-12 (29 Sept 2026): header and materials are saved in ONE database
  // transaction (create_packaging_issue, 0079). Before, the header alone
  // already moved stock; if the materials failed, the clean-up delete was
  // silently blocked and a retry deducted the finished product twice.
  // Every issue is a Pack (ACC-05 — Repack/Unpack removed).
  const { error } = await supabase.rpc("create_packaging_issue", {
    p_issue: {
      code: issueCode,
      finished_product_batch_id: fpBatchId,
      pack_size: packSize,
      pack_size_qty: packSizeQty,
      pack_size_unit: packSizeUnit,
      fp_qty_consumed: fpQtyConsumed,
      unit_count: unitCount,
      department,
      qc_qty: isProduction ? productionQcConverted : null,
      stability_qty: isProduction ? productionStabilityConverted : null,
      rnd_qty: isProduction ? productionRndConverted : null,
    },
    p_materials: materials.map((m) => ({ item_id: m.itemId, quantity: m.quantity, unit: m.unit })),
  });
  if (error) return { error: friendlyDbError(error, "Could not create the packaging issue.") };

  revalidatePath("/packaging");
  redirect("/packaging?created=1");
}
