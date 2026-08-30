"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";

export type LineRow = {
  id: string;
  batch_number: string;
  quantity: string;
  unit: string;
  qc_qty: string;
  stability_qty: string;
  rnd_qty: string;
  remaining_qty: string;
  unit_price: string | null;
  gst_pct: string | null;
  expiry_date: string;
  item: { item_code: string; name: string } | null;
};

function lineFinancials(l: LineRow) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const gst = Number(l.gst_pct) || 0;
  const base = qty * price;
  const gstAmount = base * (gst / 100);
  return {
    gstAmount,
    priceInclGst: price * (1 + gst / 100),
    lineTotal: base + gstAmount,
  };
}

export function PurchaseLinesTable({ rows }: { rows: LineRow[] }) {
  const columns: Column<LineRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <span>
          <span className="font-mono text-xs text-muted">{r.item?.item_code}</span>
          <br />
          {r.item?.name}
        </span>
      ),
      searchValue: (r) => `${r.item?.item_code ?? ""} ${r.item?.name ?? ""}`,
    },
    { header: "Batch", accessor: (r) => <span className="font-mono text-xs">{r.batch_number}</span>, searchValue: (r) => r.batch_number },
    {
      header: "Quantity",
      accessor: (r) => (
        <span>
          {formatNumber(r.quantity)} {r.unit}
          <br />
          <span className="text-xs text-muted">
            of which {formatNumber(r.remaining_qty)} {r.unit} remaining after QC/Stability/R&D
          </span>
        </span>
      ),
    },
    { header: "QC qty", accessor: (r) => formatNumber(r.qc_qty) },
    { header: "Stability qty", accessor: (r) => formatNumber(r.stability_qty) },
    { header: "R&D qty", accessor: (r) => formatNumber(r.rnd_qty) },
    { header: "Unit price", accessor: (r) => formatNumber(r.unit_price) },
    { header: "GST %", accessor: (r) => formatNumber(r.gst_pct) },
    { header: "GST amount", accessor: (r) => formatNumber(lineFinancials(r).gstAmount) },
    { header: "Price incl. GST", accessor: (r) => formatNumber(lineFinancials(r).priceInclGst) },
    { header: "Line total", accessor: (r) => formatNumber(lineFinancials(r).lineTotal) },
    { header: "Expiry", accessor: (r) => formatDate(r.expiry_date) },
  ];

  return <DataTable columns={columns} rows={rows} emptyLabel="No lines added yet." searchPlaceholder="Search lines…" />;
}

export function purchaseLineTotal(l: LineRow) {
  return lineFinancials(l).lineTotal;
}
