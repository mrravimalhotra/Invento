import { computeBatchQcState } from "@/lib/batch-qc-status";

// ACC-22 (29 Sept 2026): the raw-material "Available for FP production" card
// on the item page used the item's total on-hand, which also counts batches
// that production cannot use — awaiting QC, rejected, or due for retest — so
// the card promised stock that Compose would not offer. This is the same rule
// Compose (finished-product/new/compose) and the database QC gate
// (check_batch_qc_approved, 0078) apply:
//
//   usable = the batch is QC-approved, is not due for retest, is not past its
  //            expiry date (FB-0058), and (for a
//            purchased batch) its purchase order is submitted.
//
// Everything else that is still in stock is "not yet usable", split by why.
// A batch whose purchase order was reopened for editing is not in stock at
// all (the reopen reverses its ledger entries), so it is left out of both
// figures rather than reported as stock.

export type RmBatchStock = {
  liveRemaining: number;
  qcStatus: string | null;
  retestDate: string | null;
  expiryDate?: string | null;
  // False only for a purchased batch whose purchase order was reopened.
  inStock: boolean;
};

export type RmStockSplit = {
  usable: number;
  awaitingQc: number;
  rejected: number;
  dueForRetest: number;
  expired: number;
  notYetUsable: number;
};

// today: the IST calendar day, yyyy-mm-dd.
export function splitRmStock(batches: RmBatchStock[], today: string): RmStockSplit {
  const out: RmStockSplit = { usable: 0, awaitingQc: 0, rejected: 0, dueForRetest: 0, expired: 0, notYetUsable: 0 };
  for (const b of batches) {
    if (!b.inStock) continue;
    if (!(b.liveRemaining > 0)) continue;
    const state = computeBatchQcState(b.qcStatus, b.retestDate, today, b.expiryDate);
    if (state === "approved") out.usable += b.liveRemaining;
    else if (state === "rejected") out.rejected += b.liveRemaining;
    else if (state === "awaiting_retest") out.dueForRetest += b.liveRemaining;
    else if (state === "expired") out.expired += b.liveRemaining;
    else out.awaitingQc += b.liveRemaining;
  }
  // 0104: a rejected batch is no longer in stock (it is listed under Rejected
  // Materials), so it is reported separately and is not "not yet usable".
  out.notYetUsable = out.awaitingQc + out.dueForRetest + out.expired;
  return out;
}
