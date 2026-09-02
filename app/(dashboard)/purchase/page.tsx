import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { PurchaseTable, type PurchaseRow } from "./purchase-table";

type LineForTotal = { quantity: string | number; unit_price: string | number | null; gst_pct: string | number | null };

type PORow = {
  id: string;
  po_number: string;
  invoice_number: string;
  invoice_date: string;
  status: "draft" | "submitted";
  vendor: { name: string } | null;
  purchase_lines: LineForTotal[];
};

function lineTotal(l: LineForTotal) {
  const qty = Number(l.quantity) || 0;
  const price = Number(l.unit_price) || 0;
  const gst = Number(l.gst_pct) || 0;
  return qty * price * (1 + gst / 100);
}

export default async function PurchasePage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, invoice_number, invoice_date, status, vendor:vendors(name), purchase_lines(quantity, unit_price, gst_pct)"
    )
    .eq("active", true)
    .order("created_at", { ascending: false });

  const rows: PurchaseRow[] = ((data ?? []) as unknown as PORow[]).map((po) => ({
    id: po.id,
    po_number: po.po_number,
    invoice_number: po.invoice_number,
    invoice_date: po.invoice_date,
    status: po.status,
    vendor: po.vendor,
    lineCount: po.purchase_lines.length,
    totalValue: po.purchase_lines.reduce((sum, l) => sum + lineTotal(l), 0),
  }));

  const canCreate = canWrite(user?.roles ?? [], "purchase");

  return (
    <div>
      <PageHeader
        title="Purchase"
        description="Purchase orders and their receipt lines. Every line automatically deducts QC / Stability / R&D sampling before the balance becomes available stock."
        action={
          canCreate ? (
            <LinkButton href="/purchase/new">
              <Plus className="h-4 w-4" /> New purchase order
            </LinkButton>
          ) : undefined
        }
      />
      {error && <p className="mb-4 text-sm text-red">{error.message}</p>}
      <Card>
        <PurchaseTable rows={rows} />
      </Card>
    </div>
  );
}
