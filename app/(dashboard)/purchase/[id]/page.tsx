import { notFound } from "next/navigation";
import { WorkflowStrip } from "@/components/ui/workflow-strip";
import { poWorkflow } from "@/lib/workflow-steps";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCurrentUser } from "@/lib/auth/session";
import { AuditHistoryLink } from "@/components/ui/audit-history-link";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import type { RawItemOption } from "../purchase-line-form";
import { PurchaseOrderView } from "../purchase-order-view";
import type { LineRow } from "./purchase-lines-table";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: poRaw } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, invoice_number, invoice_date, received_on, created_at, updated_at, status, submitted_at, reopened_at, vendor:vendors(id, vendor_code, name, address, mobile)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!poRaw) notFound();

  const po = poRaw as unknown as {
    id: string;
    po_number: string;
    invoice_number: string;
    invoice_date: string;
    received_on: string | null;
    created_at: string;
    updated_at: string | null;
    status: "draft" | "submitted";
    submitted_at: string | null;
    reopened_at: string | null;
    vendor: { id: string; vendor_code: string; name: string } | null;
  };

  const [{ data: lines }, { data: rawItems }] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select(
        "id, item_id, batch_number, is_legacy, quantity, unit, qc_qty, stability_qty, rnd_qty, remaining_qty, live_remaining_qty, unit_price, gst_pct, expiry_date, item:items(item_code, name, category)"
      )
      .eq("purchase_order_id", id)
      .order("created_at"),
    // Raw material AND packaging items are both purchasable here (processed/
    // Finished Product items are not — those come from MFR + Finished
    // Product batches, never a purchase line). `category` rides along so
    // the client can offer a Raw Material / Packaging Item toggle and hide
    // QC/Stability/R&D sample capture for packaging lines, which never go
    // through QC.
    fetchAllRows((from, to) =>
      supabase
        .from("items")
        .select("id, item_code, name, unit, category, default_qc_qty, default_stability_qty, default_rnd_qty, default_sample_unit")
        .in("category", ["raw", "packaging"])
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const lineRows = (lines ?? []) as unknown as LineRow[];
  const canEdit = canWrite(user?.roles ?? [], "purchase");

  // SCAN-P3-02: the vendor choices for "Edit invoice details" (active ones, plus the order's own).
  let vendorChoices: { id: string; vendor_code: string; name: string }[] | undefined;
  if (canEdit && po.status === "draft") {
    const { data: vendorRows } = await fetchAllRows((from, to) =>
      supabase
        .from("vendors")
        .select("id, vendor_code, name, active")
        .order("name")
        .order("id", { ascending: true })
        .range(from, to)
    );
    vendorChoices = ((vendorRows ?? []) as { id: string; vendor_code: string; name: string; active: boolean }[])
      .filter((v) => v.active || v.id === po.vendor?.id)
      .map(({ id: vid, vendor_code, name }) => ({ id: vid, vendor_code, name }));
  }
  const isSystemAdmin = (user?.roles ?? []).includes("system_admin");

  // UX-06: how many raw material lines already have a QC decision.
  const rawLineIds = lineRows.filter((l) => l.item?.category === "raw").map((l) => l.id);
  let decided = 0;
  if (po.status === "submitted" && rawLineIds.length > 0) {
    const { data: qcRows } = await supabase
      .from("quality_checks")
      .select("purchase_line_id, status")
      .in("purchase_line_id", rawLineIds)
      .in("status", ["approved", "rejected"]);
    decided = new Set((qcRows ?? []).map((q) => q.purchase_line_id)).size;
  }

  return (
    <div>
      <PurchaseOrderView
        po={po}
        lineRows={lineRows}
        rawItems={(rawItems ?? []) as RawItemOption[]}
        canEdit={canEdit}
        isSystemAdmin={isSystemAdmin}
        vendors={vendorChoices}
        historyLink={<AuditHistoryLink recordId={po.id} roles={user?.roles ?? []} />}
        workflow={<WorkflowStrip workflow={poWorkflow(po.status, rawLineIds.length, decided)} />}
      />
    </div>
  );
}
