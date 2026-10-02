"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { DEPARTMENTS, UNITS, convertUnit } from "@/lib/constants/units";
import { resolveDisplayStatus } from "@/lib/finished-product-status";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError } from "@/lib/db-errors";
import { todayIst } from "@/lib/utils";

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
function parseMaterials(formData: FormData, prefix = "", label = ""): MaterialInput[] | { error: string } {
  const lead = label ? `${label}: ` : "";
  const count = Number(formData.get(`${prefix}lineCount`) || 0);
  const materials: MaterialInput[] = [];
  for (let i = 0; i < count; i++) {
    const itemId = String(formData.get(`${prefix}item_id_${i}`) || "");
    if (!itemId) continue;
    const rawQty = formData.get(`${prefix}quantity_${i}`);
    const quantity = Number(rawQty);
    const unit = String(formData.get(`${prefix}unit_${i}`) || "").trim();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        error: `${lead}material ${i + 1}: quantity used must be a positive number.`,
      };
    }
    if (!unit) {
      return { error: `${lead}material ${i + 1}: unit is required.` };
    }
    materials.push({ itemId, quantity, unit });
  }
  if (materials.length === 0) return { error: `${lead}add at least one packaging material.` };
  return materials;
}

// Task F (claude/packaged-fp-redesign.md) — department Store/R&D
// restructures "pack size" from free text into a real quantity + unit, so
// "how much bulk Finished Product this run consumed" can be computed
// automatically (Ravi's explicit choice, overriding the safer manual-entry
// option).
function parseStructuredPackSize(
  rawQty: string,
  unit: string,
  label: string,
): { qty: number; unit: string } | { error: string } {
  const qty = Number(rawQty.trim());
  if (!rawQty.trim() || !Number.isFinite(qty) || qty <= 0) {
    return { error: `${label}: pack size quantity must be a positive number.` };
  }
  if (!(UNITS as readonly string[]).includes(unit)) return { error: `${label}: select a valid pack size unit.` };
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
// Ravi (29 Sept 2026): "while issuing to Production - Stability, R&D, QC
// and Sample unit should be mandatory" — the same rule as Purchase: all
// three quantities and the sample unit must be entered (a blank field is
// refused), but 0 stays a valid, explicitly-typed value — a Production
// issue with no sampling is legitimate; it just has to be said, not left
// empty.
function parseProductionSampleQtys(
  formData: FormData,
): { qc: number; stability: number; rnd: number } | { error: string } {
  const qcRaw = String(formData.get("production_qc_qty") || "").trim();
  const stabilityRaw = String(formData.get("production_stability_qty") || "").trim();
  const rndRaw = String(formData.get("production_rnd_qty") || "").trim();

  if (!qcRaw) return { error: "QC quantity is required (enter 0 if none)." };
  if (!stabilityRaw) return { error: "Stability quantity is required (enter 0 if none)." };
  if (!rndRaw) return { error: "R&D quantity is required (enter 0 if none)." };

  const qc = Number(qcRaw);
  const stability = Number(stabilityRaw);
  const rnd = Number(rndRaw);

  if (!Number.isFinite(qc) || qc < 0) return { error: "QC quantity can't be negative." };
  if (!Number.isFinite(stability) || stability < 0) return { error: "Stability quantity can't be negative." };
  if (!Number.isFinite(rnd) || rnd < 0) return { error: "R&D quantity can't be negative." };

  return { qc, stability, rnd };
}

// FB-0052 (2 Oct 2026): one Store/R&D save can carry up to this many lines
// (the database enforces the same cap in create_packaging_issues, 0093).
const MAX_LINES = 30;

type ResolvedBatch = { fpUnit: string | null; packagedItemId: string | null };

// Everything a packaging issue needs to know about its Finished Product
// batch: it must exist, be Approved (the verdict lives on the latest
// quality_checks row, not on finished_product_batches.status — see
// lib/finished-product-status.ts), and its MFR must link to a Finished
// Product item (unit + paired Packaged FP item). The DB trigger
// (trg_fn_packaging_transform_and_issue) silently skips the transform if
// fp_qty_consumed isn't set, so every precondition is checked up front.
async function resolveFpBatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fpBatchId: string,
): Promise<ResolvedBatch | { error: string }> {
  const [{ data: fpBatch }, { data: latestQcRow }, { data: batchRow }] = await Promise.all([
    supabase.from("finished_product_batches").select("status").eq("id", fpBatchId).maybeSingle(),
    supabase
      .from("quality_checks")
      .select("status, created_at")
      .eq("finished_product_batch_id", fpBatchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("finished_product_batches").select("mfr_definition_id").eq("id", fpBatchId).maybeSingle(),
  ]);
  if (!fpBatch) return { error: "Finished product batch not found." };
  if (resolveDisplayStatus(fpBatch.status, latestQcRow) !== "approved") {
    return {
      error: "Packaging can only be issued against an Approved finished product batch.",
    };
  }
  const { data: mfrDef } = batchRow
    ? await supabase
        .from("mfr_definitions")
        .select("finished_product_item_id")
        .eq("id", batchRow.mfr_definition_id)
        .maybeSingle()
    : { data: null };
  const fpItemId = mfrDef?.finished_product_item_id ?? null;
  if (!fpItemId) {
    return {
      error: "This batch's MFR has no linked Finished Product item — can't compute quantity consumed.",
    };
  }
  const { data: fpItem } = await supabase
    .from("items")
    .select("unit, packaged_item_id")
    .eq("id", fpItemId)
    .maybeSingle();
  return {
    fpUnit: fpItem?.unit ?? null,
    packagedItemId: fpItem?.packaged_item_id ?? null,
  };
}

export async function createPackagingIssue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const department = String(formData.get("department") || "");

  // FB-0051: Issue date — any day up to today (India time); the database
  // (create_packaging_issue, 0092) refuses a later day as a backstop.
  const issueDate = String(formData.get("issue_date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return { error: "Enter the issue date." };
  if (issueDate > todayIst()) return { error: "Issue date cannot be in the future." };

  if (!(DEPARTMENTS as readonly string[]).includes(department)) return { error: "Select a department." };

  // FB-0052: Store/R&D save one or more lines (each its own batch, pack
  // size, unit count and materials). Production keeps its single-entry flow.
  if (department === "store" || department === "rnd") return createStoreRndIssues(formData, department, issueDate);
  return createProductionIssue(formData, department, issueDate);
}

// Store / R&D (FB-0052): bulk Finished Product is transformed into a
// Packaged Finished Product and immediately issued out. Each line = one FP
// batch + one pack size (qty + unit, compatible with the FP's unit) + unit
// count + packaging materials; FP consumed = pack size × unit count,
// converted to the FP's unit. All lines are saved in ONE database
// transaction (create_packaging_issues, 0093) — one PKG-#### per line, and
// lines drawing on the same batch are checked against it together.
async function createStoreRndIssues(formData: FormData, department: string, issueDate: string): Promise<ActionState> {
  const count = Number(formData.get("pl_count") || 0);
  if (!Number.isInteger(count) || count < 1) return { error: "Add at least one line." };
  if (count > MAX_LINES) return { error: `A packaging issue can have at most ${MAX_LINES} lines.` };

  type Line = {
    n: number;
    batchId: string;
    packSizeQty: number;
    packSizeUnit: string;
    unitCount: number;
    materials: MaterialInput[];
  };
  const lines: Line[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const label = `Line ${n}`;
    const batchId = String(formData.get(`pl_batch_${i}`) || "");
    if (!batchId) return { error: `${label}: select a finished product batch.` };

    const structured = parseStructuredPackSize(
      String(formData.get(`pl_size_qty_${i}`) || ""),
      String(formData.get(`pl_size_unit_${i}`) || "").trim(),
      label,
    );
    if ("error" in structured) return structured;

    const unitCountRaw = String(formData.get(`pl_units_${i}`) || "").trim();
    const unitCount = Number(unitCountRaw);
    if (!unitCountRaw || Number.isNaN(unitCount) || unitCount <= 0) {
      return { error: `${label}: unit count must be a positive number.` };
    }

    const materials = parseMaterials(formData, `ln${i}_`, label);
    if ("error" in materials) return materials;

    lines.push({
      n,
      batchId,
      packSizeQty: structured.qty,
      packSizeUnit: structured.unit,
      unitCount,
      materials,
    });
  }

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "packaging")) return { error: "Not authorized." };
  const supabase = await createClient();

  // Check each distinct batch once, and name the first line that uses a bad one.
  const batchIds = [...new Set(lines.map((l) => l.batchId))];
  const resolved = await Promise.all(batchIds.map((id) => resolveFpBatch(supabase, id)));
  const byBatch = new Map<string, ResolvedBatch | { error: string }>(batchIds.map((id, k) => [id, resolved[k]]));

  const rpcLines = [];
  for (const l of lines) {
    const info = byBatch.get(l.batchId)!;
    if ("error" in info) return { error: `Line ${l.n}: ${info.error}` };
    if (!info.packagedItemId) {
      return {
        error: `Line ${l.n}: this Finished Product has no paired Packaged Finished Product item on file yet (older MFR) — Store/R&D issue isn't available for it.`,
      };
    }
    const converted = info.fpUnit ? convertUnit(l.packSizeQty, l.packSizeUnit, info.fpUnit) : null;
    if (!info.fpUnit || converted === null) {
      return {
        error: `Line ${l.n}: pack size unit (${l.packSizeUnit}) isn't compatible with this Finished Product's unit (${info.fpUnit ?? "unset"}).`,
      };
    }
    rpcLines.push({
      finished_product_batch_id: l.batchId,
      pack_size: `${l.packSizeQty} ${l.packSizeUnit}`,
      pack_size_qty: l.packSizeQty,
      pack_size_unit: l.packSizeUnit,
      fp_qty_consumed: converted * l.unitCount,
      unit_count: l.unitCount,
      materials: l.materials.map((m) => ({
        item_id: m.itemId,
        quantity: m.quantity,
        unit: m.unit,
      })),
    });
  }

  // ACC-12 / FB-0052: every line and its materials are saved in ONE
  // database transaction — all or nothing. Every issue is a Pack (ACC-05).
  const { data: codes, error } = await supabase.rpc("create_packaging_issues", {
    p_header: { issue_date: issueDate, department },
    p_lines: rpcLines,
  });
  if (error)
    return {
      error: friendlyDbError(error, "Could not create the packaging issue."),
    };

  revalidatePath("/packaging");
  const made = Array.isArray(codes) ? (codes as string[]) : [];
  redirect(
    `/packaging?created=${made.length || lines.length}${made.length ? `&codes=${encodeURIComponent(made.join(","))}` : ""}`,
  );
}

// Production (19 Sept 2026 redesign, unchanged by FB-0052): a single, direct,
// same-unit "quantity to convert" — no pack size, no packaging materials;
// QC/Stability/R&D sample quantities (FB-0043, mandatory since 29 Sept)
// are reserved and the rest becomes new Raw Material stock (RM-FP).
async function createProductionIssue(formData: FormData, department: string, issueDate: string): Promise<ActionState> {
  const fpBatchId = String(formData.get("finished_product_batch_id") || "");
  if (!fpBatchId) return { error: "Select a finished product batch." };

  const qtyOrError = parseProductionQty(formData);
  if (typeof qtyOrError !== "number") return qtyOrError;
  const productionQty = qtyOrError;

  const sampleQtysOrError = parseProductionSampleQtys(formData);
  if ("error" in sampleQtysOrError) return sampleQtysOrError;
  const { qc: productionQc, stability: productionStability, rnd: productionRnd } = sampleQtysOrError;
  const productionSampleUnit = String(formData.get("production_sample_unit") || "").trim();
  if (!productionSampleUnit) {
    return { error: "Sample unit is required." };
  }

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "packaging")) return { error: "Not authorized." };

  const supabase = await createClient();
  const info = await resolveFpBatch(supabase, fpBatchId);
  if ("error" in info) return info;
  const fpUnit = info.fpUnit;

  // The quantity is already in the Finished Product's own unit (no unit
  // selector is offered); its paired Raw Material item
  // (production_rm_item_id) is created lazily by the DB trigger on first use.
  const fpQtyConsumed = productionQty;
  const packSize = fpUnit ? `${productionQty} ${fpUnit}` : String(productionQty);

  // FB-0043: convert the QC/Stability/R&D sample quantities (entered in
  // productionSampleUnit) down to the Finished Product's own unit.
  let qcConv = 0;
  let stabilityConv = 0;
  let rndConv = 0;
  if (productionQc + productionStability + productionRnd > 0) {
    if (!fpUnit)
      return {
        error: "Could not determine this Finished Product's unit for sample conversion.",
      };
    const q = convertUnit(productionQc, productionSampleUnit, fpUnit);
    const st = convertUnit(productionStability, productionSampleUnit, fpUnit);
    const r = convertUnit(productionRnd, productionSampleUnit, fpUnit);
    if (q === null || st === null || r === null) {
      return {
        error: `Sample unit (${productionSampleUnit}) isn't compatible with this Finished Product's unit (${fpUnit}).`,
      };
    }
    if (q + st + r > fpQtyConsumed) {
      return {
        error: "QC + Stability + R&D quantities can't exceed the quantity being converted.",
      };
    }
    qcConv = q;
    stabilityConv = st;
    rndConv = r;
  }

  // code (0067): plain sequential PKG-####, generated up front.
  const { data: issueCode, error: codeError } = await supabase.rpc("get_next_packaging_issue_code");
  if (codeError || !issueCode)
    return {
      error: friendlyDbError(codeError, "Could not generate a packaging issue code."),
    };

  const { error } = await supabase.rpc("create_packaging_issue", {
    p_issue: {
      code: issueCode,
      finished_product_batch_id: fpBatchId,
      pack_size: packSize,
      pack_size_qty: null,
      pack_size_unit: null,
      fp_qty_consumed: fpQtyConsumed,
      unit_count: productionQty,
      department,
      issue_date: issueDate,
      qc_qty: qcConv,
      stability_qty: stabilityConv,
      rnd_qty: rndConv,
    },
    p_materials: [],
  });
  if (error)
    return {
      error: friendlyDbError(error, "Could not create the packaging issue."),
    };

  revalidatePath("/packaging");
  redirect("/packaging?created=1");
}
