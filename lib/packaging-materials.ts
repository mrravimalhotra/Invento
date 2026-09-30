import { formatQty } from "@/lib/utils";

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
  return materials.map((m) => `${m.items?.name ?? "—"} (${formatQty(m.quantity)} ${m.unit})`).join(", ");
}

// B26 (30 Sept 2026): a Production issue turns finished product into a new
// raw-material item (RM-FP-…) and batch(es). These are read from
// production_issue_batches so the Packing Register can show them.
export type ProductionIssueBatchRow = {
  batch_number: string;
  quantity: number | string;
  unit: string;
  active?: boolean | null;
  items: { item_code: string } | null;
};

function activeBatches(batches: ProductionIssueBatchRow[] | null): ProductionIssueBatchRow[] {
  return (batches ?? []).filter((b) => b.active !== false);
}

// "RM-FP-00001" (one line per distinct item code), or "—" when there is none.
export function rmFpItemCodes(batches: ProductionIssueBatchRow[] | null): string[] {
  const codes = activeBatches(batches).map((b) => b.items?.item_code ?? "—");
  return Array.from(new Set(codes));
}

// "FP-02-26 (50 kg)" — one entry per batch.
export function rmFpBatchLines(batches: ProductionIssueBatchRow[] | null): string[] {
  return activeBatches(batches).map((b) => `${b.batch_number} (${formatQty(b.quantity)} ${b.unit})`);
}

export function rmFpItemCodesText(batches: ProductionIssueBatchRow[] | null): string {
  const c = rmFpItemCodes(batches);
  return c.length ? c.join(", ") : "—";
}

export function rmFpBatchesText(batches: ProductionIssueBatchRow[] | null): string {
  const l = rmFpBatchLines(batches);
  return l.length ? l.join("; ") : "—";
}
