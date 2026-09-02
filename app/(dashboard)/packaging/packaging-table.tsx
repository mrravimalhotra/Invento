"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

export type PackagingMaterialRow = {
  quantity: number | string;
  unit: string;
  items: { name: string; item_code: string } | null;
};

export type PackagingRow = {
  id: string;
  pack_size: string;
  unit_count: number | string;
  department: string;
  transaction_type: string;
  created_at: string;
  finished_product_batches: { batch_number: string } | null;
  packaging_issue_items: PackagingMaterialRow[] | null;
};

// transaction_type -> an existing Badge status key so pack/repack/unpack read
// distinctly without adding a new style to components/ui/badge.tsx.
const TXN_BADGE_STATUS: Record<string, string> = { pack: "approved", repack: "submitted", unpack: "rejected" };

// One issue can now carry several materials (0027_packaging_multi_material.sql)
// — summarized here as "Bottle 500ml (12 count), Cap (12 count)" for both the
// list table and the PDF export, rather than a single item name.
export function materialsSummary(materials: PackagingMaterialRow[] | null): string {
  if (!materials || materials.length === 0) return "—";
  return materials.map((m) => `${m.items?.name ?? "—"} (${formatNumber(m.quantity, 0)} ${m.unit})`).join(", ");
}

export function PackagingTable({ rows }: { rows: PackagingRow[] }) {
  const columns: Column<PackagingRow>[] = [
    {
      header: "FP Batch",
      accessor: (r) => r.finished_product_batches?.batch_number ?? "—",
      searchValue: (r) => r.finished_product_batches?.batch_number ?? "",
    },
    { header: "Pack size", accessor: (r) => r.pack_size, searchValue: (r) => r.pack_size },
    { header: "Unit count", accessor: (r) => formatNumber(r.unit_count, 0) },
    { header: "Department", accessor: (r) => <Badge status={r.department}>{r.department}</Badge> },
    {
      header: "Type",
      accessor: (r) => <Badge status={TXN_BADGE_STATUS[r.transaction_type] ?? "pending"}>{r.transaction_type}</Badge>,
    },
    {
      header: "Packaging materials",
      accessor: (r) => materialsSummary(r.packaging_issue_items),
      searchValue: (r) => (r.packaging_issue_items ?? []).map((m) => m.items?.name ?? "").join(" "),
    },
    { header: "Date", accessor: (r) => formatDate(r.created_at) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by FP batch or packaging item…"
      emptyLabel="No packaging issues yet."
      isLegacy={(r) => isLegacyCode(r.finished_product_batches?.batch_number)}
    />
  );
}
