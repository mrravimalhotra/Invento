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
import { beforeDateError, istDay } from "@/lib/date-rules";

// lineErrors (FB-0052): a message that belongs to one line of the Store/R&D
// form (keyed by line number, 1-based) — shown as plain red text under that
// line; `error` is then only the short pop-up pointing at it.
export type ActionState = { error?: string; success?: string; lineErrors?: Record<number, string> } | undefined;

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

// Production (Ravi, 19 Sept 2026 redesign; FB-0043 samples; several lines
// since 2 Oct 2026, FB-0052): "when Packaging is issued to production - it
// would become available as Raw material for another Finished Product".
// A Production line is a single, direct, same-unit quantity (no pack size, no
// packaging materials; the paired Raw Material item shares the Finished
// Product's own unit — 0050) plus the QC / Stability / R&D samples reserved
// from it, entered in a sample unit and converted to the product's unit.
// Ravi 29 Sept: QC, Stability and Sample unit are mandatory (0 is a valid,
// typed value); Ravi 2 Oct: R&D quantity is optional (empty = 0).
type ProductionLineInput = {
  n: number;
  batchId: string;
  qty: number;
  qc: number;
  stability: number;
  rnd: number;
  sampleUnit: string;
};

function parseProductionLines(formData: FormData): ProductionLineInput[] | { error: string } {
  const count = Number(formData.get("pr_count") || 0);
  if (!Number.isInteger(count) || count < 1) return { error: "Add at least one line." };
  if (count > 30) return { error: "A packaging issue can have at most 30 lines." };
  const lines: ProductionLineInput[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const label = `Line ${n}`;
    const batchId = String(formData.get(`pr_batch_${i}`) || "");
    if (!batchId) return { error: `${label}: select a finished product batch.` };

    const qtyRaw = String(formData.get(`pr_qty_${i}`) || "").trim();
    const qty = Number(qtyRaw);
    if (!qtyRaw || !Number.isFinite(qty) || qty <= 0) {
      return { error: `${label}: quantity to convert must be a positive number.` };
    }

    const qcRaw = String(formData.get(`pr_qc_${i}`) || "").trim();
    const stabilityRaw = String(formData.get(`pr_stab_${i}`) || "").trim();
    const rndRaw = String(formData.get(`pr_rnd_${i}`) || "").trim();
    if (!qcRaw) return { error: `${label}: QC quantity is required (enter 0 if none).` };
    if (!stabilityRaw) return { error: `${label}: Stability quantity is required (enter 0 if none).` };
    const qc = Number(qcRaw);
    const stability = Number(stabilityRaw);
    const rnd = rndRaw ? Number(rndRaw) : 0;
    if (!Number.isFinite(qc) || qc < 0) return { error: `${label}: QC quantity can't be negative.` };
    if (!Number.isFinite(stability) || stability < 0)
      return { error: `${label}: Stability quantity can't be negative.` };
    if (!Number.isFinite(rnd) || rnd < 0) return { error: `${label}: R&D quantity can't be negative.` };

    const sampleUnit = String(formData.get(`pr_unit_${i}`) || "").trim();
    if (!sampleUnit) return { error: `${label}: sample unit is required.` };

    lines.push({ n, batchId, qty, qc, stability, rnd, sampleUnit });
  }
  return lines;
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
  issueDate: string,
): Promise<ResolvedBatch | { error: string }> {
  const [{ data: fpBatch }, { data: latestQcRow }, { data: batchRow }] = await Promise.all([
    supabase.from("finished_product_batches").select("status").eq("id", fpBatchId).maybeSingle(),
    supabase
      .from("quality_checks")
      .select("status, created_at, reviewed_at")
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
  // Date rule (Ravi, 3 Oct 2026): nothing is issued from a batch before the
  // day QC approved it.
  const approvalDateError = beforeDateError(issueDate, istDay(latestQcRow?.reviewed_at), "Issue date", "the QC approval date of this batch");
  if (approvalDateError) return { error: approvalDateError };
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
  return createProductionIssues(formData, issueDate);
}

// Store / R&D (FB-0052): bulk Finished Product is transformed into a
// Packaged Finished Product and immediately issued out. Each line = one FP
// batch + one pack size (qty + unit, compatible with the FP's unit) + unit
// count + packaging materials; FP consumed = pack size × unit count,
// converted to the FP's unit. All lines are saved in ONE database
// transaction (create_packaging_issues, 0093) — one PKG-#### per line, and
// lines drawing on the same batch are checked against it together.
// A message that starts "Line N:" belongs under that line on the form.
function placeUnderLine(result: ActionState): ActionState {
  const m = result?.error ? /^Line (\d+): /.exec(result.error) : null;
  if (result?.error && m) {
    return { error: `Packaging issue not saved: check line ${m[1]}.`, lineErrors: { [Number(m[1])]: result.error } };
  }
  return result;
}

async function createStoreRndIssues(formData: FormData, department: string, issueDate: string): Promise<ActionState> {
  return placeUnderLine(await saveStoreRndIssues(formData, department, issueDate));
}

async function saveStoreRndIssues(formData: FormData, department: string, issueDate: string): Promise<ActionState> {
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
  const resolved = await Promise.all(batchIds.map((id) => resolveFpBatch(supabase, id, issueDate)));
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

async function createProductionIssues(formData: FormData, issueDate: string): Promise<ActionState> {
  return placeUnderLine(await saveProductionIssues(formData, issueDate));
}

async function saveProductionIssues(formData: FormData, issueDate: string): Promise<ActionState> {
  const parsed = parseProductionLines(formData);
  if ("error" in parsed) return parsed;
  const lines = parsed;

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "packaging")) return { error: "Not authorized." };
  const supabase = await createClient();

  // Check each distinct batch once. (The database refuses the same batch on
  // two lines — Ravi, 2 Oct 2026 — with the line named.)
  const batchIds = [...new Set(lines.map((l) => l.batchId))];
  const resolved = await Promise.all(batchIds.map((id) => resolveFpBatch(supabase, id, issueDate)));
  const byBatch = new Map<string, ResolvedBatch | { error: string }>(batchIds.map((id, k) => [id, resolved[k]]));

  const rpcLines = [];
  for (const l of lines) {
    const info = byBatch.get(l.batchId)!;
    if ("error" in info) return { error: `Line ${l.n}: ${info.error}` };
    const fpUnit = info.fpUnit;

    // FB-0043: samples are entered in the sample unit; convert to the product's own unit.
    let qc = 0;
    let stability = 0;
    let rnd = 0;
    if (l.qc + l.stability + l.rnd > 0) {
      if (!fpUnit)
        return { error: `Line ${l.n}: could not determine this Finished Product's unit for sample conversion.` };
      const q = convertUnit(l.qc, l.sampleUnit, fpUnit);
      const st = convertUnit(l.stability, l.sampleUnit, fpUnit);
      const r = convertUnit(l.rnd, l.sampleUnit, fpUnit);
      if (q === null || st === null || r === null) {
        return {
          error: `Line ${l.n}: sample unit (${l.sampleUnit}) isn't compatible with this Finished Product's unit (${fpUnit}).`,
        };
      }
      const total = q + st + r;
      if (total > l.qty + 1e-9) {
        return {
          error: `Line ${l.n}: QC + Stability + R&D (${Math.round(total * 1e6) / 1e6} ${fpUnit}) can't exceed the quantity to convert (${l.qty} ${fpUnit}).`,
        };
      }
      qc = q;
      stability = st;
      rnd = r;
    }

    rpcLines.push({
      finished_product_batch_id: l.batchId,
      pack_size: fpUnit ? `${l.qty} ${fpUnit}` : String(l.qty),
      fp_qty_consumed: l.qty,
      unit_count: l.qty,
      qc_qty: qc,
      stability_qty: stability,
      rnd_qty: rnd,
    });
  }

  // All lines in ONE database transaction (create_production_issues, 0095).
  const { data: codes, error } = await supabase.rpc("create_production_issues", {
    p_header: { issue_date: issueDate },
    p_lines: rpcLines,
  });
  if (error) return { error: friendlyDbError(error, "Could not create the packaging issue.") };

  revalidatePath("/packaging");
  const made = Array.isArray(codes) ? (codes as string[]) : [];
  redirect(
    `/packaging?created=${made.length || lines.length}${made.length ? `&codes=${encodeURIComponent(made.join(","))}` : ""}`,
  );
}
