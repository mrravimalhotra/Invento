import { toIstDateString, todayIst } from "@/lib/utils";

// ACC-26 (29 Sept 2026): helpers for the Dashboard's "last 30 days" charts.
//
// Before, each chart grouped rows by a "MMM d" label in the order rows
// happened to arrive, using the browser's own time zone, and dropped days on
// which nothing happened. The line then jumped over quiet days and (for a
// chart built from unsorted rows) could show days out of order. Now every
// chart uses the same list of 30 India-time calendar days, oldest first, and
// a day with no activity shows 0.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-03" + delta days -> "2026-09-02" etc. Pure calendar arithmetic
// (UTC), so it is not affected by the machine's time zone or daylight saving.
export function addDaysToDate(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

// The last `n` India-time calendar days ending today, oldest first.
export function lastIstDays(n: number, today: string = todayIst()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDaysToDate(today, -i));
  return out;
}

// "2026-09-03" -> "Sep 3"
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export type DayPoint = { day: string; value: number };

// One point per day in `days` (in that order). Rows whose day is outside the
// list are ignored; days with no rows are 0.
export function dailySeries<T>(
  rows: T[],
  days: string[],
  timestampOf: (r: T) => string,
  valueOf: (r: T) => number
): DayPoint[] {
  const totals = new Map<string, number>(days.map((d) => [d, 0]));
  for (const r of rows) {
    const day = toIstDateString(timestampOf(r));
    if (totals.has(day)) totals.set(day, (totals.get(day) ?? 0) + valueOf(r));
  }
  return days.map((day) => ({ day, value: totals.get(day) ?? 0 }));
}

// Value of a purchase line including GST — the same rule the Purchase list
// uses for an order's total (quantity x unit price x (1 + GST%)).
export function lineValueInclGst(
  quantity: number | string | null | undefined,
  unitPrice: number | string | null | undefined,
  gstPct: number | string | null | undefined
): number {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPct) || 0;
  return qty * price * (1 + gst / 100);
}
