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
// ACC-13 (29 Sept 2026): the business runs on India time, but the app server
// (Vercel) runs in UTC — so dates were worked out in UTC: between midnight
// and 05:30 IST "today" was still yesterday, and a timestamp formatted on the
// server showed the UTC day/time (e.g. the Audit Log detail page showed a
// different time from the list, and COA dates prefilled a day early). Every
// date below is now worked out in IST, wherever the code runs.
export const IST_TIME_ZONE = "Asia/Kolkata";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const istTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The IST calendar day of a timestamp, as "YYYY-MM-DD". A date-only value ("2026-09-14") is returned as-is. */
export function toIstDateString(d: string | Date): string {
  if (typeof d === "string" && DATE_ONLY.test(d)) return d;
  const date = typeof d === "string" ? new Date(d) : d;
  return istDateFormatter.format(date); // en-CA formats as YYYY-MM-DD
}

/** Today's date in India, as "YYYY-MM-DD" — use instead of new Date().toISOString().slice(0, 10). */
export function todayIst(): string {
  return toIstDateString(new Date());
}

/** Start / end of an IST calendar day, for timestamp filters (e.g. .gte("event_at", istDayStart(from))). */
export function istDayStart(day: string): string {
  return `${day}T00:00:00+05:30`;
}
export function istDayEnd(day: string): string {
  return `${day}T23:59:59.999+05:30`;
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  if (typeof d !== "string" && Number.isNaN(d.getTime())) return "—";
  if (typeof d === "string" && !DATE_ONLY.test(d) && Number.isNaN(new Date(d).getTime())) return "—";
  const [year, month, day] = toIstDateString(d).split("-");
  return `${day}-${month}-${year}`;
}

// Audit Log (21 Sept 2026) needs a precise "when," not just a day — same
// dd-mm-yyyy convention as formatDate() above, with HH:mm (24-hour) appended,
// both in IST.
export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(date)} ${istTimeFormatter.format(date)}`;
}

export function formatNumber(n: number | string | null | undefined, decimals = 2) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-IN", { maximumFractionDigits: decimals });
}

// ACC-28 (29 Sept 2026): quantities show up to 3 decimals, trailing zeros
// trimmed (0.004 kg, 2.5 ltr, 1,250 kg). Two decimals showed 0.004 kg as "0"
// while printed slips already use 3, so screen and slip disagreed. Money,
// percentages and readings keep formatNumber()'s 2 (or their own) decimals.
export function formatQty(n: number | string | null | undefined) {
  return formatNumber(n, 3);
}

// FB-0003: rows brought over from the old (pre-v2) app during the legacy
// data import are consistently coded with a "LEG-" prefix ahead of their
// normal code (e.g. LEG-RM-01967, LEG-V-00019, LEG-PO-14) — see
// claude/legacy-data-mapping.md. No app-generated code (RM-/PKG-/FP-/V-/
// PO-/MFR-/COA-/AR-/FB-...) ever starts with "LEG-", so this is a safe,
// unambiguous way to tell legacy-imported rows apart from ones created in
// v2, without a dedicated is_legacy column.
export function isLegacyCode(code: string | null | undefined) {
  return !!code && code.startsWith("LEG-");
}

// Escapes Postgres LIKE/ILIKE special characters (%, _, \) so a raw string
// can be used as an EXACT-match pattern via .ilike() — Postgres has no
// case-insensitive `=`, and .ilike() is the standard workaround, but its
// pattern syntax treats "%" and "_" as wildcards. Without escaping, a name
// containing one of those characters (e.g. "50% Extract", "Vitamin B_12")
// would silently match extra rows instead of being compared literally.
// Used by the duplicate-name/identity checks added 13 Sept 2026 (Ravi, via
// AskUserQuestion: block duplicate Item Name, MFR Name, Equipment Name,
// Dead Stock Article Name, and Purchase Invoice Number per vendor, across
// both bulk upload and the regular one-at-a-time forms).
export function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`);
}
