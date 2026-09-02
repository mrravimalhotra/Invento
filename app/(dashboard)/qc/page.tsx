import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { QcTable, type QcListRow } from "./qc-table";
import { DueForRetest, type DueForRetestLine } from "./due-for-retest";

// Unbounded before this — as AR records accumulate over years this page's
// full-table fetch would slow down with no server-side filter to fall back
// on (only client search over whatever got fetched). Same cap pattern as
// the Inventory Ledger tab (LEDGER_LIMIT there).
const QC_LIMIT = 1000;

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const [{ data }, dueLines] = await Promise.all([
    supabase
      .from("quality_checks")
      .select(
        "id, ar_number, status, sample_qty, sample_unit, retest_date, is_retest, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number)"
      )
      .order("created_at", { ascending: false })
      .limit(QC_LIMIT),
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

      {dueLines.length > 0 && (
        <Card className="mb-4 border-amber/40">
          <CardHeader title="Due for retest" />
          <CardBody className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              Retest date has passed on these approved batches — start a new AR using the stability sample
              already reserved for each.
            </p>
            <DueForRetest lines={dueLines} canStart={canWrite(user?.roles ?? [], "qc_assign")} />
          </CardBody>
        </Card>
      )}

      <Card>
        <QcTable rows={rows} />
      </Card>
    </div>
  );
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
