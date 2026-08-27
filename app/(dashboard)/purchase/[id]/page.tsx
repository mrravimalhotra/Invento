import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber } from "@/lib/utils";
import { PurchaseLineForm, type RawItemOption } from "../purchase-line-form";

type LineRow = {
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

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: poRaw } = await supabase
    .from("purchase_orders")
    .select("id, po_number, invoice_number, invoice_date, created_at, vendor:vendors(id, vendor_code, name)")
    .eq("id", id)
    .maybeSingle();

  if (!poRaw) notFound();

  const po = poRaw as unknown as {
    id: string;
    po_number: string;
    invoice_number: string;
    invoice_date: string;
    created_at: string;
    vendor: { id: string; vendor_code: string; name: string } | null;
  };

  const [{ data: lines }, { data: rawItems }] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, remaining_qty, unit_price, gst_pct, expiry_date, item:items(item_code, name)"
      )
      .eq("purchase_order_id", id)
      .order("created_at"),
    supabase
      .from("items")
      .select("id, item_code, name, unit, default_qc_qty, default_stability_qty, default_rnd_qty")
      .eq("category", "raw")
      .eq("active", true)
      .order("item_code"),
  ]);

  const lineRows = (lines ?? []) as unknown as LineRow[];
  const canEdit = canWrite(user?.roles ?? [], "purchase");
  const totalValue = lineRows.reduce((sum, l) => sum + lineFinancials(l).lineTotal, 0);

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

  return (
    <div>
      <PageHeader
        title={po.po_number}
        description={`Vendor: ${po.vendor?.name ?? "—"} (${po.vendor?.vendor_code ?? "—"}) · Invoice ${po.invoice_number} dated ${formatDate(
          po.invoice_date
        )}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Lines</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{lineRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total value</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatNumber(totalValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Created</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatDate(po.created_at)}</p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Purchase lines" />
        <DataTable
          columns={columns}
          rows={lineRows}
          emptyLabel="No lines added yet."
          searchPlaceholder="Search lines…"
        />
      </Card>

      {canEdit && (
        <Card>
          <CardHeader title="Add line" />
          <CardBody>
            <PurchaseLineForm purchaseOrderId={po.id} items={(rawItems ?? []) as RawItemOption[]} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
