import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/utils";
import type { RawItemOption } from "../purchase-line-form";
import { DeletePurchaseOrderForm, SubmitPurchaseOrderForm, ReopenPurchaseOrderForm } from "../purchase-order-form";
import { PurchaseLinesSection } from "./purchase-lines-section";
import type { LineRow } from "./purchase-lines-table";
import { purchaseLineTotal } from "./line-financials";

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: poRaw } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, invoice_number, invoice_date, created_at, status, submitted_at, reopened_at, vendor:vendors(id, vendor_code, name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!poRaw) notFound();

  const po = poRaw as unknown as {
    id: string;
    po_number: string;
    invoice_number: string;
    invoice_date: string;
    created_at: string;
    status: "draft" | "submitted";
    submitted_at: string | null;
    reopened_at: string | null;
    vendor: { id: string; vendor_code: string; name: string } | null;
  };

  const [{ data: lines }, { data: rawItems }] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, remaining_qty, unit_price, gst_pct, expiry_date, item:items(item_code, name, category)"
      )
      .eq("purchase_order_id", id)
      .order("created_at"),
    // Raw material AND packaging items are both purchasable here (processed/
    // Finished Product items are not — those come from MFR + Finished
    // Product batches, never a purchase line). `category` rides along so
    // the client can offer a Raw Material / Packaging Item toggle and hide
    // QC/Stability/R&D sample capture for packaging lines, which never go
    // through QC.
    supabase
      .from("items")
      .select("id, item_code, name, unit, category, default_qc_qty, default_stability_qty, default_rnd_qty, default_sample_unit")
      .in("category", ["raw", "packaging"])
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const lineRows = (lines ?? []) as unknown as LineRow[];
  const canEdit = canWrite(user?.roles ?? [], "purchase");
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");
  const isDraft = po.status === "draft";
  // FB-0018: lines are only addable/editable/deletable while the PO is
  // still draft — once Final Submitted, System Admin has to Reopen it
  // first (which reverses the inventory it pushed).
  const canEditLines = canEdit && isDraft;
  const totalValue = lineRows.reduce((sum, l) => sum + purchaseLineTotal(l), 0);

  return (
    <div>
      <PageHeader
        title={po.po_number}
        description={`Vendor: ${po.vendor?.name ?? "—"} (${po.vendor?.vendor_code ?? "—"}) · Invoice ${po.invoice_number} dated ${formatDate(
          po.invoice_date
        )}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{isDraft ? "Draft" : "Submitted"}</p>
          {!isDraft && po.submitted_at && <p className="mt-0.5 text-xs text-muted">on {formatDate(po.submitted_at)}</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Lines</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{lineRows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total value (₹)</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatNumber(totalValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Created</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground">{formatDate(po.created_at)}</p>
        </Card>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-end gap-3">
        {canEdit && isDraft && lineRows.length > 0 && <SubmitPurchaseOrderForm id={po.id} />}
        {isSystemAdmin && !isDraft && <ReopenPurchaseOrderForm id={po.id} />}
        {isSystemAdmin && <DeletePurchaseOrderForm id={po.id} poNumber={po.po_number} />}
      </div>

      <PurchaseLinesSection
        purchaseOrderId={po.id}
        rows={lineRows}
        items={(rawItems ?? []) as RawItemOption[]}
        canEditLines={canEditLines}
        poInvoiceNumber={po.invoice_number}
        poInvoiceDate={po.invoice_date}
        vendorName={po.vendor?.name ?? "—"}
      />
    </div>
  );
}
