"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";
import {
  materialsSummary,
  rmFpBatchLines,
  rmFpBatchesText,
  rmFpItemCodes,
  rmFpItemCodesText,
  type PackagingMaterialRow,
  type ProductionIssueBatchRow,
} from "@/lib/packaging-materials";

export type { PackagingMaterialRow };

export type PackagingRow = {
  id: string;
  code: string;
  pack_size: string;
  unit_count: number | string;
  department: string;
  created_at: string;
  finished_product_batches: { batch_number: string } | null;
  packaging_issue_items: PackagingMaterialRow[] | null;
  production_issue_batches: ProductionIssueBatchRow[] | null;
};

export function PackagingTable({ rows }: { rows: PackagingRow[] }) {
  const columns: Column<PackagingRow>[] = [
    { header: "Code", accessor: (r) => r.code, searchValue: (r) => r.code },
    {
      header: "FP Batch",
      accessor: (r) => r.finished_product_batches?.batch_number ?? "—",
      searchValue: (r) => r.finished_product_batches?.batch_number ?? "",
    },
    { header: "Pack size", accessor: (r) => r.pack_size, searchValue: (r) => r.pack_size },
    { header: "Unit count", accessor: (r) => formatNumber(r.unit_count, 0) },
    { header: "Department", accessor: (r) => <Badge status={r.department}>{r.department}</Badge> },
    {
      header: "Packaging materials",
      accessor: (r) => materialsSummary(r.packaging_issue_items),
      searchValue: (r) => (r.packaging_issue_items ?? []).map((m) => m.items?.name ?? "").join(" "),
    },
    {
      header: "RM-FP item code",
      accessor: (r) => {
        const codes = rmFpItemCodes(r.production_issue_batches);
        return codes.length ? codes.map((c) => <div key={c} className="font-medium">{c}</div>) : "—";
      },
      searchValue: (r) => rmFpItemCodesText(r.production_issue_batches),
    },
    {
      header: "RM-FP batch",
      accessor: (r) => {
        const lines = rmFpBatchLines(r.production_issue_batches);
        return lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : "—";
      },
      searchValue: (r) => rmFpBatchesText(r.production_issue_batches),
    },
    { header: "Date", accessor: (r) => formatDate(r.created_at) },
  ];

  // Excel of the register (export decision (c), 29 Sept 2026); the PDF button stays on the page.
  const exportConfig: TableExport<PackagingRow> = {
    title: "Packing Register",
    filename: "packing-register",
    formats: ["excel"],
    columns: [
      { header: "Code", value: (r) => r.code },
      { header: "FP Batch", value: (r) => r.finished_product_batches?.batch_number ?? "" },
      { header: "Pack size", value: (r) => r.pack_size },
      { header: "Unit count", type: "number", decimals: 0, value: (r) => Number(r.unit_count) },
      { header: "Department", value: (r) => r.department },
      { header: "Packaging materials", value: (r) => (r.packaging_issue_items?.length ? materialsSummary(r.packaging_issue_items) : "") },
      { header: "RM-FP item code", value: (r) => (r.production_issue_batches?.length ? rmFpItemCodesText(r.production_issue_batches) : "") },
      { header: "RM-FP batch", value: (r) => (r.production_issue_batches?.length ? rmFpBatchesText(r.production_issue_batches) : "") },
      { header: "Date", type: "date", value: (r) => r.created_at },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by code, FP batch, RM-FP item or batch, or packaging item…"
      emptyLabel="No packaging issues yet."
      isLegacy={(r) => isLegacyCode(r.finished_product_batches?.batch_number)}
      exportConfig={exportConfig}
    />
  );
}
