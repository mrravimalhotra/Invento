import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber } from "@/lib/utils";
import type { RawItemOption } from "./purchase-line-form";
import { DeletePurchaseOrderForm, SubmitPurchaseOrderForm, ReopenPurchaseOrderForm } from "./purchase-order-form";
import { PurchaseLinesSection } from "./[id]/purchase-lines-section";
import type { LineRow } from "./[id]/purchase-lines-table";
import { purchaseLineTotal } from "./[id]/line-financials";

export type PurchaseOrderHeader = {
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

// The full "purchase order record" screen — header summary cards, action
// buttons, and the lines table/Add-line form. Factored out of
// [id]/page.tsx (13 Sept 2026, "have these two in single screen to reduce
// number of clicks") so the exact same view can also be rendered by
// new-purchase-order-form.tsx the instant a new PO's header is saved —
// no navigation, no re-fetch, just this component fed the data the create
// action already returned. /purchase/[id]/page.tsx still fetches this
// data itself (fresh from the DB) and remains the real, reloadable,
// bookmarkable URL for an existing PO; this component has no data-fetching
// of its own, so it's equally safe to render from a Server Component
// (there) or a Client Component (the new-PO flow).
export function PurchaseOrderView({
  po,
  lineRows,
  rawItems,
  canEdit,
  isSystemAdmin,
}: {
  po: PurchaseOrderHeader;
  lineRows: LineRow[];
  rawItems: RawItemOption[];
  canEdit: boolean;
  isSystemAdmin: boolean;
}) {
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
        items={rawItems}
        canEditLines={canEditLines}
        poInvoiceNumber={po.invoice_number}
        poInvoiceDate={po.invoice_date}
        vendorName={po.vendor?.name ?? "—"}
      />
    </div>
  );
}
