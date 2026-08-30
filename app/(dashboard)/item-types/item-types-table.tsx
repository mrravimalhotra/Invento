"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";

export type ItemTypeRow = {
  id: string;
  description: string;
  active: boolean;
};

export function ItemTypesTable({ rows }: { rows: ItemTypeRow[] }) {
  const columns: Column<ItemTypeRow>[] = [
    {
      header: "Description",
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
      header: "",
      accessor: (r) => (
        <Link href={`/item-types/${r.id}`} className="text-sm text-brand hover:underline">
          Edit
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} searchPlaceholder="Search item types…" emptyLabel="No item types yet." />;
}
