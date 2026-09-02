// Application-level status sync for Finished Product batches (DESIGN.md §4.8).
//
// The legacy system gates FP release on QC approval — a "Finish Product Intimation
// Slip" to QC — which the first draft of the requirements review wrongly said didn't
// exist (corrected finding). finished_product_batches.status only ever gets set to
// 'in_process' or 'submitted_to_qc' by this module's own Server Actions; the actual
// approved/rejected verdict is set on the linked quality_checks row by the existing
// QC Review screen (/qc/[id], built by another agent), which we don't rebuild here.
//
// A DB trigger syncing finished_product_batches.status from quality_checks would be
// the clean fix, but this pass is not allowed to add new migrations (AGENT_BRIEFING.md)
// — so instead we compute the *displayed* status at read time: if a related
// quality_checks row exists and its status is approved/rejected, show that; otherwise
// fall back to the batch's own status column. Known follow-up: add that trigger in a
// later migration so finished_product_batches.status itself stays authoritative.
//
// UPDATE (Inventory Ledger redesign, Phase 3 — 0030_finished_product_ledger.sql):
// that trigger now exists (trg_qc_review_finished_product on quality_checks) and
// finished_product_batches.status is authoritative going forward — this read-time
// computation is kept as-is rather than ripped out across every caller, since it's
// now harmless defense-in-depth: for any batch touched after 0030 landed, latestQc's
// status and the batch's own status column agree by construction, so
// resolveDisplayStatus() just confirms what the DB already says. It only still does
// real work for the rare edge case the trigger itself declines to handle (an MFR
// whose finished_product_item_id is null) — even there the DB status is synced, so
// this now only matters if callers ever fall out of sync with a fresh read.

export type QcStatusRow = { finished_product_batch_id: string; status: string; created_at: string };

export function resolveDisplayStatus(batchStatus: string, latestQc: { status: string } | undefined | null): string {
  if (latestQc && (latestQc.status === "approved" || latestQc.status === "rejected")) {
    return latestQc.status;
  }
  return batchStatus;
}

/** Reduces a flat list of quality_checks rows (any order) to the most recent one per FP batch. */
export function latestQcByBatch(rows: QcStatusRow[]): Map<string, QcStatusRow> {
  const map = new Map<string, QcStatusRow>();
  for (const row of rows) {
    const existing = map.get(row.finished_product_batch_id);
    if (!existing || new Date(row.created_at) > new Date(existing.created_at)) {
      map.set(row.finished_product_batch_id, row);
    }
  }
  return map;
}
