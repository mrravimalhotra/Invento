// SCAN-P10-06: one place decides how money is worked out, so the screen, the
// order total and the Excel / PDF downloads always show the same rupees.
//
// Rule (stated on the order page): every line amount is rounded to the paisa,
// half a paisa rounding up. A line's Total Cost is its Item Total (quantity x
// unit price, to the paisa) plus its GST amount (to the paisa). An order's
// total is the sum of its rounded line totals. Working is done in whole paise
// so that 10.005 is 10.01 on every screen (floating point alone gives 10.00).

export const MONEY_RULE_TEXT =
  "Each line amount is rounded to the paisa (half a paisa rounds up). An order's total is the sum of its rounded line totals.";

/** Whole paise, half up, ignoring floating point noise (1000.4999999 -> 1000.5 -> 1001). */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  const scaled = Number((Math.abs(rupees) * 100).toFixed(6));
  const paise = Math.floor(scaled + 0.5);
  return rupees < 0 ? -paise : paise;
}

/** Rupees rounded to the paisa, half up. */
export function roundMoney(rupees: number): number {
  return toPaise(rupees) / 100;
}

/** Sum of amounts that are each already rounded to the paisa (added as whole paise). */
export function sumMoney(amounts: number[]): number {
  return amounts.reduce((sum, a) => sum + toPaise(a), 0) / 100;
}

export type MoneyLineInput = {
  quantity: string | number | null | undefined;
  unit_price: string | number | null | undefined;
  gst_pct: string | number | null | undefined;
};

/** The amounts of one purchase line, each to the paisa, so the columns add up exactly. */
export function lineMoney(l: MoneyLineInput) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const gst = Number(l.gst_pct) || 0;
  const basePaise = toPaise(qty * price);
  const gstPaise = toPaise((basePaise / 100) * (gst / 100));
  return {
    itemTotalExclGst: basePaise / 100,
    gstAmount: gstPaise / 100,
    lineTotal: (basePaise + gstPaise) / 100,
    priceInclGst: price * (1 + gst / 100),
  };
}
