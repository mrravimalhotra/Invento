import { lowStockCheck } from "@/lib/low-stock";
import type { Metadata } from "next";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { LoadWarning } from "@/components/ui/load-warning";
import { createClient } from "@/lib/supabase/server";
import { istDayStart, isLegacyCode, todayIst } from "@/lib/utils";
import { addDaysToDate, chartUnit, isInternalMove, lastIstDays, lineValueInclGst } from "@/lib/dashboard-series";
import { ALERT_WINDOW_DAYS, getDashboardAlerts } from "./dashboard-alerts";
import { getFpInProgress } from "@/lib/fp-in-progress";
import { CALIBRATION_DUE_SOON_DAYS, calibrationNeedsAttention, calibrationState } from "@/lib/calibration";
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
  unit: string | null;
  reference_type: string | null;
  department: string | null;
  items: { item_code: string } | null;
  purchase_lines: { batch_number: string } | null;
  production_issue_batches: { batch_number: string } | null;
};
type PurchaseLineRow = {
  pushed_at: string;
  quantity: number;
  unit_price: number | null;
  gst_pct: number | null;
  purchase_orders: { po_number: string; received_on: string | null } | null;
};

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();

  // The last 30 India-time calendar days, today included.
  const days = lastIstDays(DAYS);
  const since = istDayStart(days[0]);
  const retestFrom = todayIst();
  const retestTo = addDaysToDate(retestFrom, ALERT_WINDOW_DAYS);

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
    { data: ledger30, error: ledgerError },
    { data: purchase30, error: purchaseError },
    { data: fp30, error: fpError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabase.from("items").select("*", head()).eq("category", "raw").eq("active", true),
    supabase.from("items").select("*", head()).eq("category", "raw").eq("active", true).not("item_code", "like", "LEG-%"),
    supabase.from("vendors").select("*", head()).eq("active", true),
    supabase.from("vendors").select("*", head()).eq("active", true).not("vendor_code", "like", "LEG-%"),
    supabase.from("mfr_definitions").select("*", head()),
    supabase.from("mfr_definitions").select("*", head()).not("code", "like", "LEG-%"),
    supabase.from("finished_product_batches").select("*", head()).eq("active", true),
    supabase.from("finished_product_batches").select("*", head()).eq("active", true).not("batch_number", "like", "LEG-%"),
    // SCAN-P7-11: only submitted orders count, dated by the day the goods
    // were received (received_on), or the day the order was submitted.
    supabase.from("purchase_orders").select("*", head()).eq("active", true).eq("status", "submitted")
      .or(`received_on.gte.${days[0]},and(received_on.is.null,submitted_at.gte.${since})`),
    supabase.from("purchase_orders").select("*", head()).eq("active", true).eq("status", "submitted")
      .or(`received_on.gte.${days[0]},and(received_on.is.null,submitted_at.gte.${since})`).not("po_number", "like", "LEG-%"),
    // Quality-check counts per status, with and without legacy records
    // (0084_dashboard_qc_counts.sql).
    supabase.rpc("dashboard_qc_counts"),
    // ACC-08: paged, so a busy month isn't cut off at 1,000 rows. A ledger
    // event is legacy by the same test the Ledger page uses for the item and
    // raw-material batch it moved.
    fetchAllRows((from, to) =>
      supabase
        .from("inventory_ledger")
        .select("event_type, event_at, quantity, unit, reference_type, department, items(item_code), purchase_lines(batch_number), production_issue_batches(batch_number)")
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
        .select("pushed_at, quantity, unit_price, gst_pct, purchase_orders!inner(po_number, received_on)")
        .eq("active", true)
        .not("pushed_at", "is", null)
        .eq("purchase_orders.active", true)
        .gte("pushed_at", since)
        .order("pushed_at", { ascending: true })
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
    fetchAllRows<{ id: string; name: string; item_code: string; category: string; unit: string | null; low_stock_threshold: string | number }>((from, to) =>
      supabase
        .from("items")
        .select("id, name, item_code, category, unit, low_stock_threshold")
        .not("low_stock_threshold", "is", null)
        .eq("active", true)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  // B15: retest / expiry alerts, next 90 days (see dashboard-alerts.ts).
  const alerts = await getDashboardAlerts(supabase, retestFrom, retestTo);
  // B34: finished product batches that have started and are not complete.
  const inProgress = await getFpInProgress(supabase);
  // P8-01: equipment whose calibration is overdue or due within 30 days, soonest first.
  const { data: equipmentRows } = await supabase
    .from("equipment")
    .select("id, equipment_code, name, room_no, calibration_status, next_calibration_due")
    .eq("active", true)
    .eq("calibration_status", "required")
    .lte("next_calibration_due", addDaysToDate(retestFrom, CALIBRATION_DUE_SOON_DAYS))
    .order("next_calibration_due", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  const equipmentDue = (equipmentRows ?? [])
    .map((e) => ({ ...e, state: calibrationState(e.calibration_status, e.next_calibration_due, retestFrom) }))
    .filter((e) => calibrationNeedsAttention(e.state));

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
    // A proposed rejection (0119) is still waiting for the QC Reviewer, like an approval.
    const key = (r.status === "checker_rejected" ? "checker_approved" : r.status) as keyof QcStatusCounts;
    if (key in qc) {
      qc[key] = { all: qc[key].all + Number(r.total), nonLegacy: qc[key].nonLegacy + Number(r.non_legacy) };
    }
  }

  // ACC-08: balances only for the items that have a threshold, looked up in
  // chunks. Before, the whole stock_balance view was read in one capped
  // request, so an item outside the first 1,000 counted as 0 on hand and
  // showed as a false "Low stock".
  const { data: balances, error: balancesError } = await fetchByIdChunks<{ item_id: string; on_hand: string | number }>(
    (items ?? []).map((it) => it.id),
    (chunk) => supabase.from("stock_balance").select("item_id, on_hand").in("item_id", chunk)
  );
  const balanceMap = new Map((balances ?? []).map((b) => [b.item_id, Number(b.on_hand)]));
  // SCAN-P3-10: raw material is compared on usable stock (see lib/low-stock.ts).
  const rawIds = (items ?? []).filter((it) => it.category === "raw").map((it) => it.id);
  const { data: statuses, error: statusesError } = await fetchByIdChunks<{ item_id: string; usable: string | number }>(
    rawIds,
    (chunk) => supabase.from("item_stock_status").select("item_id, usable").in("item_id", chunk)
  );
  const usableMap = new Map((statuses ?? []).map((x) => [x.item_id, Number(x.usable)]));
  const lowStock = (items ?? [])
    .map((it) => {
      const onHand = balanceMap.get(it.id) ?? 0;
      const r = lowStockCheck({ category: it.category, threshold: it.low_stock_threshold, onHand, usable: usableMap.get(it.id) ?? 0 });
      return { it, onHand, r };
    })
    .filter((x) => x.r.low)
    .map(({ it, onHand, r }) => ({
      id: it.id,
      name: it.name,
      item_code: it.item_code,
      threshold: it.low_stock_threshold,
      unit: it.unit ?? "",
      onHand,
      usable: r.basis === "usable" ? r.compared : null,
      compared: r.compared,
    }))
    // SCAN-P7-10: the card lists the worst first (least stock against its threshold).
    .sort((a, b) => a.compared / (Number(a.threshold) || 1) - b.compared / (Number(b.threshold) || 1) || a.item_code.localeCompare(b.item_code));

  const data: DashboardData = {
    rawMaterials: pair(rawAll, rawNon),
    vendors: pair(vendorAll, vendorNon),
    mfrs: pair(mfrAll, mfrNon),
    finishedBatches: pair(fpAll, fpNon),
    pos30: pair(poAll, poNon),
    qc,
    lowStock,
    retestSoon: alerts.retestSoon,
    expirySoon: alerts.expirySoon,
    fpInProgress: inProgress.rows,
    fpInProgressTotal: inProgress.total,
    equipmentDue,
    ledger30: ((ledger30 ?? []) as unknown as LedgerRow[])
      .filter((l) => !isInternalMove(l.reference_type, l.department))
      .map((l) => ({
      event_type: l.event_type,
      event_at: l.event_at,
      ...chartUnit(Number(l.quantity), l.unit),
      legacy:
        isLegacyCode(l.items?.item_code) ||
        isLegacyCode(l.purchase_lines?.batch_number) ||
        isLegacyCode(l.production_issue_batches?.batch_number),
    })),
    purchase30: ((purchase30 ?? []) as unknown as PurchaseLineRow[]).map((l) => ({
      // SCAN-P7-11: plotted on the day the goods were received (the order's
      // received_on), or the day the order was submitted when that is blank.
      created_at: l.purchase_orders?.received_on ? `${l.purchase_orders.received_on}T12:00:00+05:30` : l.pushed_at,
      value: lineValueInclGst(l.quantity, l.unit_price, l.gst_pct),
      legacy: isLegacyCode(l.purchase_orders?.po_number),
    })),
    fp30: (fp30 ?? []).map((f) => ({ created_at: f.created_at, legacy: isLegacyCode(f.batch_number) })),
    days,
  };

  return (
    <>
      <LoadWarning errors={[ledgerError, purchaseError, fpError, itemsError, balancesError, statusesError]} what="the Dashboard" />
      <DashboardView data={data} />
    </>
  );
}
