import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { istDayStart, isLegacyCode, todayIst } from "@/lib/utils";
import { addDaysToDate, lastIstDays, lineValueInclGst } from "@/lib/dashboard-series";
import { DashboardView, type CountPair, type DashboardData, type QcStatusCounts } from "./dashboard-view";

// ACC-26 (29 Sept 2026, Ravi): the Dashboard now agrees with the lists its
// cards open, includes GST in Purchase value, and honours "Hide legacy data".
// Every count is fetched as a pair — all rows, and rows that are not legacy
// (no LEG- code) — and the browser picks one (see dashboard-view.tsx).

const DAYS = 30;

type LedgerRow = {
  event_type: string;
  event_at: string;
  quantity: number;
  items: { item_code: string } | null;
  purchase_lines: { batch_number: string } | null;
  production_issue_batches: { batch_number: string } | null;
};
type PurchaseLineRow = {
  created_at: string;
  quantity: number;
  unit_price: number | null;
  gst_pct: number | null;
  purchase_orders: { po_number: string } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // The last 30 India-time calendar days, today included.
  const days = lastIstDays(DAYS);
  const since = istDayStart(days[0]);
  const retestFrom = todayIst();
  const retestTo = addDaysToDate(retestFrom, 30);

  const head = () => ({ count: "exact" as const, head: true });

  // Same rows as the list each card opens:
  //   Raw materials   /items            active raw materials
  //   Vendors         /vendors          active vendors
  //   MFR definitions /mfr              every MFR (the list has an Active column)
  //   Finished batches /finished-product active batches
  //   POs (30d)       /purchase         active purchase orders
  const [
    rawAll, rawNon,
    vendorAll, vendorNon,
    mfrAll, mfrNon,
    fpAll, fpNon,
    poAll, poNon,
    { data: qcRows },
    { data: ledger30 },
    { data: purchase30 },
    { data: fp30 },
    { data: retestSoon },
    { data: items },
  ] = await Promise.all([
    supabase.from("items").select("*", head()).eq("category", "raw").eq("active", true),
    supabase.from("items").select("*", head()).eq("category", "raw").eq("active", true).not("item_code", "like", "LEG-%"),
    supabase.from("vendors").select("*", head()).eq("active", true),
    supabase.from("vendors").select("*", head()).eq("active", true).not("vendor_code", "like", "LEG-%"),
    supabase.from("mfr_definitions").select("*", head()),
    supabase.from("mfr_definitions").select("*", head()).not("code", "like", "LEG-%"),
    supabase.from("finished_product_batches").select("*", head()).eq("active", true),
    supabase.from("finished_product_batches").select("*", head()).eq("active", true).not("batch_number", "like", "LEG-%"),
    supabase.from("purchase_orders").select("*", head()).eq("active", true).gte("created_at", since),
    supabase.from("purchase_orders").select("*", head()).eq("active", true).gte("created_at", since).not("po_number", "like", "LEG-%"),
    // Quality-check counts per status, with and without legacy records
    // (0084_dashboard_qc_counts.sql).
    supabase.rpc("dashboard_qc_counts"),
    // ACC-08: paged, so a busy month isn't cut off at 1,000 rows. A ledger
    // event is legacy by the same test the Ledger page uses for the item and
    // raw-material batch it moved.
    fetchAllRows((from, to) =>
      supabase
        .from("inventory_ledger")
        .select("event_type, event_at, quantity, items(item_code), purchase_lines(batch_number), production_issue_batches(batch_number)")
        .gte("event_at", since)
        .order("event_at", { ascending: true })
        .order("seq", { ascending: true })
        .range(from, to)
    ),
    // Purchase value: lines that are actually in stock (purchase order
    // submitted, line not deleted), priced including GST like the Purchase
    // list. A draft order is not a purchase yet.
    fetchAllRows((from, to) =>
      supabase
        .from("purchase_lines")
        .select("created_at, quantity, unit_price, gst_pct, purchase_orders!inner(po_number)")
        .eq("active", true)
        .not("pushed_at", "is", null)
        .eq("purchase_orders.active", true)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ created_at: string; batch_number: string }>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select("created_at, batch_number")
        .eq("active", true)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    // A few extra rows so hiding legacy ones still leaves up to five to show.
    supabase
      .from("quality_checks")
      .select("ar_number, retest_date, items(item_code), purchase_lines(batch_number)")
      .not("retest_date", "is", null)
      .gte("retest_date", retestFrom)
      .lte("retest_date", retestTo)
      .order("retest_date", { ascending: true })
      .limit(40),
    fetchAllRows<{ id: string; name: string; item_code: string; low_stock_threshold: string | number }>((from, to) =>
      supabase
        .from("items")
        .select("id, name, item_code, low_stock_threshold")
        .not("low_stock_threshold", "is", null)
        .eq("active", true)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const pair = (all: { count: number | null }, non: { count: number | null }): CountPair => ({
    all: all.count ?? 0,
    nonLegacy: non.count ?? 0,
  });

  const qc: QcStatusCounts = {
    submitted: { all: 0, nonLegacy: 0 },
    checker_approved: { all: 0, nonLegacy: 0 },
    approved: { all: 0, nonLegacy: 0 },
    rejected: { all: 0, nonLegacy: 0 },
  };
  for (const r of (qcRows ?? []) as { status: string; total: number | string; non_legacy: number | string }[]) {
    if (r.status in qc) {
      qc[r.status as keyof QcStatusCounts] = { all: Number(r.total), nonLegacy: Number(r.non_legacy) };
    }
  }

  // ACC-08: balances only for the items that have a threshold, looked up in
  // chunks. Before, the whole stock_balance view was read in one capped
  // request, so an item outside the first 1,000 counted as 0 on hand and
  // showed as a false "Low stock".
  const { data: balances } = await fetchByIdChunks<{ item_id: string; on_hand: string | number }>(
    (items ?? []).map((it) => it.id),
    (chunk) => supabase.from("stock_balance").select("item_id, on_hand").in("item_id", chunk)
  );
  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));
  const lowStock = (items ?? [])
    .filter((it) => (balanceMap.get(it.id) ?? 0) < Number(it.low_stock_threshold))
    .map((it) => ({
      id: it.id,
      name: it.name,
      item_code: it.item_code,
      threshold: it.low_stock_threshold,
      onHand: balanceMap.get(it.id) ?? 0,
    }));

  const data: DashboardData = {
    rawMaterials: pair(rawAll, rawNon),
    vendors: pair(vendorAll, vendorNon),
    mfrs: pair(mfrAll, mfrNon),
    finishedBatches: pair(fpAll, fpNon),
    pos30: pair(poAll, poNon),
    qc,
    lowStock,
    retestSoon: ((retestSoon ?? []) as unknown as {
      ar_number: string;
      retest_date: string;
      items: { item_code: string } | null;
      purchase_lines: { batch_number: string } | null;
    }[]).map((q) => ({
      ar_number: q.ar_number,
      retest_date: q.retest_date,
      legacy: isLegacyCode(q.items?.item_code) || isLegacyCode(q.purchase_lines?.batch_number),
    })),
    ledger30: ((ledger30 ?? []) as unknown as LedgerRow[]).map((l) => ({
      event_type: l.event_type,
      event_at: l.event_at,
      quantity: Number(l.quantity),
      legacy:
        isLegacyCode(l.items?.item_code) ||
        isLegacyCode(l.purchase_lines?.batch_number) ||
        isLegacyCode(l.production_issue_batches?.batch_number),
    })),
    purchase30: ((purchase30 ?? []) as unknown as PurchaseLineRow[]).map((l) => ({
      created_at: l.created_at,
      value: lineValueInclGst(l.quantity, l.unit_price, l.gst_pct),
      legacy: isLegacyCode(l.purchase_orders?.po_number),
    })),
    fp30: (fp30 ?? []).map((f) => ({ created_at: f.created_at, legacy: isLegacyCode(f.batch_number) })),
    days,
  };

  return <DashboardView data={data} />;
}
