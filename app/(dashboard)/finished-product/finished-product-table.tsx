"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";
import { resolveDisplayStatus } from "@/lib/finished-product-status";

export type FpRow = {
  id: string;
  batch_number: string;
  target_qty: string | number;
  unit: string;
  actual_yield_pct: string | number | null;
  finish_date: string | null;
  status: string;
  mfr_definitions: { name: string } | null;
  latestQcStatus: string | undefined;
};

export function FinishedProductTable({ rows }: { rows: FpRow[] }) {
  const columns: Column<FpRow>[] = [
    {
      header: "Batch",
      accessor: (r) => (
        <Link href={`/finished-product/${r.id}`} className="font-medium text-brand hover:underline">
          {r.batch_number}
        </Link>
      ),
      searchValue: (r) => r.batch_number,
    },
    { header: "MFR", accessor: (r) => r.mfr_definitions?.name ?? "—", searchValue: (r) => r.mfr_definitions?.name ?? "" },
    {
      header: "Status",
      accessor: (r) => {
        const status = resolveDisplayStatus(r.status, r.latestQcStatus ? { status: r.latestQcStatus } : undefined);
        return <Badge status={status}>{status.replace(/_/g, " ")}</Badge>;
      },
    },
    { header: "Target qty", accessor: (r) => `${formatNumber(r.target_qty)} ${r.unit}` },
    { header: "Actual yield %", accessor: (r) => (r.actual_yield_pct != null ? `${formatNumber(r.actual_yield_pct)}%` : "—") },
    { header: "Finish date", accessor: (r) => formatDate(r.finish_date) },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search batch number or MFR…"
      emptyLabel="No finished product batches yet."
    />
  );
}
