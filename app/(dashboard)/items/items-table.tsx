"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Processed",
  packaging: "Packaging",
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
      accessor: (r) => (r.hasBalance ? formatNumber(r.on_hand) : "—"),
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
  ];

  return <DataTable columns={columns} rows={rows} searchPlaceholder="Search items…" emptyLabel="No items yet." />;
}
