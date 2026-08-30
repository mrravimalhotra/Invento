"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";

export type CoaRow = {
  id: string;
  coa_number: string;
  issued_at: string;
  file_url: string | null;
  quality_checks: {
    ar_number: string;
    items: { item_code: string; name: string } | null;
    purchase_lines: { batch_number: string } | null;
  } | null;
  finished_product_batches: { batch_number: string } | null;
};

export function CoaTable({ rows }: { rows: CoaRow[] }) {
  const columns: Column<CoaRow>[] = [
    {
      header: "COA Number",
      accessor: (r) => <span className="font-medium">{r.coa_number}</span>,
      searchValue: (r) => r.coa_number,
    },
    {
      header: "AR Number",
      accessor: (r) => r.quality_checks?.ar_number ?? "—",
      searchValue: (r) => r.quality_checks?.ar_number ?? "",
    },
    {
      header: "Item",
      accessor: (r) => (r.quality_checks?.items ? `${r.quality_checks.items.item_code} — ${r.quality_checks.items.name}` : "—"),
      searchValue: (r) => r.quality_checks?.items?.name ?? "",
    },
    {
      header: "Batch",
      accessor: (r) => r.quality_checks?.purchase_lines?.batch_number ?? r.finished_product_batches?.batch_number ?? "—",
    },
    { header: "Issued", accessor: (r) => formatDate(r.issued_at) },
    {
      header: "File",
      accessor: (r) =>
        r.file_url ? (
          <a href={r.file_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">
            Link
          </a>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <DataTable columns={columns} rows={rows} emptyLabel="No certificates issued yet." searchPlaceholder="Search COA or AR number…" />
  );
}
