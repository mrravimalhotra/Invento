"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";

export type QcListRow = {
  id: string;
  ar_number: string;
  status: string;
  sample_qty: string | number | null;
  sample_unit: string | null;
  retest_date: string | null;
  is_retest: boolean;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string } | null;
  finished_product_batches: { batch_number: string } | null;
};

export function QcTable({ rows }: { rows: QcListRow[] }) {
  const columns: Column<QcListRow>[] = [
    {
      header: "AR Number",
      accessor: (r) => (
        <span className="flex items-center gap-1.5">
          <Link href={`/qc/${r.id}`} className="font-medium text-brand-dark hover:underline">
            {r.ar_number}
          </Link>
          {r.is_retest && <Badge status="pending">Retest</Badge>}
        </span>
      ),
      searchValue: (r) => r.ar_number,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{r.status.replace("_", " ")}</Badge>,
      searchValue: (r) => r.status,
    },
    {
      header: "Item",
      accessor: (r) => (r.items ? `${r.items.item_code} — ${r.items.name}` : "—"),
      searchValue: (r) => r.items?.name ?? "",
    },
    {
      header: "Batch",
      accessor: (r) => r.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "—",
      searchValue: (r) => r.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "",
    },
    {
      header: "Sample qty",
      accessor: (r) => (r.sample_qty !== null ? `${formatNumber(r.sample_qty)} ${r.sample_unit ?? ""}` : "—"),
    },
    { header: "Retest date", accessor: (r) => formatDate(r.retest_date) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No quality checks yet."
      searchPlaceholder="Search AR number, item, or batch…"
    />
  );
}
