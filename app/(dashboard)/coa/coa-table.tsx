"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type CoaRow = {
  id: string;
  coa_number: string;
  issued_at: string;
  file_url: string | null;
  coa_type: string | null;
  quality_checks: {
    ar_number: string;
    items: { item_code: string; name: string } | null;
    purchase_lines: { batch_number: string } | null;
  } | null;
  finished_product_batches: { batch_number: string; short_batch_no: string | null } | null;
};

export function CoaTable({ rows }: { rows: CoaRow[] }) {
  const columns: Column<CoaRow>[] = [
    {
      header: "COA Number",
      accessor: (r) => <span className="font-medium">{r.coa_number}</span>,
      searchValue: (r) => r.coa_number,
    },
    {
      header: "Analytical Report No.",
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
      accessor: (r) =>
        r.quality_checks?.purchase_lines?.batch_number ??
        (r.finished_product_batches
          ? fpBatchBoth(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
          : "—"),
    },
    { header: "Issued", accessor: (r) => formatDate(r.issued_at) },
    {
      header: "Certificate",
      // coa_type (renamed from subject_type, patch 0019) is only ever set
      // by the new generate-in-app flow (lib/actions/coa.ts's
      // generateCoaCertificate) — rows the old "paste a file URL" flow
      // created (createCoaRecord, retired 22 Sept 2026) have coa_type null
      // and keep showing their external link instead, exactly as they
      // always have. Nothing about an old row changes; the two flows' rows
      // just render differently here.
      accessor: (r) =>
        r.coa_type ? (
          <Link href={`/coa/${r.id}`} className="text-brand-dark hover:underline">
            View / Download
          </Link>
        ) : r.file_url ? (
          <a href={r.file_url} target="_blank" rel="noreferrer" className="text-brand-dark hover:underline">
            Link
          </a>
        ) : (
          "—"
        ),
    },
  ];

  const exportConfig: TableExport<CoaRow> = {
    title: "Certificates of Analysis",
    filename: "coa-register",
    formats: ["pdf"],
    columns: [
      { header: "COA Number", value: (r) => r.coa_number },
      { header: "AR Number", value: (r) => r.quality_checks?.ar_number ?? "" },
      {
        header: "Item",
        value: (r) => (r.quality_checks?.items ? `${r.quality_checks.items.item_code} — ${r.quality_checks.items.name}` : ""),
      },
      {
        header: "Batch",
        value: (r) =>
          r.quality_checks?.purchase_lines?.batch_number ??
          (r.finished_product_batches
            ? fpBatchShort(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
            : ""),
      },
      { header: "Issued", type: "date", value: (r) => r.issued_at },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No certificates issued yet."
      searchPlaceholder="Search COA or Analytical Report No.…"
      exportConfig={exportConfig}
    />
  );
}
