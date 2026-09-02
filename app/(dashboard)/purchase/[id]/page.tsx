import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import { PurchaseLineForm, type RawItemOption } from "../purchase-line-form";
import { DeletePurchaseOrderForm } from "../purchase-order-form";
import { PurchaseLinesTable, type LineRow } from "./purchase-lines-table";
import { purchaseLineTotal } from "./line-financials";

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
      .select("id, item_code, name, unit, default_qc_qty, default_stability_qty, default_rnd_qty, default_sample_unit")
      .eq("category", "raw")
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const lineRows = (lines ?? []) as unknown as LineRow[];
  const canEdit = canWrite(user?.roles ?? [], "purchase");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");
  const totalValue = lineRows.reduce((sum, l) => sum + purchaseLineTotal(l), 0);

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

      {isSystemAdmin && (
        <div className="mb-6 flex justify-end">
          <DeletePurchaseOrderForm id={po.id} poNumber={po.po_number} />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader title="Purchase lines" />
        <PurchaseLinesTable rows={lineRows} />
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
