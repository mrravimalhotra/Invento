import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// FB-0026 (12 Sept 2026, Namrata Gaikwad): every date this app displays
// through formatDate() — Expiry/Re-Test Date columns, and along with them
// every other date rendered via this same shared helper (submitted/
// approved/reviewed/checked/recorded/finish/invoice/issued dates, etc.,
// across Purchase, QC, Reports, BMR, Inventory and Finished Product) — now
// renders as numeric dd-mm-yyyy (e.g. "13-09-2026") instead of the previous
// textual-month "13 Sept 2026" style. Deliberately built by hand rather
// than left to toLocaleDateString's own formatting: en-IN's 2-digit
// day/month/year output uses "/" as a separator ("13/09/2026"), and the
// ticket specifically asked for hyphens. Uses the JS Date's local-timezone
// getters, same as the previous toLocaleDateString call did implicitly —
// no change to which calendar day a given timestamp resolves to, only to
// how it's written out.
//
// Out of scope for this fix (Ravi, 13 Sept 2026): native <input
// type="date"> fields (e.g. the "Expiry date" pickers on Finished Product
// Step 1 and Complete Batch) — their displayed format is set by the
// browser/OS locale, not by this app, and isn't something formatDate()
// touches. Also out of scope: label-picker.tsx's separate month/year-only
// "Best Before" formatter, which has no day component to reformat.
export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatNumber(n: number | string | null | undefined, decimals = 2) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}

// FB-0003: rows brought over from the old (pre-v2) app during the legacy
// data import are consistently coded with a "LEG-" prefix ahead of their
// normal code (e.g. LEG-RM-01967, LEG-V-00019, LEG-PO-14) — see
// claude/legacy-data-mapping.md. No app-generated code (RM-/PKG-/FP-/V-/
// PO-/F-/COA-/AR-/FB-...) ever starts with "LEG-", so this is a safe,
// unambiguous way to tell legacy-imported rows apart from ones created in
// v2, without a dedicated is_legacy column.
export function isLegacyCode(code: string | null | undefined) {
  return !!code && code.startsWith("LEG-");
}
