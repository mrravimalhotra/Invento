"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber } from "@/lib/utils";
import { BATCH_QC_LABELS } from "@/lib/batch-qc-status";
import type { RmReportExportRow } from "./rm-report-export";

export function RmReportTable({ rows, asOf }: { rows: RmReportExportRow[]; asOf: string }) {
  const columns: Column<RmReportExportRow>[] = [
    { header: "Item", accessor: (r) => r.item, searchValue: (r) => r.item },
    { header: "Batch No.", accessor: (r) => r.batchNumber, searchValue: (r) => r.batchNumber },
    { header: "PQTY", accessor: (r) => formatNumber(r.pqty) },
    { header: "SQTY", accessor: (r) => formatNumber(r.sqty) },
    { header: "QTY", accessor: (r) => <span className="font-medium">{formatNumber(r.qty)}</span> },
    { header: "Unit", accessor: (r) => r.unit },
    { header: "Unit Price", accessor: (r) => formatNumber(r.unitPrice) },
    { header: "Total", accessor: (r) => formatNumber(r.total) },
    {
      header: "QC Status",
      accessor: (r) => <Badge status={r.qcState}>{BATCH_QC_LABELS[r.qcState]}</Badge>,
      searchValue: (r) => BATCH_QC_LABELS[r.qcState],
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item or batch…"
      emptyLabel={`No purchase batches received on or before ${asOf}.`}
      pageSize={20}
    />
  );
}
