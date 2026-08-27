import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils";

type LineForTotal = { quantity: string | number; unit_price: string | number | null; gst_pct: string | number | null };

type PORow = {
  id: string;
  po_number: string;
  invoice_number: string;
  invoice_date: string;
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
      "id, po_number, invoice_number, invoice_date, vendor:vendors(name), purchase_lines(quantity, unit_price, gst_pct)"
    )
    .eq("active", true)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as PORow[]).map((po) => ({
    ...po,
    lineCount: po.purchase_lines.length,
    totalValue: po.purchase_lines.reduce((sum, l) => sum + lineTotal(l), 0),
  }));

  const canCreate = canWrite(user?.roles ?? [], "purchase");

  const columns: Column<(typeof rows)[number]>[] = [
    {
      header: "PO number",
      accessor: (r) => (
        <Link href={`/purchase/${r.id}`} className="font-mono text-xs font-medium text-brand-dark hover:underline">
          {r.po_number}
        </Link>
      ),
      searchValue: (r) => r.po_number,
    },
    { header: "Vendor", accessor: (r) => r.vendor?.name ?? "—", searchValue: (r) => r.vendor?.name ?? "" },
    { header: "Invoice #", accessor: (r) => r.invoice_number, searchValue: (r) => r.invoice_number },
    { header: "Invoice date", accessor: (r) => formatDate(r.invoice_date) },
    { header: "Lines", accessor: (r) => r.lineCount },
    { header: "Total value", accessor: (r) => formatNumber(r.totalValue) },
  ];

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
        <DataTable columns={columns} rows={rows} emptyLabel="No purchase orders yet." searchPlaceholder="Search purchase orders…" />
      </Card>
    </div>
  );
}
