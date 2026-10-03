import { todayIst } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QcTable, type QcListRow } from "./qc-table";
import { fetchAllRows, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { DueForRetest, type DueForRetestLine } from "./due-for-retest";
import { AwaitingQc, type AwaitingQcLine } from "./awaiting-qc";
import { AwaitingFpQc, type AwaitingFpQcLine } from "./awaiting-fp-qc";
import { AwaitingProductionQc, type AwaitingProductionQcLine } from "./awaiting-production-qc";
import { ProductionDueForRetest, type ProductionDueForRetestLine } from "./production-due-for-retest";

// Unbounded before this — as AR records accumulate over years this page's
// full-table fetch would slow down with no server-side filter to fall back
// on (only client search over whatever got fetched). Same cap pattern as
// the Inventory Ledger tab (LEDGER_LIMIT there).
const QC_LIMIT = 1000;

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data }, awaitingLines, awaitingFpLines, dueLines, awaitingProductionLines, productionDueLines] = await Promise.all([
    // FB-0027 (12 Sept 2026): a Finished Product's QC record never gets an
    // `item_id` (submitFinishedProductToQc() only sets
    // finished_product_batch_id — see lib/actions/finished-product.ts), so
    // the "Item" column below was always "—" and unsearchable for every
    // FP-context row. Reported live: "when checking the Finished Product
    // for QC approval, only the product code is available for search" —
    // with 280+ Finished Products on file, searching by AR number or the
    // FP batch number alone (both already worked) wasn't enough; the
    // product's own name needs to show and be searchable too. Joining
    // through to mfr_definitions(name) the same way labels/page.tsx and
    // reports/page.tsx already do for Finished Product batches.
    supabase
      .from("quality_checks")
      .select(
        "id, ar_number, status, sample_qty, sample_unit, retest_date, expiry_date, is_retest, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number, short_batch_no, mfr_definitions(name)), production_issue_batches(batch_number)"
      )
      .order("created_at", { ascending: false })
      .limit(QC_LIMIT),
    getAwaitingQcLines(supabase),
    getAwaitingFpQcLines(supabase),
    getDueForRetestLines(supabase),
    getAwaitingProductionQcLines(supabase),
    getProductionDueForRetestLines(supabase),
  ]);

  const rows = (data ?? []) as unknown as QcListRow[];

  return (
    <div>
      <PageHeader
        title="Quality Control"
        description="Assign Records (AR) for incoming batches and the review decision that gates production — DESIGN.md §4.5 / §7.2."
        action={canWrite(user?.roles ?? [], "qc_assign") ? <LinkButton href="/qc/new">New AR</LinkButton> : null}
      />

      <AwaitingQc lines={awaitingLines} canStart={canWrite(user?.roles ?? [], "qc_assign")} />

      <AwaitingFpQc lines={awaitingFpLines} canSubmit={canWrite(user?.roles ?? [], "finished_product")} />

      <DueForRetest lines={dueLines} canStart={canWrite(user?.roles ?? [], "qc_assign")} />

      <AwaitingProductionQc lines={awaitingProductionLines} canStart={canWrite(user?.roles ?? [], "qc_assign")} />

      <ProductionDueForRetest lines={productionDueLines} canStart={canWrite(user?.roles ?? [], "qc_assign")} />

      <Card>
        <QcTable rows={rows} />
      </Card>
    </div>
  );
}

// Same "open for QC" query qc/new/page.tsx uses to populate its Item/Batch
// pickers (purchase_batch_status.qc_status = 'not_submitted', restricted to
// submitted POs and raw-material items — see the comment there for why:
// a draft PO's lines were never pushed to inventory, and packaging has
// never gone through QC in this app). Surfacing the same set here, on the
// QC list page itself, is what actually prompts someone to go assign QC
// for a batch that just arrived, instead of it silently waiting to be
// found on /qc/new.
// One row of the purchase_line_qc view (0077_purchase_line_qc_view.sql).
type PurchaseLineQcRow = {
  purchase_line_id: string;
  batch_number: string;
  qc_qty: string | number | null;
  stability_qty: string | number;
  unit: string;
  item_code: string;
  item_name: string;
  live_remaining_qty?: string | number;
  stability_reserve_left?: string | number;
};

async function getAwaitingQcLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AwaitingQcLine[]> {
  // ACC-08 (29 Sept 2026): one filtered request on purchase_line_qc
  // (0077) instead of fetching every not-yet-submitted line in the system
  // (legacy, packaging and draft lines included) and hitting the 1,000-row
  // cap before the real filters applied — a batch that had just arrived
  // could be missing. Paged, so the list itself is never capped either.
  const { data } = await fetchAllRows<PurchaseLineQcRow>((from, to) =>
    supabase
      .from("purchase_line_qc")
      .select("purchase_line_id, batch_number, qc_qty, stability_qty, unit, item_code, item_name")
      .eq("qc_status", "not_submitted")
      .eq("active", true)
      .eq("po_status", "submitted")
      .eq("item_category", "raw")
      .order("created_at", { ascending: false })
      .order("purchase_line_id", { ascending: true })
      .range(from, to)
  );
  return data.map((r) => ({
    id: r.purchase_line_id,
    batch_number: r.batch_number,
    qc_qty: r.qc_qty,
    unit: r.unit,
    items: { item_code: r.item_code, name: r.item_name },
  }));
}

// Finished Product equivalent of getAwaitingQcLines above (21 Sept 2026 —
// Ravi: "Finished product once created should also appear in notification
// as 'Awaiting QC'"). A batch reaches 'complete_awaiting_qc' once
// completeFinishedProductBatch runs (batch yield, finish date, sample
// quantities all entered) and sits there until submitFinishedProductToQc
// is called — this surfaces every batch in that gap, the same way the RM
// query above surfaces purchase lines that arrived but have no QC record
// yet. Unlike RM, this is a single direct query (no purchase_batch_status
// view indirection needed) — finished_product_batches.status is the
// authoritative field for this, straight from the table.
async function getAwaitingFpQcLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AwaitingFpQcLine[]> {
  const { data: lines } = await supabase
    .from("finished_product_batches")
    .select("id, batch_number, short_batch_no, qc_sample_qty, unit, mfr_definitions(name)")
    .eq("status", "complete_awaiting_qc")
    .eq("active", true)
    .order("created_at", { ascending: false });

  return (lines ?? []) as unknown as AwaitingFpQcLine[];
}

// Two-step lookup, same shape as qc/new/page.tsx's "open for QC" query:
// purchase_batch_status is a view PostgREST can't embed through directly,
// so find the matching purchase_line_ids first, then fetch those lines
// with the item-category filter (raw material only — packaging never goes
// through QC) applied server-side.
async function getDueForRetestLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<DueForRetestLine[]> {
  const today = todayIst();

  // ACC-08: one filtered, paged request on purchase_line_qc (0077).
  const { data } = await fetchAllRows<PurchaseLineQcRow>((from, to) =>
    supabase
      .from("purchase_line_qc")
      .select(
        "purchase_line_id, batch_number, qc_qty, stability_qty, unit, item_code, item_name, live_remaining_qty, stability_reserve_left"
      )
      .eq("qc_status", "approved")
      .not("retest_date", "is", null)
      .lte("retest_date", today)
      .eq("active", true)
      .eq("item_category", "raw")
      // ACC-10 (29 Sept 2026): no longer limited to batches with a stability
      // reserve — a batch without one was blocked from production yet never
      // listed here. ACC-39: only batches that still have stock to retest.
      .gt("live_remaining_qty", 0)
      .order("batch_number", { ascending: true })
      .order("purchase_line_id", { ascending: true })
      .range(from, to)
  );
  return data.map((r) => ({
    id: r.purchase_line_id,
    batch_number: r.batch_number,
    qc_qty: r.qc_qty,
    live_remaining_qty: r.live_remaining_qty ?? 0,
    stability_reserve_left: r.stability_reserve_left ?? 0,
    unit: r.unit,
    items: { item_code: r.item_code, name: r.item_name },
  }));
}

// FB-0043 (28 Sept 2026) — Production-issued RM equivalent of
// getAwaitingQcLines above. production_batch_status (0068) is the same
// kind of view purchase_batch_status is (PostgREST can't embed it
// directly), so the same two-step lookup shape applies: find the
// not-yet-submitted batch ids first, then fetch those batches with their
// item joined.
async function getAwaitingProductionQcLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AwaitingProductionQcLine[]> {
  const { data: openStatuses } = await fetchAllRows<{ production_batch_id: string | null }>((from, to) =>
    supabase
      .from("production_batch_status")
      .select("production_batch_id")
      .eq("qc_status", "not_submitted")
      .order("production_batch_id", { ascending: true })
      .range(from, to)
  );

  const openIds = (openStatuses ?? [])
    .map((s) => s.production_batch_id)
    .filter((id): id is string => !!id);
  if (!openIds.length) return [];

  // ACC-08: ids looked up in chunks (a single huge .in() list is too long a
  // URL); newest first as before.
  const { data: lines } = await fetchByIdChunks<AwaitingProductionQcLine & { created_at: string }>(openIds, (chunk) =>
    supabase
      .from("production_issue_batches")
      .select("id, batch_number, qc_qty, unit, created_at, items!inner(item_code, name)")
      .in("id", chunk)
      .eq("active", true)
      .returns<(AwaitingProductionQcLine & { created_at: string })[]>()
  );

  return lines.sort((x, y) => y.created_at.localeCompare(x.created_at));
}

// Production equivalent of getDueForRetestLines above.
async function getProductionDueForRetestLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ProductionDueForRetestLine[]> {
  const today = todayIst();

  const { data: dueStatuses } = await fetchAllRows<{ production_batch_id: string | null }>((from, to) =>
    supabase
      .from("production_batch_status")
      .select("production_batch_id")
      .eq("qc_status", "approved")
      .not("retest_date", "is", null)
      .lte("retest_date", today)
      .order("production_batch_id", { ascending: true })
      .range(from, to)
  );

  const dueIds = (dueStatuses ?? [])
    .map((s) => s.production_batch_id)
    .filter((id): id is string => !!id);
  if (!dueIds.length) return [];

  type ProductionBatchRow = Omit<ProductionDueForRetestLine, "stability_reserve_left"> & { stability_qty: string | number };
  const { data: lines } = await fetchByIdChunks<ProductionBatchRow>(dueIds, (chunk) =>
    supabase
      .from("production_issue_batches")
      .select("id, batch_number, qc_qty, stability_qty, live_remaining_qty, unit, items!inner(item_code, name)")
      .in("id", chunk)
      .eq("active", true)
      // ACC-10 / ACC-39: every due batch that still has stock.
      .gt("live_remaining_qty", 0)
      .returns<ProductionBatchRow[]>()
  );
  // Stability reserve already used by earlier retests (0080).
  const { data: used } = await fetchByIdChunks<{ production_batch_id: string; stability_reserve_used: string | number | null }>(
    lines.map((l) => l.id),
    (chunk) =>
      supabase
        .from("quality_checks")
        .select("production_batch_id, stability_reserve_used")
        .eq("is_retest", true)
        .in("production_batch_id", chunk)
  );
  const usedByBatch = new Map<string, number>();
  for (const u of used) usedByBatch.set(u.production_batch_id, (usedByBatch.get(u.production_batch_id) ?? 0) + Number(u.stability_reserve_used ?? 0));

  return lines
    .map(({ stability_qty, ...l }) => ({
      ...l,
      stability_reserve_left: Math.max(Number(stability_qty) - (usedByBatch.get(l.id) ?? 0), 0),
    }))
    .sort((x, y) => x.batch_number.localeCompare(y.batch_number));
}
