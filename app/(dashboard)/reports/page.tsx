import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { ReportSection, type ReportColumn } from "./report-section";

// ---------- RM Stock report ----------
type RmStockRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: number | string | null;
  created_at: string;
  onHand: number;
};

// ---------- QC Register ----------
type QcRow = {
  ar_number: string;
  status: string;
  reviewed_at: string | null;
  retest_date: string | null;
  created_at: string;
  item: { name: string } | null;
  purchase_line: { batch_number: string } | null;
  fp_batch: { batch_number: string } | null;
};

// ---------- FP Register ----------
type FpRow = {
  batch_number: string;
  target_qty: number | string | null;
  actual_yield_pct: number | string | null;
  status: string;
  finish_date: string | null;
  created_at: string;
  mfr: { name: string } | null;
};

// ---------- Purchase Register ----------
type PurchaseRow = {
  batch_number: string;
  quantity: number | string;
  remaining_qty: number | string;
  expiry_date: string | null;
  created_at: string;
  item: { name: string } | null;
  purchase_order: { po_number: string; vendor: { name: string } | null } | null;
};

export default async function ReportsPage() {
  const supabase = await createClient();

  const [itemsRes, balancesRes, qcRes, fpRes, purchaseRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, item_code, name, unit, low_stock_threshold, created_at")
      .eq("category", "raw")
      .eq("active", true)
      .order("item_code", { ascending: true }),
    supabase.from("stock_balance").select("item_id, on_hand"),
    supabase
      .from("quality_checks")
      .select(
        "ar_number, status, reviewed_at, retest_date, created_at, item:items(name), purchase_line:purchase_lines(batch_number), fp_batch:finished_product_batches(batch_number)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("finished_product_batches")
      .select(
        "batch_number, target_qty, actual_yield_pct, status, finish_date, created_at, mfr:mfr_definitions(name)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_lines")
      .select(
        "batch_number, quantity, remaining_qty, expiry_date, created_at, item:items(name), purchase_order:purchase_orders(po_number, vendor:vendors(name))"
      )
      .order("created_at", { ascending: false }),
  ]);

  const onHandByItem = new Map<string, number>();
  for (const b of balancesRes.data ?? []) {
    onHandByItem.set(b.item_id as string, Number(b.on_hand ?? 0));
  }
  const rmStockRows: RmStockRow[] = (itemsRes.data ?? []).map((i) => ({
    ...i,
    onHand: onHandByItem.get(i.id) ?? 0,
  }));

  const qcRows = (qcRes.data ?? []) as unknown as QcRow[];
  const fpRows = (fpRes.data ?? []) as unknown as FpRow[];
  const purchaseRows = (purchaseRes.data ?? []) as unknown as PurchaseRow[];

  const rmStockColumns: ReportColumn<RmStockRow>[] = [
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

  const qcColumns: ReportColumn<QcRow>[] = [
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

  const fpColumns: ReportColumn<FpRow>[] = [
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

  const purchaseColumns: ReportColumn<PurchaseRow>[] = [
    { header: "PO Number", cell: (r) => r.purchase_order?.po_number ?? "—", pdfValue: (r) => r.purchase_order?.po_number ?? "—" },
    {
      header: "Vendor",
      cell: (r) => r.purchase_order?.vendor?.name ?? "—",
      pdfValue: (r) => r.purchase_order?.vendor?.name ?? "—",
    },
    { header: "Item", cell: (r) => r.item?.name ?? "—", pdfValue: (r) => r.item?.name ?? "—" },
    { header: "Batch", cell: (r) => r.batch_number, pdfValue: (r) => r.batch_number },
    { header: "Quantity", cell: (r) => formatNumber(r.quantity), pdfValue: (r) => formatNumber(r.quantity) },
    { header: "Remaining Qty", cell: (r) => formatNumber(r.remaining_qty), pdfValue: (r) => formatNumber(r.remaining_qty) },
    { header: "Expiry Date", cell: (r) => formatDate(r.expiry_date), pdfValue: (r) => formatDate(r.expiry_date) },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filterable registers with a printable PDF export — replaces the old baseline's permanent 'Coming soon' placeholder."
      />
      <div className="flex flex-col gap-6">
        <ReportSection
          title="RM Stock Report"
          description="Raw material items with current on-hand quantity (from the inventory ledger) against each item's low-stock threshold."
          rows={rmStockRows}
          columns={rmStockColumns}
          dateOf={(r) => r.created_at}
          dateLabel="Item added"
          filename="rm-stock-report"
        />
        <ReportSection
          title="QC Register"
          description="Every quality check submitted, RM and finished-product batches alike."
          rows={qcRows}
          columns={qcColumns}
          dateOf={(r) => r.reviewed_at}
          dateLabel="Reviewed"
          filename="qc-register"
        />
        <ReportSection
          title="FP Register"
          description="Every finished-product batch, its MFR, status, and yield."
          rows={fpRows}
          columns={fpColumns}
          dateOf={(r) => r.finish_date}
          dateLabel="Finish date"
          filename="fp-register"
        />
        <ReportSection
          title="Purchase Register"
          description="Every purchase line received, with vendor, item, and remaining quantity available for use."
          rows={purchaseRows}
          columns={purchaseColumns}
          dateOf={(r) => r.created_at}
          dateLabel="Received"
          filename="purchase-register"
        />
      </div>
    </div>
  );
}
