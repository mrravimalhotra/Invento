"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";

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
};

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
    { header: "Purchased", accessor: (r) => r.date_of_purchase ?? "—" },
    { header: "Qty", accessor: (r) => r.quantity },
    { header: "Purchase price / unit", accessor: (r) => r.purchase_price ?? "—" },
    { header: "Depreciation %", accessor: (r) => `${r.depreciation_pct}%` },
    { header: "Depreciated value / unit", accessor: (r) => r.depreciated_unit_value ?? "—" },
    { header: "Balance qty", accessor: (r) => r.balance_qty ?? "—" },
    { header: "Balance value", accessor: (r) => r.balance_value ?? "—" },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No dead stock recorded yet."
      searchPlaceholder="Search assets…"
    />
  );
}
