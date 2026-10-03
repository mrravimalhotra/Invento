"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { BATCH_QC_LABELS, type BatchQcState } from "@/lib/batch-qc-status";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadPdfTable = async (...args: Parameters<typeof import("@/lib/pdf").downloadPdfTable>) =>
  (await import("@/lib/pdf")).downloadPdfTable(...args);

export type RmReportExportRow = {
  item: string;
  batchNumber: string;
  // Opening stock loaded from the old records (0100).
  isLegacy: boolean;
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
      columns: ["Item", "Batch No.", "Source", "PQTY", "SQTY", "QTY", "Unit", "Unit Price", "Total", "QC Status"],
      rows: rows.map((r) => [
        r.item,
        r.batchNumber,
        r.isLegacy ? "Legacy" : "New",
        r.pqty.toFixed(3),
        r.sqty.toFixed(3),
        r.qty.toFixed(3),
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
