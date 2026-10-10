export type AgeingBucket = "expired" | "retest_overdue" | "d30" | "d60" | "d90" | "later";

// Expiry and Retest Ageing (0108): where a batch sits depends on the earlier of
// its retest date and expiry date. Already past: Expired (expiry date passed)
// beats Retest overdue; otherwise the days until that earlier date decide.

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function bucketFor(retest: string | null, expiry: string | null, today: string): { bucket: AgeingBucket; days: number; due: "Retest" | "Expiry"; dueDate: string } {
  const expired = expiry !== null && expiry < today;
  const retestPast = retest !== null && retest < today;
  // The earlier date decides how soon it matters.
  let due: "Retest" | "Expiry" = "Expiry";
  let dueDate = expiry ?? "";
  if (retest !== null && (expiry === null || retest <= expiry)) {
    due = "Retest";
    dueDate = retest;
  }
  const days = daysBetween(today, dueDate);
  if (expired) return { bucket: "expired", days: daysBetween(today, expiry as string), due: "Expiry", dueDate: expiry as string };
  if (retestPast) return { bucket: "retest_overdue", days: daysBetween(today, retest as string), due: "Retest", dueDate: retest as string };
  const bucket: AgeingBucket = days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "later";
  return { bucket, days, due, dueDate };
}

