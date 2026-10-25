// UX-17 (25 Oct 2026): which User Guide section explains each screen. Keys are path
// prefixes; the longest match wins. Values are the section ids pandoc gives the guide's
// headings (docs/user-guide/USER_GUIDE.md).
const HELP_SECTIONS: Record<string, string> = {
  "/": "dashboard",
  "/item-types": "item-type-master",
  "/items": "item-master",
  "/vendors": "vendor-master",
  "/equipment": "instrument-equipment-master",
  "/dead-stock": "dead-stock-register",
  "/purchase": "purchase",
  "/inventory": "inventory-ledger",
  "/qc": "quality-control",
  "/labels": "label-printing",
  "/coa": "certificate-of-analysis",
  "/documents": "sop-stp-documents",
  "/audit": "audit-log",
  "/mfr": "mfr",
  "/finished-product": "finished-product",
  "/packaging": "packaging",
  "/user-roles": "user-roles-access",
  "/reports": "reports",
  "/feedback": "tester-feedback",
  "/bulk-upload": "bulk-data-upload",
  "/opening-stock": "opening-stock",
  "/company": "company-details",
  "/admin/purge-test-data": "purge-test-data",
  "/admin/stock-integrity": "stock-integrity-check",
  "/profile": "your-profile",
};

export function helpHref(pathname: string): string | null {
  let best: string | null = null;
  for (const prefix of Object.keys(HELP_SECTIONS)) {
    const hit = prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(prefix + "/");
    if (hit && (best === null || prefix.length > best.length)) best = prefix;
  }
  return best === null ? null : `/user-guide#${HELP_SECTIONS[best]}`;
}

export const HELP_SECTION_IDS = Object.values(HELP_SECTIONS);
