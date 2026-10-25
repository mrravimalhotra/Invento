"use client";

import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber, formatQty } from "@/lib/utils";
import { BATCH_QC_LABELS } from "@/lib/batch-qc-status";
import type { RmReportExportRow } from "./rm-report-export";
import type { TableExport } from "@/lib/table-export";

export function RmReportTable({ rows, asOf }: { rows: RmReportExportRow[]; asOf: string }) {
  const columns: Column<RmReportExportRow>[] = [
    { header: "Item", accessor: (r) => r.item, searchValue: (r) => r.item },
    {
      header: "Batch No.",
      accessor: (r) => (
        <>
          {r.batchNumber}
          <LegacyTag show={r.isLegacy} />
        </>
      ),
      searchValue: (r) => r.batchNumber,
    },
    { header: "PQTY", accessor: (r) => formatQty(r.pqty) },
    { header: "SQTY", accessor: (r) => formatQty(r.sqty) },
    { header: "QTY", accessor: (r) => <span className="font-medium">{formatQty(r.qty)}</span> },
    { header: "Unit", accessor: (r) => r.unit },
    { header: "Unit Price", accessor: (r) => (r.unitPrice === null ? <span className="text-muted">No price</span> : formatNumber(r.unitPrice)) },
    { header: "Total", accessor: (r) => (r.total === null ? <span className="text-muted">No price</span> : formatNumber(r.total)) },
    {
      header: "QC Status",
      accessor: (r) => <Badge status={r.qcState}>{BATCH_QC_LABELS[r.qcState]}</Badge>,
      searchValue: (r) => BATCH_QC_LABELS[r.qcState],
    },
  ];

  // Export decision (c), 29 Sept 2026: Excel added next to the existing
  // Export PDF (which is unchanged).
  const exportConfig: TableExport<RmReportExportRow> = {
    title: `RM Report — current stock as of ${asOf}`,
    filename: `rm-report-current-${asOf}`,
    formats: ["excel"],
    columns: [
      { header: "Item", value: (r) => r.item },
      { header: "Batch No.", value: (r) => r.batchNumber },
      { header: "Source", value: (r) => (r.isLegacy ? "Legacy" : "New") },
      { header: "PQTY", type: "number", decimals: 3, value: (r) => r.pqty },
      { header: "SQTY", type: "number", decimals: 3, value: (r) => r.sqty },
      { header: "QTY", type: "number", decimals: 3, value: (r) => r.qty },
      { header: "Unit", value: (r) => r.unit },
      { header: "Unit Price", type: "number", value: (r) => r.unitPrice },
      { header: "Total", type: "number", value: (r) => r.total },
      { header: "QC Status", value: (r) => BATCH_QC_LABELS[r.qcState] },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      exportConfig={exportConfig}
      isOpeningStock={(r) => r.isLegacy}
      searchPlaceholder="Search item or batch…"
      emptyLabel="No raw material batches in stock." emptyHint="Raw material appears here once its purchase order is submitted."
      pageSize={20}
    />
  );
}
