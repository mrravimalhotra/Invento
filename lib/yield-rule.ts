// SCAN-P5-05 (Ravi, 11 Oct 2026): a batch yield is judged against the batch size.
//
//   - Within the MFR's range (at least the permissible yield, at most the theoretical
//     yield, 100 % when the MFR has none): saved as typed.
//   - Outside that range: a written reason is required and is stored with the batch so
//     QC can see it.
//   - Above 150 % of the batch size: refused (one extra zero adds stock that does not exist).
//
// The yield and the batch size are in the batch's own unit.

export const MAX_YIELD_PCT_OF_BATCH = 150;

export type YieldCheck = {
  /** Yield as a percentage of the batch size; null when it cannot be worked out. */
  pct: number | null;
  /** Above the hard ceiling: cannot be saved. */
  blocked: boolean;
  /** Outside the MFR range: a written reason is required. */
  needsReason: boolean;
  /** Plain-words range, e.g. "98% to 100%". */
  rangeText: string;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function checkYield(args: {
  batchYield: number | string | null | undefined;
  batchSize: number | string | null | undefined;
  theoreticalPct?: number | string | null;
  permissiblePct?: number | string | null;
}): YieldCheck {
  const y = num(args.batchYield);
  const size = num(args.batchSize);
  const upper = num(args.theoreticalPct) ?? 100;
  const lower = num(args.permissiblePct);
  const rangeText = lower !== null ? `${lower}% to ${upper}%` : `up to ${upper}%`;
  if (y === null || size === null || size <= 0) return { pct: null, blocked: false, needsReason: false, rangeText };
  const pct = Math.round((y / size) * 10000) / 100;
  const blocked = pct > MAX_YIELD_PCT_OF_BATCH;
  const needsReason = !blocked && (pct > upper || (lower !== null && pct < lower));
  return { pct, blocked, needsReason, rangeText };
}

export function yieldBlockedMessage(pct: number): string {
  return `A yield of ${pct}% of the batch size is not accepted (the limit is ${MAX_YIELD_PCT_OF_BATCH}%). Check the quantity for a typing mistake.`;
}
