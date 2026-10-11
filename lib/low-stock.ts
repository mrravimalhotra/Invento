// SCAN-P3-10 (Ravi, 11 Oct 2026): the low-stock warning for raw material compares the
// threshold with the stock production can actually use now (QC approved, not due for
// retest, not expired), not with everything on the shelf. On hand also holds batches
// that are awaiting QC, due for retest or past expiry, which production cannot take, so
// 120 kg on hand of which 100 kg is expired used to raise no warning at all.
// Packaging and finished product have no QC split and keep comparing with on hand.

export type LowStockInput = {
  category: string;
  threshold: number | string | null | undefined;
  onHand: number;
  /** Usable stock from item_stock_status; only read for raw material. */
  usable: number | null | undefined;
};

export type LowStockResult = {
  low: boolean;
  /** The figure compared with the threshold. */
  compared: number;
  basis: "usable" | "on_hand";
};

export function lowStockCheck({ category, threshold, onHand, usable }: LowStockInput): LowStockResult {
  const basis = category === "raw" ? "usable" : "on_hand";
  const compared = basis === "usable" ? usable ?? 0 : onHand;
  const t = threshold === null || threshold === undefined || threshold === "" ? null : Number(threshold);
  return { low: t !== null && Number.isFinite(t) && compared < t, compared, basis };
}
