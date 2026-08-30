import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { latestQcByBatch, resolveDisplayStatus } from "@/lib/finished-product-status";
import {
  RmStockReport,
  QcRegisterReport,
  FpRegisterReport,
  PurchaseRegisterReport,
  type RmStockRow,
  type QcRow,
  type FpRow,
  type PurchaseRow,
} from "./report-tables";

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
        "id, batch_number, target_qty, actual_yield_pct, status, finish_date, created_at, mfr:mfr_definitions(name)"
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
  const purchaseRows = (purchaseRes.data ?? []) as unknown as PurchaseRow[];

  // finished_product_batches.status only ever moves to 'in_process' or
  // 'submitted_to_qc' from this module's own actions — the approved/rejected
  // verdict lives on the linked quality_checks row instead (see
  // lib/finished-product-status.ts). Resolve display status the same way the
  // Finished Product list does; otherwise every row here would show
  // "In Process" even for batches long since approved or rejected.
  const fpBatchRows = (fpRes.data ?? []) as unknown as (FpRow & { id: string })[];
  const { data: fpQcRows } = fpBatchRows.length
    ? await supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in(
          "finished_product_batch_id",
          fpBatchRows.map((r) => r.id)
        )
        .not("finished_product_batch_id", "is", null)
    : { data: [] };
  const latestFpQc = latestQcByBatch(
    (fpQcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]
  );
  const fpRows: FpRow[] = fpBatchRows.map((r) => ({ ...r, status: resolveDisplayStatus(r.status, latestFpQc.get(r.id)) }));

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Filterable registers with a printable PDF export — replaces the old baseline's permanent 'Coming soon' placeholder."
      />
      <div className="flex flex-col gap-6">
        <RmStockReport rows={rmStockRows} />
        <QcRegisterReport rows={qcRows} />
        <FpRegisterReport rows={fpRows} />
        <PurchaseRegisterReport rows={purchaseRows} />
      </div>
    </div>
  );
}
