// ACC-14 (29 Sept 2026): which batches each label template may be printed
// for. The Approved RM and Finished Product labels print "Status: Approved",
// so they are offered only for batches that are approved right now; before,
// any batch could be picked — rejected, pending or due for retest.

export type RmQcState = "approved" | "under_test" | "rejected" | "on_hold";

export type RmLabelInput = {
  qcStatus: string;
  retestDate: string | null;
  expiryDate?: string | null;
  poSubmitted: boolean;
};

// today: the IST calendar day, yyyy-mm-dd.
export function rmQcState(r: RmLabelInput, today: string): RmQcState {
  if (r.qcStatus === "rejected") return "rejected";
  if (r.qcStatus === "approved") {
    // Due for retest: no longer usable until re-approved — it is back
    // under test.
    if (r.retestDate !== null && r.retestDate <= today) return "under_test";
    // Past its Expiry date (FB-0058): neither an Approved nor an Under Test label applies.
    if (r.expiryDate && r.expiryDate < today) return "on_hold";
    // Approved, but its purchase order was reopened for editing: not in
    // stock, so neither label applies until it is submitted again.
    if (!r.poSubmitted) return "on_hold";
    return "approved";
  }
  // not_submitted, submitted (Round 1 pending), checker_approved (Round 2
  // pending) — including a retest in progress.
  return "under_test";
}

export type LabelKind = "approved_rm" | "under_test" | "inprocess" | "finished_product";

export function rmEligibleFor(kind: LabelKind, r: RmLabelInput, today: string): boolean {
  const state = rmQcState(r, today);
  if (kind === "approved_rm") return state === "approved";
  if (kind === "under_test") return state === "under_test";
  if (kind === "inprocess") return state !== "rejected";
  return false;
}

export function fpEligibleForLabel(status: string): boolean {
  return status === "approved";
}

export const ELIGIBILITY_HINT: Record<LabelKind, string> = {
  approved_rm: "Only batches that are QC-approved now (not due for retest, purchase order submitted) are listed.",
  under_test: "Only batches awaiting a QC decision or due for retest are listed.",
  inprocess: "Rejected batches are not listed.",
  finished_product: "Only QC-approved finished product batches are listed.",
};
