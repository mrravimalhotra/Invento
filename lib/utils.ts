import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
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
