"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, isLegacyCode, formatQty } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Finished product",
  packaging: "Packaging",
  packaged_fp: "Packaged finished product",
};

export type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  category: string;
  unit: string | null;
  active: boolean;
  low_stock_threshold: string | number | null;
  item_types: { description: string } | null;
  on_hand: number;
  hasBalance: boolean;
  created_at: string;
};

export function ItemsTable({ rows }: { rows: ItemRow[] }) {
  const columns: Column<ItemRow>[] = [
    {
      header: "Item code",
      accessor: (r) => (
        <Link href={`/items/${r.id}`} className="font-medium text-brand hover:underline">
          {r.item_code}
        </Link>
      ),
      searchValue: (r) => r.item_code,
    },
    { header: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
    { header: "Category", accessor: (r) => CATEGORY_LABELS[r.category] ?? r.category },
    { header: "Type", accessor: (r) => r.item_types?.description ?? "—" },
    { header: "Unit", accessor: (r) => r.unit ?? "—" },
    {
      header: "Stock on hand",
      accessor: (r) => (r.hasBalance ? formatQty(r.on_hand) : "—"),
    },
    {
      header: "Low stock",
      accessor: (r) =>
        r.low_stock_threshold != null && r.on_hand < Number(r.low_stock_threshold) ? (
          <Badge status="rejected">Low</Badge>
        ) : null,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.active ? "approved" : "not_submitted"}>{r.active ? "Active" : "Inactive"}</Badge>,
    },
    {
      header: "Created",
      accessor: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>,
    },
  ];

  // Export decision (c), 29 Sept 2026: Excel of the item list.
  const exportConfig: TableExport<ItemRow> = {
    title: "Item Master",
    filename: "item-master",
    formats: ["excel"],
    columns: [
      { header: "Item code", value: (r) => r.item_code },
      { header: "Name", value: (r) => r.name },
      { header: "Category", value: (r) => CATEGORY_LABELS[r.category] ?? r.category },
      { header: "Type", value: (r) => r.item_types?.description ?? "" },
      { header: "Unit", value: (r) => r.unit ?? "" },
      { header: "Stock on hand", type: "number", decimals: 3, value: (r) => (r.hasBalance ? r.on_hand : null) },
      { header: "Low-stock threshold", type: "number", decimals: 3, value: (r) => (r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null) },
      { header: "Low stock", value: (r) => (r.low_stock_threshold != null && r.on_hand < Number(r.low_stock_threshold) ? "Low" : "") },
      { header: "Status", value: (r) => (r.active ? "Active" : "Inactive") },
      { header: "Created", type: "date", value: (r) => r.created_at },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search items…"
      emptyLabel="No items yet."
      isLegacy={(r) => isLegacyCode(r.item_code)}
      exportConfig={exportConfig}
    />
  );
}
