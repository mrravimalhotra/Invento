"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";

export type BmrRow = {
  id: string;
  prepared_at: string | null;
  checked_at: string | null;
  approved_at: string | null;
  finished_product_batches: { batch_number: string } | null;
};

function bmrStage(row: BmrRow): { label: string; status: string } {
  if (row.approved_at) return { label: "Approved", status: "approved" };
  if (row.checked_at) return { label: "Checked", status: "submitted" };
  if (row.prepared_at) return { label: "Prepared", status: "submitted" };
  return { label: "Not started", status: "not_submitted" };
}

export function BmrTable({ rows }: { rows: BmrRow[] }) {
  const columns: Column<BmrRow>[] = [
    {
      header: "FP Batch",
      accessor: (r) => (
        <Link href={`/bmr/${r.id}`} className="font-medium text-brand hover:underline">
          {r.finished_product_batches?.batch_number ?? "—"}
        </Link>
      ),
      searchValue: (r) => r.finished_product_batches?.batch_number ?? "",
    },
    {
      header: "Status",
      accessor: (r) => {
        const stage = bmrStage(r);
        return <Badge status={stage.status}>{stage.label}</Badge>;
      },
    },
    {
      header: "",
      accessor: (r) => (
        <Link href={`/bmr/${r.id}`} className="text-sm text-brand hover:underline">
          Open
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} rows={rows} searchPlaceholder="Search by FP batch…" emptyLabel="No BMRs yet." />;
}
