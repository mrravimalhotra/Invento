import type { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { isLegacyCode, fpBatchBoth } from "@/lib/utils";
import { getOpeningLineIds } from "@/lib/opening-stock/legacy-lines";

// B15 (30 Sept 2026, Ravi): the Dashboard warns about
//  - RETEST due in the next 90 days for raw materials AND finished products,
//  - EXPIRY in the next 90 days for raw materials AND finished products
//    (FB-0058, 3 Oct 2026: the Expiry date is set by the QC Reviewer at each approval).
// Each alert says what it is (item, batch, Raw material / Finished product),
// not just an AR number.

export const ALERT_WINDOW_DAYS = 90;

export type AlertRow = {
  key: string;
  kind: "raw" | "fp";
  title: string; // "Ashwagandha Root (RM-00031)"
  batch: string;
  ar: string | null;
  date: string; // retest or expiry date (YYYY-MM-DD)
  legacy: boolean;
  /** Opening stock (0100/0101): batch came from the old records. */
  opening?: boolean;
};

type DateField = "retest_date" | "expiry_date";
type Supabase = Awaited<ReturnType<typeof createClient>>;
type ItemEmbed = { item_code: string; name: string } | null;

const label = (i: ItemEmbed) => (i ? `${i.name} (${i.item_code})` : "—");

export async function getDashboardAlerts(
  supabase: Supabase,
  from: string,
  to: string
): Promise<{ retestSoon: AlertRow[]; expirySoon: AlertRow[] }> {
  const [rawPurchase, rawProduction, fpRetest, rawPurchaseExpiry, rawProductionExpiry, fpExpiry] = await Promise.all([
    getRawPurchaseDates(supabase, from, to, "retest_date"),
    getRawProductionDates(supabase, from, to, "retest_date"),
    getFpRetests(supabase, from, to),
    getRawPurchaseDates(supabase, from, to, "expiry_date"),
    getRawProductionDates(supabase, from, to, "expiry_date"),
    getFpExpiries(supabase, from, to),
  ]);
  const byDate = (a: AlertRow, b: AlertRow) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
  return {
    retestSoon: [...rawPurchase, ...rawProduction, ...fpRetest].sort(byDate),
    expirySoon: [...rawPurchaseExpiry, ...rawProductionExpiry, ...fpExpiry].sort(byDate),
  };
}

// Purchased raw materials: the latest QC of each batch (view purchase_line_qc),
// approved, still in stock — the same rule as the "Due for retest" list on QC.
async function getRawPurchaseDates(supabase: Supabase, from: string, to: string, field: DateField): Promise<AlertRow[]> {
  type PurchaseDateRow = {
    purchase_line_id: string;
    batch_number: string;
    item_code: string;
    item_name: string;
    ar_number: string | null;
  } & Record<DateField, string>;
  const { data } = await fetchAllRows<PurchaseDateRow>((f, t) =>
    supabase
      .from("purchase_line_qc")
      .select(`purchase_line_id, batch_number, item_code, item_name, ar_number, ${field}`)
      .eq("qc_status", "approved")
      .eq("active", true)
      .eq("item_category", "raw")
      .gt("live_remaining_qty", 0)
      .gte(field, from)
      .lte(field, to)
      .order(field, { ascending: true })
      .order("purchase_line_id", { ascending: true })
      .range(f, t)
      .returns<PurchaseDateRow[]>()
  );
  const openingIds = await getOpeningLineIds(supabase);
  return (data ?? []).map((r) => ({
    key: `p-${field}-${r.purchase_line_id}`,
    kind: "raw" as const,
    title: `${r.item_name} (${r.item_code})`,
    batch: r.batch_number,
    ar: r.ar_number,
    date: r[field],
    legacy: isLegacyCode(r.item_code) || isLegacyCode(r.batch_number),
    opening: openingIds.has(r.purchase_line_id),
  }));
}

// Raw material made from finished product issued to Production (RM-FP-…).
async function getRawProductionDates(supabase: Supabase, from: string, to: string, field: DateField): Promise<AlertRow[]> {
  type ProductionDateRow = { production_batch_id: string | null; ar_number: string | null } & Record<DateField, string>;
  const { data: statuses } = await fetchAllRows<ProductionDateRow>(
    (f, t) =>
      supabase
        .from("production_batch_status")
        .select(`production_batch_id, ar_number, ${field}`)
        .eq("qc_status", "approved")
        .gte(field, from)
        .lte(field, to)
        .order("production_batch_id", { ascending: true })
        .range(f, t)
        .returns<ProductionDateRow[]>()
  );
  const meta = new Map((statuses ?? []).filter((s) => s.production_batch_id).map((s) => [s.production_batch_id as string, s]));
  if (meta.size === 0) return [];
  const { data: batches } = await fetchByIdChunks<{ id: string; batch_number: string; items: ItemEmbed }>([...meta.keys()], (chunk) =>
    supabase
      .from("production_issue_batches")
      .select("id, batch_number, items!inner(item_code, name)")
      .in("id", chunk)
      .eq("active", true)
      .gt("live_remaining_qty", 0)
      .returns<{ id: string; batch_number: string; items: ItemEmbed }[]>()
  );
  return (batches ?? []).map((b) => {
    const m = meta.get(b.id)!;
    return {
      key: `x-${field}-${b.id}`,
      kind: "raw" as const,
      title: label(b.items),
      batch: b.batch_number,
      ar: m.ar_number,
      date: m[field],
      legacy: isLegacyCode(b.items?.item_code) || isLegacyCode(b.batch_number),
    };
  });
}

type FpEmbed = {
  batch_number: string;
  short_batch_no: string | null;
  active: boolean;
  is_legacy: boolean | null;
  mfr_definitions: { items: ItemEmbed } | null;
};

// Finished products: the latest approved QC of each batch (view current_qc_approvals).
async function getFpRetests(supabase: Supabase, from: string, to: string): Promise<AlertRow[]> {
  const { data: current } = await fetchAllRows<{ quality_check_id: string }>((f, t) =>
    supabase
      .from("current_qc_approvals")
      .select("quality_check_id")
      .not("finished_product_batch_id", "is", null)
      .gte("retest_date", from)
      .lte("retest_date", to)
      .order("quality_check_id", { ascending: true })
      .range(f, t)
  );
  const ids = (current ?? []).map((c) => c.quality_check_id);
  if (ids.length === 0) return [];
  const { data: qcs } = await fetchByIdChunks<{
    id: string;
    ar_number: string;
    retest_date: string;
    finished_product_batches: FpEmbed | null;
  }>(ids, (chunk) =>
    supabase
      .from("quality_checks")
      .select("id, ar_number, retest_date, finished_product_batches(batch_number, short_batch_no, active, is_legacy, mfr_definitions(items(item_code, name)))")
      .in("id", chunk)
      .returns<{ id: string; ar_number: string; retest_date: string; finished_product_batches: FpEmbed | null }[]>()
  );
  return (qcs ?? [])
    .filter((q) => q.finished_product_batches?.active !== false)
    .map((q) => {
      const b = q.finished_product_batches;
      const item = b?.mfr_definitions?.items ?? null;
      return {
        key: `f-${q.id}`,
        kind: "fp" as const,
        title: label(item),
        batch: b ? fpBatchBoth(b.batch_number, b.short_batch_no) : "—",
        ar: q.ar_number,
        date: q.retest_date,
        legacy: isLegacyCode(item?.item_code) || isLegacyCode(b?.batch_number),
        opening: !!b?.is_legacy,
      };
    });
}

// Finished-product expiry: the Expiry date the QC Reviewer set on the approved QC record,
// for active batches whose date falls in the window.
async function getFpExpiries(supabase: Supabase, from: string, to: string): Promise<AlertRow[]> {
  type ExpiryRow = {
    id: string;
    ar_number: string;
    expiry_date: string;
    finished_product_batches: FpEmbed | null;
  };
  const { data } = await fetchAllRows<ExpiryRow>((f, t) =>
    supabase
      .from("quality_checks")
      .select("id, ar_number, expiry_date, finished_product_batches(batch_number, short_batch_no, active, is_legacy, mfr_definitions(items(item_code, name)))")
      .eq("status", "approved")
      .not("finished_product_batch_id", "is", null)
      .gte("expiry_date", from)
      .lte("expiry_date", to)
      .order("expiry_date", { ascending: true })
      .order("id", { ascending: true })
      .range(f, t)
      .returns<ExpiryRow[]>()
  );
  return (data ?? [])
    .filter((q) => q.finished_product_batches?.active !== false)
    .map((q) => {
      const b = q.finished_product_batches;
      const item = b?.mfr_definitions?.items ?? null;
      return {
        key: `e-${q.id}`,
        kind: "fp" as const,
        title: label(item),
        batch: b ? fpBatchBoth(b.batch_number, b.short_batch_no) : "—",
        ar: q.ar_number,
        date: q.expiry_date,
        legacy: isLegacyCode(item?.item_code) || isLegacyCode(b?.batch_number),
        opening: !!b?.is_legacy,
      };
    });
}
