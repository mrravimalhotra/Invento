import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { LabelPicker, type RmRecord, type FpRecord } from "./label-picker";

// FB-0024 fix (11 Sept 2026): every other belongs-to embed in this codebase
// (Purchase, Reports, QC — see e.g. purchase/[id]/page.tsx's
// `vendor:vendors(...)` or qc/page.tsx's `items(...)`) is typed and read as
// a plain object, not an array — this file was the one exception, typed as
// `{ name: string }[] | null` and unwrapped with `[0]`, which silently
// returned undefined (falling back to "—") for every row on both the item
// name and the vendor name, since the real runtime shape here is a plain
// object too. Found live: the new "Search product by name" field (FB-0024)
// collapsed to a single "—" entry across every raw-material batch, which
// is what surfaced this — it was likely always showing "—" instead of the
// item name in the "Purchase batch" dropdown's option text as well.
type PurchaseLineFetch = {
  id: string;
  batch_number: string;
  quantity: string | number;
  unit: string;
  item: { name: string } | null;
  purchase_order: {
    invoice_number: string;
    invoice_date: string;
    vendor: { name: string } | null;
  } | null;
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
  batch_yield: string | number | null;
  unit: string;
  finish_date: string | null;
  expiry_month: string | null;
  status: string;
  mfr_definition: { name: string } | null;
};

export default async function LabelsPage() {
  const supabase = await createClient();

  const [{ data: linesData }, { data: statusData }, { data: fpData }] = await Promise.all([
    // Raw material only (2 Sept 2026): the three templates offered for a
    // purchase-line batch here (Approved Raw Material / RM Under Test /
    // In-process — real legacy label formats, requirements-gap-analysis.md)
    // are all specifically raw-material labels. Packaging purchase lines
    // exist now (Purchase screen's Raw Material / Packaging Item toggle),
    // and without this filter every one of them would show up here too,
    // letting someone print an "Approved Raw Material" label for a
    // packaging item — caught during a related change, not separately
    // reported. `items!inner(...)` is required for `.eq("items.category",
    // ...)` to actually filter the joined table in PostgREST.
    supabase
      .from("purchase_lines")
      .select(
        "id, batch_number, quantity, unit, item:items!inner(name, category), purchase_order:purchase_orders(invoice_number, invoice_date, vendor:vendors(name))"
      )
      .eq("active", true)
      .eq("items.category", "raw")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_batch_status")
      .select("purchase_line_id, qc_status, ar_number, quality_check_id"),
    supabase
      .from("finished_product_batches")
      .select(
        "id, batch_number, batch_yield, unit, finish_date, expiry_month, status, mfr_definition:mfr_definitions(name)"
      )
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  // supabase-js infers embedded relations as arrays here (no generated
  // Database types in this project to tell it these are all single-row
  // "belongs to" foreign keys) — that inferred type doesn't match the
  // actual runtime shape PostgREST returns for a to-one embed (a plain
  // object), so a direct structural assignment against it fails to
  // compile. Cast through `unknown`, same convention already used
  // elsewhere in the app for the same reason (e.g. qc/page.tsx's
  // `items(...)`/`items!inner(...)` embeds) — see the PurchaseLineFetch/
  // FpBatchFetch comments above for how this was found and confirmed.
  const lines = (linesData ?? []) as unknown as PurchaseLineFetch[];
  const statuses: BatchStatusFetch[] = statusData ?? [];
  const fpBatches = (fpData ?? []) as unknown as FpBatchFetch[];

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
    const po = l.purchase_order;
    return {
      id: l.id,
      itemName: l.item?.name ?? "—",
      batchNumber: l.batch_number,
      quantity: Number(l.quantity),
      unit: l.unit,
      vendorName: po?.vendor?.name ?? "—",
      invoiceNumber: po?.invoice_number ?? "—",
      receiptDate: po?.invoice_date ?? null,
      qcStatus: status?.qc_status ?? "not_submitted",
      arNumber: status?.ar_number ?? null,
      retestPeriodDays: status?.quality_check_id ? retestByQcId.get(status.quality_check_id) ?? null : null,
    };
  });

  const fpRecords: FpRecord[] = fpBatches.map((b) => ({
    id: b.id,
    productName: b.mfr_definition?.name ?? "—",
    batchNumber: b.batch_number,
    quantity: b.batch_yield !== null ? Number(b.batch_yield) : null,
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
