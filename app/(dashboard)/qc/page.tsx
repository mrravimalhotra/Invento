import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QcTable, type QcListRow } from "./qc-table";
import { DueForRetest, type DueForRetestLine } from "./due-for-retest";
import { AwaitingQc, type AwaitingQcLine } from "./awaiting-qc";
import { AwaitingFpQc, type AwaitingFpQcLine } from "./awaiting-fp-qc";

// Unbounded before this — as AR records accumulate over years this page's
// full-table fetch would slow down with no server-side filter to fall back
// on (only client search over whatever got fetched). Same cap pattern as
// the Inventory Ledger tab (LEDGER_LIMIT there).
const QC_LIMIT = 1000;

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data }, awaitingLines, awaitingFpLines, dueLines] = await Promise.all([
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
        "id, ar_number, status, sample_qty, sample_unit, retest_date, is_retest, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number, mfr_definitions(name))"
      )
      .order("created_at", { ascending: false })
      .limit(QC_LIMIT),
    getAwaitingQcLines(supabase),
    getAwaitingFpQcLines(supabase),
    getDueForRetestLines(supabase),
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
async function getAwaitingQcLines(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AwaitingQcLine[]> {
  const { data: openStatuses } = await supabase
    .from("purchase_batch_status")
    .select("purchase_line_id")
    .eq("qc_status", "not_submitted");

  const openIds = (openStatuses ?? [])
    .map((s) => s.purchase_line_id)
    .filter((id): id is string => !!id);
  if (!openIds.length) return [];

  const { data: lines } = await supabase
    .from("purchase_lines")
    .select("id, batch_number, qc_qty, unit, items!inner(item_code, name, category), purchase_orders!inner(status)")
    .in("id", openIds)
    .eq("active", true)
    .eq("purchase_orders.status", "submitted")
    .eq("items.category", "raw")
    .order("created_at", { ascending: false });

  return (lines ?? []) as unknown as AwaitingQcLine[];
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
    .select("id, batch_number, qc_sample_qty, unit, mfr_definitions(name)")
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
  const today = new Date().toISOString().slice(0, 10);

  const { data: dueStatuses } = await supabase
    .from("purchase_batch_status")
    .select("purchase_line_id")
    .eq("qc_status", "approved")
    .not("retest_date", "is", null)
    .lte("retest_date", today);

  const dueIds = (dueStatuses ?? [])
    .map((s) => s.purchase_line_id)
    .filter((id): id is string => !!id);
  if (!dueIds.length) return [];

  const { data: lines } = await supabase
    .from("purchase_lines")
    .select("id, batch_number, stability_qty, unit, items!inner(item_code, name, category)")
    .in("id", dueIds)
    .eq("active", true)
    .eq("items.category", "raw")
    .gt("stability_qty", 0)
    .order("batch_number");

  return (lines ?? []) as unknown as DueForRetestLine[];
}
