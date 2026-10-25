// UX-05 (Ravi, 25 Oct 2026): one wording for every status code, so a status reads
// the same on every screen, list, export and trace. Batch usability states keep
// their own labels (BATCH_QC_LABELS in lib/batch-qc-status.ts).

const STATUS_LABELS: Record<string, string> = {
  // Quality checks (an AR record)
  submitted: "Awaiting QC",
  checker_approved: "Round 1 approved — awaiting review",
  checker_rejected: "Round 1 rejection proposed",
  approved: "Approved",
  rejected: "Rejected",
  // Finished product batches
  draft: "Draft",
  in_process: "In Process",
  complete_awaiting_qc: "Complete - Awaiting QC",
  submitted_to_qc: "Submitted to QC",
  cancelled: "Cancelled",
  // Raw material batches (label and trace screens)
  under_test: "Under test",
  not_submitted: "Not submitted",
};

/** The display name of a stored status code; an unknown code is shown with spaces and a capital. */
export function statusLabel(code: string | null | undefined): string {
  if (!code) return "";
  const known = STATUS_LABELS[code];
  if (known) return known;
  const words = code.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
