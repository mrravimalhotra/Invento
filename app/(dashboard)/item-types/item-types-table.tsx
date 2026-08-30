"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

export type ItemTypeRow = {
  id: string;
  description: string;
  active: boolean;
  created_at: string;
};

export function ItemTypesTable({ rows }: { rows: ItemTypeRow[] }) {
  const columns: Column<ItemTypeRow>[] = [
    {
      header: "ItemType",
      accessor: (r) => (
        <Link href={`/item-types/${r.id}`} className="font-medium text-brand hover:underline">
          {r.description}
        </Link>
      ),
      searchValue: (r) => r.description,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.active ? "approved" : "not_submitted"}>{r.active ? "Active" : "Inactive"}</Badge>,
    },
    {
      header: "Created",
      accessor: (r) => <span className="text-muted">{formatDate(r.created_at)}</span>,
    },
    {
      header: "Actions",
      accessor: (r) => (
        <Link href={`/item-types/${r.id}`} className="text-sm text-brand hover:underline">
          View / Edit
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} searchPlaceholder="Search item types…" emptyLabel="No item types yet." />;
}
