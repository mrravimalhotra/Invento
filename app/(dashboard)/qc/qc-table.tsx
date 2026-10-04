"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, isLegacyCode, formatQty, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import { qcRecordStatusLabel } from "@/lib/batch-qc-status";
import type { TableExport } from "@/lib/table-export";

export type QcListRow = {
  id: string;
  ar_number: string;
  status: string;
  sample_qty: string | number | null;
  sample_unit: string | null;
  retest_date: string | null;
  expiry_date: string | null;
  is_retest: boolean;
  is_legacy: boolean;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string; is_legacy: boolean } | null;
  // FB-0027: nested mfr_definitions gives the Finished Product's own name,
  // since FP-context QC rows never get an `items` row of their own — see
  // the query comment in page.tsx for why.
  finished_product_batches: {
    batch_number: string;
    short_batch_no: string | null;
    is_legacy: boolean;
    mfr_definitions: { name: string } | null;
  } | null;
  // FB-0043: a Production-issued RM batch's own batch number — this row
  // already has a real `items` join (unlike the FP case above), so no
  // Item-column fallback is needed, only a Batch-column one.
  production_issue_batches: { batch_number: string } | null;
};

// AR numbers themselves are always freshly generated (get_next_ar_number()
// never produces a LEG- prefix — no legacy QC data was ever migrated, see
// claude/data-gap-analysis.md), so "legacy" for this table can't be read
// off the row's own code the way it is everywhere else. What can still be
// legacy is the batch/item a QC record was raised against — reused
// straight through from the Purchase/Item import. A row counts as legacy
// if any of those does.
function isLegacyQcRow(r: QcListRow) {
  return (
    isLegacyCode(r.items?.item_code) ||
    isLegacyCode(r.purchase_lines?.batch_number) ||
    isLegacyCode(r.finished_product_batches?.batch_number) ||
    isLegacyCode(r.production_issue_batches?.batch_number)
  );
}

export function QcTable({ rows }: { rows: QcListRow[] }) {
  const columns: Column<QcListRow>[] = [
    {
      header: "Analytical Report No.",
      accessor: (r) => (
        <span className="flex items-center gap-1.5">
          <Link href={`/qc/${r.id}`} className="font-medium text-brand-dark hover:underline">
            {r.ar_number}
          </Link>
          <LegacyTag show={r.is_legacy} />
          {r.is_retest && <Badge status="pending">Retest</Badge>}
        </span>
      ),
      searchValue: (r) => r.ar_number,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{qcRecordStatusLabel(r.status)}</Badge>,
      searchValue: (r) => r.status,
    },
    {
      header: "Item",
      // FB-0027 (12 Sept 2026): FP-context rows have no `items` row (see the
      // query comment in page.tsx), so fall back to the FP's own product
      // name via finished_product_batches.mfr_definitions — same fallback
      // in both the displayed value and what search matches against.
      accessor: (r) =>
        r.items
          ? `${r.items.item_code} — ${r.items.name}`
          : r.finished_product_batches?.mfr_definitions?.name ?? "—",
      // ACC-36: the code is matched as well as the name (the box says "item").
      searchValue: (r) =>
        r.items ? `${r.items.item_code} ${r.items.name}` : r.finished_product_batches?.mfr_definitions?.name ?? "",
    },
    {
      header: "Batch",
      accessor: (r) => (
        <>
          {r.purchase_lines?.batch_number ??
            (r.finished_product_batches
              ? fpBatchBoth(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
              : null) ??
            r.production_issue_batches?.batch_number ??
            "—"}
          <LegacyTag show={r.purchase_lines?.is_legacy || r.finished_product_batches?.is_legacy} />
        </>
      ),
      searchValue: (r) =>
        r.purchase_lines?.batch_number ??
        (r.finished_product_batches
          ? fpBatchBoth(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
          : null) ??
        r.production_issue_batches?.batch_number ??
        "",
    },
    {
      header: "Sample qty",
      accessor: (r) => (r.sample_qty !== null ? `${formatQty(r.sample_qty)} ${r.sample_unit ?? ""}` : "—"),
    },
    { header: "Retest date", accessor: (r) => formatDate(r.retest_date) },
    { header: "Expiry date", accessor: (r) => formatDate(r.expiry_date) },
  ];

  const exportConfig: TableExport<QcListRow> = {
    title: "Quality Control Register",
    filename: "qc-register",
    formats: ["excel", "pdf"],
    columns: [
      { header: "AR Number", value: (r) => r.ar_number },
      { header: "Source", value: (r) => (r.is_legacy || r.purchase_lines?.is_legacy || r.finished_product_batches?.is_legacy ? "Legacy" : "New") },
      { header: "Retest", value: (r) => (r.is_retest ? "Yes" : "No") },
      { header: "Status", value: (r) => qcRecordStatusLabel(r.status) },
      {
        header: "Item",
        value: (r) =>
          r.items ? `${r.items.item_code} — ${r.items.name}` : r.finished_product_batches?.mfr_definitions?.name ?? "",
      },
      {
        header: "Batch",
        value: (r) =>
          r.purchase_lines?.batch_number ??
          (r.finished_product_batches
            ? fpBatchShort(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
            : null) ??
          r.production_issue_batches?.batch_number ??
          "",
      },
      { header: "Sample qty", type: "number", decimals: 3, value: (r) => (r.sample_qty !== null ? Number(r.sample_qty) : null) },
      { header: "Sample unit", value: (r) => r.sample_unit ?? "" },
      { header: "Retest date", type: "date", value: (r) => r.retest_date },
      { header: "Expiry date", type: "date", value: (r) => r.expiry_date },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No quality checks yet."
      searchPlaceholder="Search Analytical Report No., item, or batch…"
      isLegacy={isLegacyQcRow}
      isOpeningStock={(r) => r.is_legacy || !!r.purchase_lines?.is_legacy || !!r.finished_product_batches?.is_legacy}
      exportConfig={exportConfig}
    />
  );
}
