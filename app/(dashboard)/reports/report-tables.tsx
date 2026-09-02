"use client";

import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { ReportSection, type ReportColumn } from "./report-section";

// ---------- RM Stock report ----------
export type RmStockRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: number | string | null;
  created_at: string;
  onHand: number;
};

export function RmStockReport({ rows }: { rows: RmStockRow[] }) {
  const columns: ReportColumn<RmStockRow>[] = [
    { header: "Item Code", cell: (r) => r.item_code, pdfValue: (r) => r.item_code },
    { header: "Name", cell: (r) => r.name, pdfValue: (r) => r.name },
    { header: "Unit", cell: (r) => r.unit ?? "—", pdfValue: (r) => r.unit ?? "—" },
    { header: "On Hand", cell: (r) => formatNumber(r.onHand), pdfValue: (r) => formatNumber(r.onHand) },
    {
      header: "Low Stock Threshold",
      cell: (r) => formatNumber(r.low_stock_threshold),
      pdfValue: (r) => formatNumber(r.low_stock_threshold),
    },
    {
      header: "Flag",
      cell: (r) => {
        const threshold = r.low_stock_threshold === null || r.low_stock_threshold === "" ? null : Number(r.low_stock_threshold);
        const isLow = threshold !== null && !Number.isNaN(threshold) && r.onHand < threshold;
        return isLow ? (
          <span className="inline-flex items-center rounded-full bg-amber-bg px-2.5 py-0.5 text-xs font-medium text-amber">
            Below threshold
          </span>
        ) : (
          <span className="text-xs text-muted">OK</span>
        );
      },
      pdfValue: (r) => {
        const threshold = r.low_stock_threshold === null || r.low_stock_threshold === "" ? null : Number(r.low_stock_threshold);
        const isLow = threshold !== null && !Number.isNaN(threshold) && r.onHand < threshold;
        return isLow ? "Below threshold" : "OK";
      },
    },
  ];

  return (
    <ReportSection
      title="RM Stock Report"
      description="Raw material items with current on-hand quantity (from the inventory ledger) against each item's low-stock threshold."
      rows={rows}
      columns={columns}
      dateOf={(r) => r.created_at}
      dateLabel="Item added"
      filename="rm-stock-report"
    />
  );
}

// ---------- QC Register ----------
export type QcRow = {
  ar_number: string;
  status: string;
  reviewed_at: string | null;
  retest_date: string | null;
  created_at: string;
  item: { name: string } | null;
  purchase_line: { batch_number: string } | null;
  fp_batch: { batch_number: string } | null;
};

export function QcRegisterReport({ rows }: { rows: QcRow[] }) {
  const columns: ReportColumn<QcRow>[] = [
    { header: "AR Number", cell: (r) => r.ar_number, pdfValue: (r) => r.ar_number },
    { header: "Item", cell: (r) => r.item?.name ?? "—", pdfValue: (r) => r.item?.name ?? "—" },
    {
      header: "Batch",
      cell: (r) => r.purchase_line?.batch_number ?? r.fp_batch?.batch_number ?? "—",
      pdfValue: (r) => r.purchase_line?.batch_number ?? r.fp_batch?.batch_number ?? "—",
    },
    { header: "Status", cell: (r) => <Badge status={r.status}>{r.status.replace("_", " ")}</Badge>, pdfValue: (r) => r.status },
    { header: "Reviewed At", cell: (r) => formatDate(r.reviewed_at), pdfValue: (r) => formatDate(r.reviewed_at) },
    { header: "Retest Date", cell: (r) => formatDate(r.retest_date), pdfValue: (r) => formatDate(r.retest_date) },
  ];

  return (
    <ReportSection
      title="QC Register"
      description="Every quality check submitted, RM and finished-product batches alike."
      rows={rows}
      columns={columns}
      dateOf={(r) => r.reviewed_at}
      dateLabel="Reviewed"
      filename="qc-register"
    />
  );
}

// ---------- FP Register ----------
export type FpRow = {
  batch_number: string;
  target_qty: number | string | null;
  actual_yield_pct: number | string | null;
  status: string;
  finish_date: string | null;
  created_at: string;
  mfr: { name: string } | null;
};

export function FpRegisterReport({ rows }: { rows: FpRow[] }) {
  const columns: ReportColumn<FpRow>[] = [
    { header: "Batch Number", cell: (r) => r.batch_number, pdfValue: (r) => r.batch_number },
    { header: "MFR", cell: (r) => r.mfr?.name ?? "—", pdfValue: (r) => r.mfr?.name ?? "—" },
    { header: "Status", cell: (r) => <Badge status={r.status}>{r.status.replace("_", " ")}</Badge>, pdfValue: (r) => r.status },
    { header: "Target Qty", cell: (r) => formatNumber(r.target_qty), pdfValue: (r) => formatNumber(r.target_qty) },
    {
      header: "Actual Yield %",
      cell: (r) => (r.actual_yield_pct === null ? "—" : `${formatNumber(r.actual_yield_pct)}%`),
      pdfValue: (r) => (r.actual_yield_pct === null ? "—" : `${formatNumber(r.actual_yield_pct)}%`),
    },
    { header: "Finish Date", cell: (r) => formatDate(r.finish_date), pdfValue: (r) => formatDate(r.finish_date) },
  ];

  return (
    <ReportSection
      title="FP Register"
      description="Every finished-product batch, its MFR, status, and yield."
      rows={rows}
      columns={columns}
      dateOf={(r) => r.finish_date}
      dateLabel="Finish date"
      filename="fp-register"
    />
  );
}

// ---------- Purchase Register ----------
export type PurchaseRow = {
  batch_number: string;
  quantity: number | string;
  // Phase 2 (claude/inventory-ledger-redesign.md Gap 2) — live, not the
  // static generated remaining_qty: this report's own description already
  // promises "remaining quantity available for use," which the static
  // column never actually delivered once a batch had FP consumption or
  // batch-tied wastage against it.
  live_remaining_qty: number | string;
  expiry_date: string | null;
  created_at: string;
  item: { name: string } | null;
  purchase_order: { po_number: string; vendor: { name: string } | null } | null;
};

export function PurchaseRegisterReport({ rows }: { rows: PurchaseRow[] }) {
  const columns: ReportColumn<PurchaseRow>[] = [
    { header: "PO Number", cell: (r) => r.purchase_order?.po_number ?? "—", pdfValue: (r) => r.purchase_order?.po_number ?? "—" },
    {
      header: "Vendor",
      cell: (r) => r.purchase_order?.vendor?.name ?? "—",
      pdfValue: (r) => r.purchase_order?.vendor?.name ?? "—",
    },
    { header: "Item", cell: (r) => r.item?.name ?? "—", pdfValue: (r) => r.item?.name ?? "—" },
    { header: "Batch", cell: (r) => r.batch_number, pdfValue: (r) => r.batch_number },
    { header: "Quantity", cell: (r) => formatNumber(r.quantity), pdfValue: (r) => formatNumber(r.quantity) },
    { header: "Remaining Qty", cell: (r) => formatNumber(r.live_remaining_qty), pdfValue: (r) => formatNumber(r.live_remaining_qty) },
    { header: "Re-Test Date", cell: (r) => formatDate(r.expiry_date), pdfValue: (r) => formatDate(r.expiry_date) },
  ];

  return (
    <ReportSection
      title="Purchase Register"
      description="Every purchase line received, with vendor, item, and remaining quantity available for use."
      rows={rows}
      columns={columns}
      dateOf={(r) => r.created_at}
      dateLabel="Received"
      filename="purchase-register"
    />
  );
}
