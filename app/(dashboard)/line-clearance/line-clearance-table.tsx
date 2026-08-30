"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

export type LineClearanceRow = {
  id: string;
  area: string;
  batch_reference: string | null;
  status: "clear" | "not_clear";
  checked_at: string;
};

export function LineClearanceTable({ rows }: { rows: LineClearanceRow[] }) {
  const columns: Column<LineClearanceRow>[] = [
    { header: "Area", accessor: (r) => <span className="font-medium">{r.area}</span>, searchValue: (r) => r.area },
    {
      header: "Batch reference",
      accessor: (r) => r.batch_reference || "—",
      searchValue: (r) => r.batch_reference ?? "",
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{r.status === "clear" ? "Clear" : "Not clear"}</Badge>,
    },
    { header: "Checked at", accessor: (r) => formatDate(r.checked_at) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by area or batch reference…"
      emptyLabel="No line clearance checks recorded yet."
    />
  );
}
