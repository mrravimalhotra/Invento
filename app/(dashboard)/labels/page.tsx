import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { LabelPicker, type RmRecord, type FpRecord } from "./label-picker";

// Supabase's query builder infers embedded relations as arrays when the
// select string's cardinality can't be statically resolved (no generated
// Database types in this project) — even though item_id/purchase_order_id/
// vendor_id/mfr_definition_id are all single-row "belongs to" foreign keys
// that return at most one row. Typed as arrays here and unwrapped with [0]
// in the mapping below to match what actually comes back at runtime.
type PurchaseLineFetch = {
  id: string;
  batch_number: string;
  quantity: string | number;
  unit: string;
  item: { name: string }[] | null;
  purchase_order:
    | {
        invoice_number: string;
        invoice_date: string;
        vendor: { name: string }[] | null;
      }[]
    | null;
};

type BatchStatusFetch = {
  purchase_line_id: string;
  qc_status: string;
  ar_number: string | null;
  quality_check_id: string | null;
};

type QualityCheckFetch = {
  id: string;
  retest_period_days: number | null;
};

type FpBatchFetch = {
  id: string;
  batch_number: string;
  net_qty: string | number | null;
  total_units: string | number | null;
  unit: string;
  finish_date: string | null;
  expiry_month: string | null;
  status: string;
  mfr_definition: { name: string }[] | null;
};

export default async function LabelsPage() {
  const supabase = await createClient();

  const [{ data: linesData }, { data: statusData }, { data: fpData }] = await Promise.all([
    supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, unit, item:items(name), purchase_order:purchase_orders(invoice_number, invoice_date, vendor:vendors(name))"
      )
      .eq("active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_batch_status")
      .select("purchase_line_id, qc_status, ar_number, quality_check_id"),
    supabase
      .from("finished_product_batches")
      .select(
        "id, batch_number, net_qty, total_units, unit, finish_date, expiry_month, status, mfr_definition:mfr_definitions(name)"
      )
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  const lines: PurchaseLineFetch[] = linesData ?? [];
  const statuses: BatchStatusFetch[] = statusData ?? [];
  const fpBatches: FpBatchFetch[] = fpData ?? [];

  const qcIds = statuses.map((s) => s.quality_check_id).filter((id): id is string => !!id);
  const { data: qcData } =
    qcIds.length > 0
      ? await supabase.from("quality_checks").select("id, retest_period_days").in("id", qcIds)
      : { data: [] as QualityCheckFetch[] };
  const qcRows: QualityCheckFetch[] = qcData ?? [];
  const retestByQcId = new Map(qcRows.map((q) => [q.id, q.retest_period_days]));
  const statusByLineId = new Map(statuses.map((s) => [s.purchase_line_id, s]));

  const rmRecords: RmRecord[] = lines.map((l) => {
    const status = statusByLineId.get(l.id);
    const po = l.purchase_order?.[0];
    return {
      id: l.id,
      itemName: l.item?.[0]?.name ?? "—",
      batchNumber: l.batch_number,
      quantity: Number(l.quantity),
      unit: l.unit,
      vendorName: po?.vendor?.[0]?.name ?? "—",
      invoiceNumber: po?.invoice_number ?? "—",
      receiptDate: po?.invoice_date ?? null,
      qcStatus: status?.qc_status ?? "not_submitted",
      arNumber: status?.ar_number ?? null,
      retestPeriodDays: status?.quality_check_id ? retestByQcId.get(status.quality_check_id) ?? null : null,
    };
  });

  const fpRecords: FpRecord[] = fpBatches.map((b) => ({
    id: b.id,
    productName: b.mfr_definition?.[0]?.name ?? "—",
    batchNumber: b.batch_number,
    quantity: b.net_qty !== null ? Number(b.net_qty) : b.total_units !== null ? Number(b.total_units) : null,
    unit: b.unit,
    finishDate: b.finish_date,
    expiryMonth: b.expiry_month,
    status: b.status,
  }));

  return (
    <div>
      <PageHeader
        title="Label Printing"
        description="Print compact labels for raw material and finished product batches — Approved Raw Material, Under Test, In-process, and Finished Product templates."
      />
      <LabelPicker rmRecords={rmRecords} fpRecords={fpRecords} />
    </div>
  );
}
