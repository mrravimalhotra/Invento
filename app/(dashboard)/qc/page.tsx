import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QcTable, type QcListRow } from "./qc-table";

export default async function QcListPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("quality_checks")
    .select(
      "id, ar_number, status, sample_qty, sample_unit, retest_date, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number)"
    )
    .order("created_at", { ascending: false });

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
