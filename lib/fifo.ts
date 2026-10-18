import { MIN_STOCK_QTY, round3 } from "@/lib/stock-precision";

// Oldest-stock-first allocation for a finished product recipe line. Moved here
// from finished-product/new/compose/page.tsx (18 Oct 2026) so it can be unit tested.

export type Candidate = {
  // Which table this batch's live_remaining_qty is tracked in — Ravi (19
  // Sept 2026, "Packaging issued to Production" — see
  // supabase/migrations/0050_production_rm_from_packaging.sql): a
  // Production packaging issue converts bulk Finished Product into a new
  // Raw Material item's standing stock, tracked in production_issue_batches
  // rather than purchase_lines (that Raw Material item is never actually
  // purchased). A recipe ingredient can in principle draw from either table
  // — most items will only ever have one kind of batch, but the FIFO
  // allocator below treats them uniformly.
  source: "purchase" | "production";
  id: string;
  batchNumber: string;
  remainingQty: string | number;
  isLegacy?: boolean;
};

export type Allocation = {
  source: "purchase" | "production";
  id: string;
  batchNumber: string;
  qty: number;
  isLegacy?: boolean;
};

// Ravi (14 Sept 2026): "while creating a finished product batch, it should
// automatically show how much quantity will be taken from which batch" —
// getCandidateBatches() above already returns every eligible batch for an
// ingredient, but the form only ever let a person pick ONE of them, so a
// need that exceeded the single (oldest) batch's live_remaining_qty had no
// way to be expressed. Scoped with Ravi via AskUserQuestion: allocation is
// a fully automatic FIFO cascade (oldest batch first, then the next, and
// so on) with no per-batch override, and a shortfall across every
// QC-Approved batch blocks submission entirely rather than allowing a
// partial batch — the same all-or-nothing posture the old "No QC-Approved
// batch available" block already had for the zero-candidate case, just
// extended to the "some stock, not enough" case. No schema change:
// finished_product_components (0001_init.sql) never had a uniqueness
// constraint tying one row per (batch, item) — multiple rows for the same
// item against different purchase_line_id values, each independently
// gated by trg_fp_component_qc_gate and decremented by trg_fp_component_
// live_remaining_pull (0029_purchase_line_live_remaining_qty.sql), already
// worked at the DB level. This is a display/allocation change only.
// ACC-30 (29 Sept 2026): `alreadyTaken` carries what earlier recipe lines
// have already been allocated from each batch in this same composition, so
// the same raw material on two recipe lines is never promised the same
// stock twice (the save used to fail with "Not enough of that batch").
export function allocateFifo(
  candidates: Candidate[],
  neededQty: number,
  alreadyTaken: Map<string, number> = new Map()
): { allocations: Allocation[]; shortfallQty: number } {
  const allocations: Allocation[] = [];
  let remaining = round3(neededQty);
  for (const c of candidates) {
    if (remaining <= 0) break;
    const avail = Number(c.remainingQty) - (alreadyTaken.get(c.id) ?? 0);
    // SCAN-P5-08: less than 0.0005 left counts as empty (the database oldest-first rule agrees).
    if (avail < MIN_STOCK_QTY) continue;
    // Take the whole batch when it is not more than is needed, else exactly the three-decimal need.
    const take = avail <= remaining + 1e-9 ? Number(avail.toFixed(9)) : round3(remaining);
    allocations.push({ source: c.source, id: c.id, batchNumber: c.batchNumber, qty: take, isLegacy: c.isLegacy });
    alreadyTaken.set(c.id, (alreadyTaken.get(c.id) ?? 0) + take);
    remaining = round3(remaining - take);
  }
  // A shortfall under half a thousandth is rounding dust, not a real shortage.
  const shortfallQty = Math.max(remaining, 0);
  return { allocations, shortfallQty: shortfallQty < MIN_STOCK_QTY ? 0 : shortfallQty };
}
