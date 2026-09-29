// UX-01 / UX-02 (29 Sept 2026): confirmation text for actions whose page
// changes state underneath the form that was clicked (QC decision, PO Final
// Submit, FP draft Create / Cancel, Submit to QC). The form itself is gone
// or replaced by the time the result comes back, so a `success` string
// returned from the action was never seen. These actions now redirect to the
// same page with `?saved=<key>` and the page shows the message once, using
// the same banner style as the `?created=1` notices on the create screens.
export const SAVED_MESSAGES = {
  qc_round1_approved:
    "Decision saved: Approved. This AR now goes to a QC Reviewer for the final decision.",
  qc_round1_rejected: "Decision saved: Rejected. The batch is rejected and this record can no longer be edited.",
  qc_round2_approved: "Final decision saved: Approved. The retest date has been set.",
  qc_round2_rejected: "Final decision saved: Rejected. The batch is rejected.",
  po_submitted: "Purchase order submitted — inventory has been updated.",
  fp_draft_created: "Draft batch created. Confirm it with Create Batch within 30 minutes, or cancel it.",
  fp_confirmed: "Batch created — now in process.",
  fp_cancelled: "Batch cancelled — its raw material has been returned to inventory.",
  fp_completed: "Batch completed — now Complete - Awaiting QC.",
  fp_submitted_to_qc: "Submitted to QC. A QC record has been created for this batch.",
} as const;

export type SavedKey = keyof typeof SAVED_MESSAGES;

// Only known keys are shown, so a hand-edited URL can never put arbitrary
// text on the page.
export function savedMessage(key: string | string[] | undefined): string | null {
  const k = Array.isArray(key) ? key[0] : key;
  if (!k) return null;
  return Object.prototype.hasOwnProperty.call(SAVED_MESSAGES, k) ? SAVED_MESSAGES[k as SavedKey] : null;
}
