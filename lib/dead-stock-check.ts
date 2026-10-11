// SCAN-P8-02: Rejected qty, Balance qty and the values are typed by hand in
// the Dead Stock Register, so nothing stopped figures that contradict each
// other. This only warns (it never blocks a save): the register is kept by
// hand and the person may know better than the numbers.

import { roundMoney } from "@/lib/money";

export type DeadStockFigures = {
  quantity: number | null;
  rejected_qty: number | null;
  rejected_value: number | null;
  balance_qty: number | null;
  balance_value: number | null;
  purchase_price: number | null;
  depreciated_unit_value: number | null;
};

const EPS = 0.0005;
const q = (n: number) => String(Number(n.toFixed(3)));

export function deadStockWarnings(f: DeadStockFigures): string[] {
  const out: string[] = [];
  const qty = f.quantity ?? 0;
  const rej = f.rejected_qty ?? 0;
  if (rej > qty + EPS) out.push(`Rejected qty (${q(rej)}) is more than the quantity bought (${q(qty)}).`);
  else if (f.balance_qty !== null && Math.abs(qty - rej - f.balance_qty) > EPS) {
    out.push(`Balance qty is ${q(f.balance_qty)} but Qty ${q(qty)} minus Rejected qty ${q(rej)} is ${q(qty - rej)}.`);
  }
  // The value per unit the register uses: depreciated value when there is one, else the purchase price.
  const unit = f.depreciated_unit_value ?? f.purchase_price;
  if (unit !== null && f.balance_qty !== null && f.balance_value !== null) {
    const expected = roundMoney(f.balance_qty * unit);
    if (Math.abs(expected - f.balance_value) > 0.01) {
      out.push(`Balance value is ${roundMoney(f.balance_value)} but Balance qty ${q(f.balance_qty)} at ${roundMoney(unit)} each is ${expected}.`);
    }
  }
  // Rejected value is not checked: a written-off unit's value is a business call (often 0).
  return out;
}

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Reads the figures from the Add / Edit form as typed. */
export function figuresFromForm(form: HTMLFormElement): DeadStockFigures {
  const d = new FormData(form);
  const price = num(d.get("purchase_price"));
  const dep = num(d.get("depreciation_pct"));
  return {
    quantity: num(d.get("quantity")),
    rejected_qty: num(d.get("rejected_qty")),
    rejected_value: num(d.get("rejected_value")),
    balance_qty: num(d.get("balance_qty")),
    balance_value: num(d.get("balance_value")),
    purchase_price: price,
    depreciated_unit_value: price !== null && dep !== null ? roundMoney(price * (1 - dep / 100)) : null,
  };
}
