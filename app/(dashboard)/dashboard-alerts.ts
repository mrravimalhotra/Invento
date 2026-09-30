import type { createClient } from "@/lib/supabase/server";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { isLegacyCode } from "@/lib/utils";

// B15 (30 Sept 2026, Ravi): the Dashboard warns about
//  - RETEST due in the next 90 days for raw materials AND finished products,
//  - EXPIRY in the next 90 days for finished products only.
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
};

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ItemEmbed = { item_code: string; name: string } | null;

const label = (i: ItemEmbed) => (i ? `${i.name} (${i.item_code})` : "—");

export async function getDashboardAlerts(
  supabase: Supabase,
  from: string,
  to: string
): Promise<{ retestSoon: AlertRow[]; expirySoon: AlertRow[] }> {
  const [rawPurchase, rawProduction, fpRetest, fpExpiry] = await Promise.all([
    getRawPurchaseRetests(supabase, from, to),
    getRawProductionRetests(supabase, from, to),
    getFpRetests(supabase, from, to),
    getFpExpiries(supabase, from, to),
  ]);
  const byDate = (a: AlertRow, b: AlertRow) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
  return {
    retestSoon: [...rawPurchase, ...rawProduction, ...fpRetest].sort(byDate),
    expirySoon: fpExpiry.sort(byDate),
  };
}

// Purchased raw materials: the latest QC of each batch (view purchase_line_qc),
// approved, still in stock — the same rule as the "Due for retest" list on QC.
async function getRawPurchaseRetests(supabase: Supabase, from: string, to: string): Promise<AlertRow[]> {
  const { data } = await fetchAllRows<{
    purchase_line_id: string;
    batch_number: string;
    item_code: string;
    item_name: string;
    ar_number: string | null;
    retest_date: string;
  }>((f, t) =>
    supabase
      .from("purchase_line_qc")
      .select("purchase_line_id, batch_number, item_code, item_name, ar_number, retest_date")
      .eq("qc_status", "approved")
      .eq("active", true)
      .eq("item_category", "raw")
      .gt("live_remaining_qty", 0)
      .gte("retest_date", from)
      .lte("retest_date", to)
      .order("retest_date", { ascending: true })
      .order("purchase_line_id", { ascending: true })
      .range(f, t)
  );
  return (data ?? []).map((r) => ({
    key: `p-${r.purchase_line_id}`,
    kind: "raw" as const,
    title: `${r.item_name} (${r.item_code})`,
    batch: r.batch_number,
    ar: r.ar_number,
    date: r.retest_date,
    legacy: isLegacyCode(r.item_code) || isLegacyCode(r.batch_number),
  }));
}

// Raw material made from finished product issued to Production (RM-FP-…).
async function getRawProductionRetests(supabase: Supabase, from: string, to: string): Promise<AlertRow[]> {
  const { data: statuses } = await fetchAllRows<{ production_batch_id: string | null; ar_number: string | null; retest_date: string }>(
    (f, t) =>
      supabase
        .from("production_batch_status")
        .select("production_batch_id, ar_number, retest_date")
        .eq("qc_status", "approved")
        .gte("retest_date", from)
        .lte("retest_date", to)
        .order("production_batch_id", { ascending: true })
        .range(f, t)
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
      key: `x-${b.id}`,
      kind: "raw" as const,
      title: label(b.items),
      batch: b.batch_number,
      ar: m.ar_number,
      date: m.retest_date,
      legacy: isLegacyCode(b.items?.item_code) || isLegacyCode(b.batch_number),
    };
  });
}

type FpEmbed = {
  batch_number: string;
  active: boolean;
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
      .select("id, ar_number, retest_date, finished_product_batches(batch_number, active, mfr_definitions(items(item_code, name)))")
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
        batch: b?.batch_number ?? "—",
        ar: q.ar_number,
        date: q.retest_date,
        legacy: isLegacyCode(item?.item_code) || isLegacyCode(b?.batch_number),
      };
    });
}

// Finished-product expiry: approved, active batches whose expiry date falls in the window.
async function getFpExpiries(supabase: Supabase, from: string, to: string): Promise<AlertRow[]> {
  type ExpiryRow = {
    id: string;
    batch_number: string;
    expiry_date: string;
    mfr_definitions: { items: ItemEmbed } | null;
  };
  const { data } = await fetchAllRows<ExpiryRow>((f, t) =>
    supabase
      .from("finished_product_batches")
      .select("id, batch_number, expiry_date, mfr_definitions(items(item_code, name))")
      .eq("status", "approved")
      .eq("active", true)
      .gte("expiry_date", from)
      .lte("expiry_date", to)
      .order("expiry_date", { ascending: true })
      .order("id", { ascending: true })
      .range(f, t)
      .returns<ExpiryRow[]>()
  );
  return (data ?? []).map((b) => {
    const item = b.mfr_definitions?.items ?? null;
    return {
      key: `e-${b.id}`,
      kind: "fp" as const,
      title: label(item),
      batch: b.batch_number,
      ar: null,
      date: b.expiry_date,
      legacy: isLegacyCode(item?.item_code) || isLegacyCode(b.batch_number),
    };
  });
}
