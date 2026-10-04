"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode, formatQty, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import { resolveDisplayStatus, fpStatusLabel } from "@/lib/finished-product-status";
import type { TableExport } from "@/lib/table-export";

export type FpRow = {
  id: string;
  batch_number: string;
  short_batch_no: string | null;
  is_legacy: boolean;
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
        <>
          <Link href={`/finished-product/${r.id}`} className="font-medium text-brand hover:underline">
            {fpBatchBoth(r.batch_number, r.short_batch_no)}
          </Link>
          <LegacyTag show={r.is_legacy} />
        </>
      ),
      searchValue: (r) => fpBatchBoth(r.batch_number, r.short_batch_no),
    },
    { header: "MFR", accessor: (r) => r.mfr_definitions?.name ?? "—", searchValue: (r) => r.mfr_definitions?.name ?? "" },
    {
      header: "Status",
      accessor: (r) => {
        const status = resolveDisplayStatus(r.status, r.latestQcStatus ? { status: r.latestQcStatus } : undefined);
        return <Badge status={status}>{fpStatusLabel(status)}</Badge>;
      },
    },
    { header: "Target qty", accessor: (r) => `${formatQty(r.target_qty)} ${r.unit}` },
    { header: "Actual yield %", accessor: (r) => (r.actual_yield_pct != null ? `${formatNumber(r.actual_yield_pct)}%` : "—") },
    { header: "Finish date", accessor: (r) => formatDate(r.finish_date) },
  ];

  const exportConfig: TableExport<FpRow> = {
    title: "Finished Product Register",
    filename: "finished-product-register",
    formats: ["excel", "pdf"],
    columns: [
      { header: "Batch", value: (r) => fpBatchShort(r.batch_number, r.short_batch_no) },
      { header: "Source", value: (r) => (r.is_legacy ? "Legacy" : "New") },
      { header: "MFR", value: (r) => r.mfr_definitions?.name ?? "" },
      {
        header: "Status",
        value: (r) =>
          fpStatusLabel(resolveDisplayStatus(r.status, r.latestQcStatus ? { status: r.latestQcStatus } : undefined)),
      },
      { header: "Target qty", type: "number", decimals: 3, value: (r) => Number(r.target_qty) },
      { header: "Unit", value: (r) => r.unit },
      { header: "Actual yield %", type: "number", value: (r) => (r.actual_yield_pct != null ? Number(r.actual_yield_pct) : null) },
      { header: "Finish date", type: "date", value: (r) => r.finish_date },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search batch number or MFR…"
      emptyLabel="No finished product batches yet."
      isLegacy={(r) => isLegacyCode(r.batch_number)}
      isOpeningStock={(r) => r.is_legacy}
      exportConfig={exportConfig}
    />
  );
}
