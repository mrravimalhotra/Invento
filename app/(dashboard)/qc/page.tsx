import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QcTable, type QcListRow } from "./qc-table";

// Unbounded before this — as AR records accumulate over years this page's
// full-table fetch would slow down with no server-side filter to fall back
// on (only client search over whatever got fetched). Same cap pattern as
// the Inventory Ledger tab (LEDGER_LIMIT there).
const QC_LIMIT = 1000;

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, status, sample_qty, sample_unit, retest_date, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number)"
    )
    .order("created_at", { ascending: false })
    .limit(QC_LIMIT);

  const rows = (data ?? []) as unknown as QcListRow[];

  return (
    <div>
      <PageHeader
        title="Quality Control"
        description="Assign Records (AR) for incoming batches and the review decision that gates production — DESIGN.md §4.5 / §7.2."
        action={canWrite(user?.roles ?? [], "qc_assign") ? <LinkButton href="/qc/new">New AR</LinkButton> : null}
      />
      <Card>
        <QcTable rows={rows} />
      </Card>
    </div>
  );
}
