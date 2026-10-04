// Display names for the ledger's three event types (Ravi, 4 Oct 2026: "Push"
// and "Pull" renamed). The stored values stay push / pull / wastage — only what
// people read changes.
//
//   push    -> Stock In   (stock added: receipt, yield, sample returned, ...)
//   pull    -> Stock Out  (stock taken: samples, production use, issue, ...)
//   wastage -> Wastage    (written off)

export const LEDGER_EVENT_LABELS: Record<string, string> = {
  push: "Stock In",
  pull: "Stock Out",
  wastage: "Wastage",
};

export function ledgerEventLabel(eventType: string): string {
  return LEDGER_EVENT_LABELS[eventType] ?? eventType.replace(/^\w/, (c) => c.toUpperCase());
}
