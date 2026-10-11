import { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { toIstDateString } from "@/lib/utils";
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
  is_legacy: boolean;
  created_at: string;
  pushed_at: string | null;
  quantity: string | number;
  unit: string;
  item: { name: string } | null;
  purchase_order: {
    invoice_number: string;
    invoice_date: string;
    received_on: string | null;
    submitted_at: string | null;
    vendor: { name: string } | null;
  } | null;
};

type BatchStatusFetch = {
  purchase_line_id: string;
  qc_status: string;
  ar_number: string | null;
  retest_date: string | null;
  expiry_date: string | null;
  quality_check_id: string | null;
};

type QualityCheckFetch = {
  id: string;
  retest_period_days: number | null;
};

type FpBatchFetch = {
  id: string;
  batch_number: string;
  // FB-0044 follow-up (27 Sept 2026): print-only short form (PR-/OR- +
  // seq/year) — null for batches created before this existed (older flat
  // 'FP-0001'-style batch numbers have no seq/year to derive one from).
  // See 0066_fp_market_short_batch_no.sql.
  short_batch_no: string | null;
  is_legacy: boolean;
  batch_yield: string | number | null;
  unit: string;
  finish_date: string | null;
  expiry_month: string | null;
  status: string;
  mfr_definition: { name: string } | null;
};

export default async function LabelsPage() {
  const supabase = await createClient();

  // ACC-08 (29 Sept 2026): every list here is paged past Supabase's
  // 1,000-row cap, and QC status is fetched only for the lines shown (in
  // chunks) — before, the whole purchase_batch_status view was read in one
  // request, so most batches fell outside the 1,000 returned and showed as
  // "not submitted" with a blank retest period on the Approved label.
  const [{ data: linesData }, { data: fpData }] = await Promise.all([
    // Raw material only (2 Sept 2026): the three purchase-line templates here
    // (Approved Raw Material / RM Under Test / In-process) are raw-material
    // labels; `items!inner(...)` is required for `.eq("items.category", ...)`
    // to filter the joined table in PostgREST.
    fetchAllRows<unknown>((from, to) =>
      supabase
        .from("purchase_lines")
        .select(
          "id, batch_number, is_legacy, created_at, pushed_at, quantity, unit, item:items!inner(name, category), purchase_order:purchase_orders(invoice_number, invoice_date, received_on, submitted_at, vendor:vendors(name))"
        )
        .eq("active", true)
        .eq("items.category", "raw")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<unknown[]>()
    ),
    fetchAllRows<unknown>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select(
          "id, batch_number, short_batch_no, is_legacy, batch_yield, unit, finish_date, expiry_month, status, mfr_definition:mfr_definitions(name)"
        )
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<unknown[]>()
    ),
  ]);

  // supabase-js infers embedded relations as arrays (no generated Database
  // types here) while PostgREST returns a plain object for a to-one embed —
  // cast through `unknown`, same convention as elsewhere in the app.
  const lines = linesData as unknown as PurchaseLineFetch[];
  const fpBatches = fpData as unknown as FpBatchFetch[];

  const { data: statusData } = await fetchByIdChunks<BatchStatusFetch>(
    lines.map((l) => l.id),
    (chunk) =>
      supabase
        .from("purchase_batch_status")
        .select("purchase_line_id, qc_status, ar_number, retest_date, expiry_date, quality_check_id")
        .in("purchase_line_id", chunk)
  );
  const statuses: BatchStatusFetch[] = statusData;

  const qcIds = statuses.map((s) => s.quality_check_id).filter((id): id is string => !!id);
  const { data: qcData } = await fetchByIdChunks<QualityCheckFetch>(qcIds, (chunk) =>
    supabase.from("quality_checks").select("id, retest_period_days").in("id", chunk)
  );
  const qcRows: QualityCheckFetch[] = qcData;
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
      // Opening stock: the real receipt date is the line's date, not the load day.
      // B13: the typed "Received on" date; older / bulk-uploaded POs fall back to the submit day, then the invoice date.
      receiptDate: l.is_legacy
        ? toIstDateString(l.created_at)
        : po?.received_on ?? (po?.submitted_at ? toIstDateString(po.submitted_at) : po?.invoice_date ?? null),
      isLegacy: l.is_legacy,
      qcStatus: status?.qc_status ?? "not_submitted",
      arNumber: status?.ar_number ?? null,
      retestDate: status?.retest_date ?? null,
      expiryDate: status?.expiry_date ?? null,
      poSubmitted: l.pushed_at !== null,
      retestPeriodDays: status?.quality_check_id ? retestByQcId.get(status.quality_check_id) ?? null : null,
    };
  });

  // FB-0058: the Best Before date is the Expiry date the QC Reviewer set when approving the batch.
  const { data: fpQcExpiry } = await fetchByIdChunks<{ finished_product_batch_id: string; expiry_date: string | null }>(
    fpBatches.map((b) => b.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("finished_product_batch_id, expiry_date")
        .eq("status", "approved")
        .not("expiry_date", "is", null)
        .in("finished_product_batch_id", chunk)
  );
  const fpExpiryById = new Map(fpQcExpiry.map((q) => [q.finished_product_batch_id, q.expiry_date]));

  const fpRecords: FpRecord[] = fpBatches.map((b) => ({
    id: b.id,
    productName: b.mfr_definition?.name ?? "—",
    batchNumber: b.batch_number,
    shortBatchNumber: b.short_batch_no,
    isLegacy: b.is_legacy,
    quantity: b.batch_yield !== null ? Number(b.batch_yield) : null,
    unit: b.unit,
    finishDate: b.finish_date,
    expiryMonth: b.expiry_month,
    qcExpiryDate: fpExpiryById.get(b.id) ?? null,
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
