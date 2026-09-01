"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

export type PackagingRow = {
  id: string;
  pack_size: string;
  unit_count: number | string;
  department: string;
  transaction_type: string;
  created_at: string;
  finished_product_batches: { batch_number: string } | null;
  items: { name: string } | null;
};

// transaction_type -> an existing Badge status key so pack/repack/unpack read
// distinctly without adding a new style to components/ui/badge.tsx.
const TXN_BADGE_STATUS: Record<string, string> = { pack: "approved", repack: "submitted", unpack: "rejected" };

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
      header: "Packaging item",
      accessor: (r) => r.items?.name ?? "—",
      searchValue: (r) => r.items?.name ?? "",
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
