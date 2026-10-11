// Plain helper, deliberately NOT in a "use client" file: it's called from both
// the server component (page.tsx, for the total-value summary card) and the
// client table component. A function exported from a "use client" module
// becomes a client reference for every importer, including server code, so
// calling it server-side throws "Attempted to call X() from the server but
// X is on the client" — keep pure helpers like this one in a plain module.

import { lineMoney } from "@/lib/money";

export type LineFinancialsInput = {
  quantity: string;
  unit_price: string | null;
  gst_pct: string | null;
};

// SCAN-P10-06: the sums live in lib/money.ts (every amount to the paisa).
export function lineFinancials(l: LineFinancialsInput) {
  return lineMoney(l);
}

export function purchaseLineTotal(l: LineFinancialsInput) {
  return lineMoney(l).lineTotal;
}
