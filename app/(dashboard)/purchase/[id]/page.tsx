import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import type { RawItemOption } from "../purchase-line-form";
import { PurchaseOrderView } from "../purchase-order-view";
import type { LineRow } from "./purchase-lines-table";

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
        "id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, remaining_qty, live_remaining_qty, unit_price, gst_pct, expiry_date, item:items(item_code, name, category)"
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

  return (
    <PurchaseOrderView
      po={po}
      lineRows={lineRows}
      rawItems={(rawItems ?? []) as RawItemOption[]}
      canEdit={canEdit}
      isSystemAdmin={isSystemAdmin}
    />
  );
}
