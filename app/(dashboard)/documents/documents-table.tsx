"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  doc_type: "sop" | "stp";
  title: string;
  revision_number: number;
  file_url: string;
  effective_date: string | null;
  active: boolean;
};

export function DocumentsTable({ rows }: { rows: DocumentRow[] }) {
  const columns: Column<DocumentRow>[] = [
    {
      header: "Type",
      accessor: (r) => <Badge status={r.doc_type === "sop" ? "approved" : "submitted"}>{r.doc_type.toUpperCase()}</Badge>,
      searchValue: (r) => r.doc_type,
    },
    {
      header: "Title",
      accessor: (r) => <span className="font-medium">{r.title}</span>,
      searchValue: (r) => r.title,
    },
    { header: "Revision", accessor: (r) => `Rev ${r.revision_number}` },
    { header: "Effective date", accessor: (r) => formatDate(r.effective_date) },
    {
      header: "File",
      accessor: (r) => (
        <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
          Open link
        </a>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by title, or type sop / stp…"
      emptyLabel="No documents recorded yet."
    />
  );
}
