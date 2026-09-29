// ACC-24 (29 Sept 2026): each QC round's result comes from that round's own
// fields. Before, Round 1 was read from the record's final status, so a
// record the QC Checker approved and the QC Reviewer then rejected showed
// Round 1 as "Rejected" — and a Round 1 rejection also showed an empty
// "Round 2 decision" card as if the reviewer had rejected it.

export type QcRoundFields = {
  status: string;
  checker_at: string | null;
  reviewed_at: string | null;
};

export type RoundOutcome = "pending" | "approved" | "rejected" | "not_recorded" | "not_reached";

export function qcRoundOutcomes(r: QcRoundFields): { round1: RoundOutcome; round2: RoundOutcome } {
  if (r.status === "submitted") return { round1: "pending", round2: "not_reached" };

  // Records decided before the two-round review (0054) have no Round 1
  // fields: their single decision is shown as Round 2 (the final one).
  const round1Recorded = r.checker_at !== null;
  const round2Happened = r.reviewed_at !== null && (r.status === "approved" || r.status === "rejected");

  let round1: RoundOutcome;
  if (!round1Recorded) round1 = "not_recorded";
  else if (r.status === "rejected" && !round2Happened) round1 = "rejected";
  else round1 = "approved";

  let round2: RoundOutcome;
  if (round2Happened) round2 = r.status === "approved" ? "approved" : "rejected";
  else if (r.status === "checker_approved") round2 = "pending";
  else round2 = "not_reached";

  return { round1, round2 };
}
