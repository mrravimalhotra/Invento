// Plain helper, deliberately NOT in a "use client" file: it's called from both
// the server component (page.tsx, for the total-value summary card) and the
// client table component. A function exported from a "use client" module
// becomes a client reference for every importer, including server code, so
// calling it server-side throws "Attempted to call X() from the server but
// X is on the client" — keep pure helpers like this one in a plain module.

export type LineFinancialsInput = {
  quantity: string;
  unit_price: string | null;
  gst_pct: string | null;
};

export function lineFinancials(l: LineFinancialsInput) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const gst = Number(l.gst_pct) || 0;
  const base = qty * price;
  const gstAmount = base * (gst / 100);
  return {
    // "Item Total Excl GST" (2 Sept 2026) — same number as `base` above,
    // just exposed under the name the rest of the app now shows it as:
    // Total Cost (₹) − GST amount(₹), which is definitionally qty × price.
    itemTotalExclGst: base,
    gstAmount,
    priceInclGst: price * (1 + gst / 100),
    lineTotal: base + gstAmount,
  };
}

export function purchaseLineTotal(l: LineFinancialsInput) {
  return lineFinancials(l).lineTotal;
}
