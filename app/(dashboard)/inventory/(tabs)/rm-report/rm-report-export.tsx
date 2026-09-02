"use client";

import { Button } from "@/components/ui/button";
import { downloadPdfTable } from "@/lib/pdf";
import { Download } from "lucide-react";
import { BATCH_QC_LABELS, type BatchQcState } from "@/lib/batch-qc-status";

export type RmReportExportRow = {
  item: string;
  batchNumber: string;
  pqty: number;
  sqty: number;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
  qcState: BatchQcState;
};

export function RmReportExport({ asOf, rows }: { asOf: string; rows: RmReportExportRow[] }) {
  function handleExport() {
    downloadPdfTable({
      title: `RM Report As On Date — ${asOf}`,
      columns: ["Item", "Batch No.", "PQTY", "SQTY", "QTY", "Unit", "Unit Price", "Total", "QC Status"],
      rows: rows.map((r) => [
        r.item,
        r.batchNumber,
        r.pqty.toFixed(2),
        r.sqty.toFixed(2),
        r.qty.toFixed(2),
        r.unit,
        r.unitPrice.toFixed(2),
        r.total.toFixed(2),
        BATCH_QC_LABELS[r.qcState],
      ]),
      filename: `rm-report-as-on-${asOf}.pdf`,
    });
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleExport} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      Export PDF
    </Button>
  );
}
