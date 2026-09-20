// Shared "is this raw-material batch usable" status, derived from
// purchase_batch_status (0001_init.sql: qc_status + retest_date, one row
// per purchase_line via a lateral join to its latest quality_checks row).
//
// Introduced 3 Sept 2026 for the RM Report's new QC Status column (Ravi:
// "stock should clearly suggest QC Pending, QC Passed, Awaiting Retest").
// Mirrors, on the read side, the same rule check_batch_qc_approved()
// (0026_qc_retest_consumption_gate.sql) now enforces at the DB level for
// Finished Product composition and BMR weighment: a batch is only really
// "clear" when qc_status = 'approved' AND its retest_date (if any) hasn't
// arrived yet. 'submitted' (an AR exists but hasn't been reviewed) and
// 'not_submitted' (no AR at all) are folded into one "pending" bucket —
// both mean "not usable yet," and the QC list page's own "Awaiting QC" /
// AR-status badges already distinguish them for anyone who needs that.
export type BatchQcState = "qc_pending" | "approved" | "awaiting_retest" | "rejected";

export const BATCH_QC_LABELS: Record<BatchQcState, string> = {
  qc_pending: "QC Pending",
  approved: "QC Approved",
  awaiting_retest: "Awaiting Retest",
  rejected: "QC Rejected",
};

export function computeBatchQcState(
  qcStatus: string | null | undefined,
  retestDate: string | null | undefined,
  today: string = new Date().toISOString().slice(0, 10)
): BatchQcState {
  if (qcStatus === "approved") {
    return retestDate && retestDate <= today ? "awaiting_retest" : "approved";
  }
  if (qcStatus === "rejected") return "rejected";
  // 'submitted', 'checker_approved' (two-round review, 20 Sept 2026 — see
  // docs/modules/qc.md), or 'not_submitted' (or missing/unknown) — all
  // three read as "hasn't fully cleared QC yet," same as before this
  // pass; the batch only becomes usable once Round 2 (QC Reviewer) clears
  // it, matching check_batch_qc_approved()'s own gate.
  return "qc_pending";
}

// Display label for a raw quality_checks.status value (the AR's own
// status, distinct from BATCH_QC_LABELS above which is the *batch's*
// derived usability). Ravi's exact phrasing for the intermediate stage
// ("it will show as approved - Awaiting Review") — every other status
// keeps the generic underscore-to-space fallback already used elsewhere
// (qc-table.tsx, the QC Register report).
export function qcRecordStatusLabel(status: string): string {
  if (status === "checker_approved") return "Approved - Awaiting Review";
  return status.replace(/_/g, " ");
}
