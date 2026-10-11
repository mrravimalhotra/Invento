// SCAN-P5-08 (11 Oct 2026): quantities are worked to three decimals (the weighing precision).
// The recipe scaling in Compose used to post figures like 0.058333333333333334 kg, and a batch
// drawn down in such fractions was left with a speck (0.00000000000002 kg) that blocked the
// oldest-first rule for the next batch. Now: the Compose quantities are rounded to three
// decimals, and a batch with less than half a milligram-unit left (0.0005) counts as empty in
// the oldest-first rule, the Compose picker, Ageing and the alerts.

export const STOCK_DECIMALS = 3;
/** Less than this left in a batch counts as nothing left. */
export const MIN_STOCK_QTY = 0.0005;

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
