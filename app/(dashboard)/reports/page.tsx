import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { latestQcByBatch, resolveDisplayStatus } from "@/lib/finished-product-status";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
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

type BalanceQueryRow = { item_id: string; on_hand: string | number };

export default async function ReportsPage() {
  const supabase = await createClient();

  // known-issues.md ("Row-cap truncation") — every one of these five
  // queries fetched its whole table with no `.limit()`, ordered
  // newest-first. That ordering (FB-0006's fix) only ever guarantees a
  // *picker* shows new rows within whatever the server's 1,000-row cap
  // returns — it does nothing for a *report* that's supposed to show
  // every row. purchase_lines alone has ~92,000 rows (mostly legacy) on
  // file, so the Purchase Register was almost certainly already silently
  // showing only its newest 1,000 lines, no error, no indication. Same
  // fix as Stock Position (Twelfth pass) and Item Master (this pass):
  // fetchAllRows pages every query in max-rows-sized `.range()` windows
  // until each is exhausted.
  const [itemsRes, balancesRes, qcRes, fpRes, purchaseRes] = await Promise.all([
    fetchAllRows<Omit<RmStockRow, "onHand">>((from, to) =>
      supabase
        .from("items")
        .select("id, item_code, name, unit, low_stock_threshold, created_at")
        .eq("category", "raw")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // ACC-07: unique tiebreaker so pages never overlap or skip
        .range(from, to)
        .returns<Omit<RmStockRow, "onHand">[]>()
    ),
    fetchAllRows<BalanceQueryRow>((from, to) =>
      supabase
        .from("stock_balance")
        .select("item_id, on_hand")
        .order("item_id", { ascending: true })
        .range(from, to)
        .returns<BalanceQueryRow[]>()
    ),
    // created_at dropped from both selects below (21 Sept 2026, pagination
    // roadmap step 2 — a quick audit of every fetchAllRows call site for
    // columns that are fetched but never used, per docs/modules/
    // performance.md). Neither QcRegisterReport nor FpRegisterReport ever
    // renders or reads created_at — QcRow's report date column uses
    // reviewed_at, FpRow's uses finish_date instead (see report-tables.tsx).
    // The .order("created_at", ...) below still works with created_at
    // absent from .select() — ordering and column projection are
    // independent PostgREST query params, not coupled to each other; this
    // exact pattern (order by a column that isn't in the select list) is
    // already live and working today in this app, on the Inventory Balance
    // page's own items query
    // (app/(dashboard)/inventory/(tabs)/balance/page.tsx).
    fetchAllRows<unknown>((from, to) =>
      supabase
        .from("quality_checks")
        .select(
          "ar_number, status, reviewed_at, retest_date, expiry_date, is_legacy, item:items(name), purchase_line:purchase_lines(batch_number), fp_batch:finished_product_batches(batch_number, short_batch_no)"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // ACC-07: unique tiebreaker so pages never overlap or skip
        .range(from, to)
        .returns<unknown[]>()
    ),
    fetchAllRows<unknown>((from, to) =>
      supabase
        .from("finished_product_batches")
        .select("id, batch_number, short_batch_no, target_qty, actual_yield_pct, status, finish_date, is_legacy, mfr:mfr_definitions(name)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // ACC-07: unique tiebreaker so pages never overlap or skip
        .range(from, to)
        .returns<unknown[]>()
    ),
    fetchAllRows<unknown>((from, to) =>
      supabase
        .from("purchase_lines")
        // FB-0035 (12 Sept 2026): `category` rides along on the item embed so
        // the Purchase Register can offer a Raw material / Packaging filter —
        // every purchased item is one or the other (see purchase-line-form.tsx),
        // never 'processed'/'packaged_fp' (those are never purchased).
        // ACC-35 (29 Sept 2026, Ravi: exclude drafts): only lines that are
        // actually in stock — their purchase order is submitted (pushed_at is
        // set on submit and cleared on reopen) — and not deleted (active).
        // A draft or reopened PO hasn't moved stock, so its lines aren't
        // "received". `unit` rides along so quantities say kg / nos / ltr.
        .select(
          "batch_number, quantity, unit, live_remaining_qty, created_at, is_legacy, item:items(name, category), purchase_order:purchase_orders(po_number, vendor:vendors(name))"
        )
        .eq("active", true)
        .not("pushed_at", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }) // ACC-07: unique tiebreaker so pages never overlap or skip
        .range(from, to)
        .returns<unknown[]>()
    ),
  ]);

  const onHandByItem = new Map<string, number>();
  for (const b of balancesRes.data ?? []) {
    onHandByItem.set(b.item_id, Number(b.on_hand ?? 0));
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
  // ACC-08: looked up in chunks (see fetchByIdChunks).
  const { data: fpQcRows } = await fetchByIdChunks(
    fpBatchRows.map((r) => r.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in("finished_product_batch_id", chunk)
        .not("finished_product_batch_id", "is", null)
  );
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
