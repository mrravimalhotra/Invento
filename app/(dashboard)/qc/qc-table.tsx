"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

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

// AR numbers themselves are always freshly generated (get_next_ar_number()
// never produces a LEG- prefix — no legacy QC data was ever migrated, see
// claude/data-gap-analysis.md), so "legacy" for this table can't be read
// off the row's own code the way it is everywhere else. What can still be
// legacy is the batch/item a QC record was raised against — reused
// straight through from the Purchase/Item import. A row counts as legacy
// if any of those does.
function isLegacyQcRow(r: QcListRow) {
  return (
    isLegacyCode(r.items?.item_code) ||
    isLegacyCode(r.purchase_lines?.batch_number) ||
    isLegacyCode(r.finished_product_batches?.batch_number)
  );
}

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
      isLegacy={isLegacyQcRow}
    />
  );
}
