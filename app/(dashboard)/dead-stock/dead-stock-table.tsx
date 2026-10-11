"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, formatQty } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";
import { deadStockWarnings } from "@/lib/dead-stock-check";

export type DeadStockRow = {
  id: string;
  asset_code: string;
  article_name: string;
  date_of_purchase: string | null;
  quantity: number;
  purchase_price: number | null;
  depreciation_pct: number;
  depreciated_unit_value: number | null;
  balance_qty: number | null;
  balance_value: number | null;
  rejected_qty: number | null;
  rejected_value: number | null;
  resolution_date: string | null;
  remark: string | null;
};

// SCAN-P8-02: figures typed by hand that contradict each other.
function warningsOf(r: DeadStockRow): string[] {
  return deadStockWarnings({
    quantity: Number(r.quantity),
    rejected_qty: r.rejected_qty === null ? null : Number(r.rejected_qty),
    rejected_value: r.rejected_value === null ? null : Number(r.rejected_value),
    balance_qty: r.balance_qty === null ? null : Number(r.balance_qty),
    balance_value: r.balance_value === null ? null : Number(r.balance_value),
    purchase_price: r.purchase_price === null ? null : Number(r.purchase_price),
    depreciated_unit_value: r.depreciated_unit_value === null ? null : Number(r.depreciated_unit_value),
  });
}

export function DeadStockTable({ rows }: { rows: DeadStockRow[] }) {
  const columns: Column<DeadStockRow>[] = [
    {
      header: "Code",
      accessor: (r) => <span className="font-mono text-xs">{r.asset_code}</span>,
      searchValue: (r) => r.asset_code,
    },
    {
      header: "Article",
      accessor: (r) => (
        <Link href={`/dead-stock/${r.id}`} className="font-medium text-brand-dark hover:underline">
          {r.article_name}
        </Link>
      ),
      searchValue: (r) => r.article_name,
    },
    // ACC-40: dd-mm-yyyy like every other screen (was the raw yyyy-mm-dd), and
    // Indian digit grouping on numbers (was ungrouped).
    { header: "Purchased", accessor: (r) => formatDate(r.date_of_purchase) },
    { header: "Qty", accessor: (r) => formatQty(r.quantity) },
    { header: "Purchase price / unit", accessor: (r) => formatNumber(r.purchase_price) },
    { header: "Depreciation %", accessor: (r) => `${formatNumber(r.depreciation_pct)}%` },
    { header: "Depreciated value / unit", accessor: (r) => formatNumber(r.depreciated_unit_value) },
    { header: "Rejected qty", accessor: (r) => formatQty(r.rejected_qty) },
    { header: "Rejected value", accessor: (r) => formatNumber(r.rejected_value) },
    { header: "Resolution date", accessor: (r) => formatDate(r.resolution_date) },
    { header: "Balance qty", accessor: (r) => formatQty(r.balance_qty) },
    { header: "Balance value", accessor: (r) => formatNumber(r.balance_value) },
    { header: "Remark", accessor: (r) => r.remark ?? "—", searchValue: (r) => r.remark ?? "" },
    {
      header: "Check",
      accessor: (r) => {
        const w = warningsOf(r);
        return w.length === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="text-xs font-medium text-amber" title={w.join(" ")}>
            Figures do not add up: {w.join(" ")}
          </span>
        );
      },
    },
  ];

  const exportConfig: TableExport<DeadStockRow> = {
    title: "Dead Stock Register",
    filename: "dead-stock-register",
    formats: ["excel"],
    columns: [
      { header: "Code", value: (r) => r.asset_code },
      { header: "Article", value: (r) => r.article_name },
      { header: "Purchased", type: "date", value: (r) => r.date_of_purchase },
      { header: "Qty", type: "number", decimals: 3, value: (r) => r.quantity },
      { header: "Purchase price / unit", type: "number", value: (r) => r.purchase_price },
      { header: "Depreciation %", type: "number", value: (r) => r.depreciation_pct },
      { header: "Depreciated value / unit", type: "number", value: (r) => r.depreciated_unit_value },
      { header: "Rejected qty", type: "number", decimals: 3, value: (r) => r.rejected_qty },
      { header: "Rejected value", type: "number", value: (r) => r.rejected_value },
      { header: "Resolution date", type: "date", value: (r) => r.resolution_date },
      { header: "Balance qty", type: "number", decimals: 3, value: (r) => r.balance_qty },
      { header: "Balance value", type: "number", value: (r) => r.balance_value },
      { header: "Remark", value: (r) => r.remark ?? "" },
      { header: "Check", value: (r) => warningsOf(r).join(" ") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No dead stock recorded yet."
      searchPlaceholder="Search assets…"
      exportConfig={exportConfig}
    />
  );
}
