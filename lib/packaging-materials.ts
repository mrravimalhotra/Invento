import { formatNumber } from "@/lib/utils";

// Shared between packaging-table.tsx (client, for the list column) and
// packaging/page.tsx (server, for the PDF export rows). Deliberately NOT in
// packaging-table.tsx itself: that file is "use client", and a Server
// Component can render a client component from such a file but cannot call
// a plain function exported from one directly — doing so throws an
// unhandled Server Components render error at request time (Next.js turns
// every export of a "use client" file into a client-only reference; only
// JSX rendering of the component exports is exempt). page.tsx was calling
// materialsSummary() to build pdfRows, which is exactly that mistake — this
// file exists so both sides have a plain, server-safe function to call.
export type PackagingMaterialRow = {
  quantity: number | string;
  unit: string;
  items: { name: string; item_code: string } | null;
};

// One issue can carry several materials (0027_packaging_multi_material.sql)
// — summarized here as "Bottle 500ml (12 count), Cap (12 count)" for both
// the list table and the PDF export, rather than a single item name.
export function materialsSummary(materials: PackagingMaterialRow[] | null): string {
  if (!materials || materials.length === 0) return "—";
  return materials.map((m) => `${m.items?.name ?? "—"} (${formatNumber(m.quantity, 0)} ${m.unit})`).join(", ");
}
