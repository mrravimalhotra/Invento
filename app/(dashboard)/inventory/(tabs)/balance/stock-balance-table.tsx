"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber } from "@/lib/utils";

export type BalanceRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
  onHand: number;
  low: boolean;
};

export function StockBalanceTable({ rows }: { rows: BalanceRow[] }) {
  const columns: Column<BalanceRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted">{r.item_code}</div>
        </div>
      ),
      searchValue: (r) => `${r.name} ${r.item_code}`,
    },
    {
      header: "Category",
      accessor: (r) => <span className="capitalize">{r.category}</span>,
      searchValue: (r) => r.category,
    },
    {
      header: "On hand",
      accessor: (r) => (
        <span className={r.low ? "font-semibold text-red" : "font-medium"}>
          {formatNumber(r.onHand)} {r.unit}
        </span>
      ),
      sortValue: (r) => r.onHand,
    },
    {
      header: "Low-stock threshold",
      accessor: (r) => (r.low_stock_threshold === null ? "—" : `${formatNumber(r.low_stock_threshold)} ${r.unit ?? ""}`),
    },
    {
      header: "Status",
      accessor: (r) =>
        r.low_stock_threshold === null ? (
          <span className="text-xs text-muted">No threshold set</span>
        ) : r.low ? (
          <Badge status="rejected">Low stock</Badge>
        ) : (
          <Badge status="approved">OK</Badge>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item name or code…"
      emptyLabel="No active items yet."
      pageSize={20}
    />
  );
}
