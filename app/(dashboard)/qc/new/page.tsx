import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { QcAssignForm, type PendingLine } from "./qc-assign-form";

export default async function NewQualityCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ line?: string }>;
}) {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) redirect("/qc");

  // Deep-linked from the "Awaiting QC" card on /qc (?line=<purchase_line_id>)
  // so a batch that just arrived doesn't need to be found again in this
  // form's own picker. Purely a UI convenience — createQualityCheck() still
  // validates the line server-side regardless of how it got selected, and
  // an unrecognized/stale id here just leaves the form unselected instead
  // of erroring.
  const { line: initialLineId } = await searchParams;

  const supabase = await createClient();

  // Batches still open for QC: purchase_batch_status.qc_status = 'not_submitted'.
  const { data: openStatuses } = await supabase
    .from("purchase_batch_status")
    .select("purchase_line_id")
    .eq("qc_status", "not_submitted");

  const openIds = (openStatuses ?? []).map((s) => s.purchase_line_id).filter((id): id is string => !!id);

  // FB-0018: a batch can only be pulled for QC once its purchase order has
  // actually been Final Submitted — a draft line was never pushed to
  // inventory in the first place (0019_purchase_submit_workflow.sql), so
  // offering it here would let a sample be "pulled" from stock that never
  // existed.
  //
  // Raw material only (2 Sept 2026): Packaging Item was added as a second
  // purchasable category on the Purchase screen, deliberately without
  // QC/Stability/R&D sample capture — packaging has never gone through QC
  // in this app. Without this filter, every packaging purchase line would
  // sit here forever as "awaiting QC" (nothing ever creates a quality_checks
  // row for it), which is misleading and would let someone accidentally
  // pull a QC sample from packaging stock. `items!inner(...)` (rather than
  // the previous unqualified embed) is required for `.eq("items.category",
  // ...)` to actually filter the joined table in PostgREST.
  const { data: lines } = openIds.length
    ? await supabase
        .from("purchase_lines")
        .select(
          "id, batch_number, qc_qty, unit, expiry_date, item_id, items!inner(item_code, name, default_sample_unit, category), purchase_orders!inner(status)"
        )
        .in("id", openIds)
        .eq("active", true)
        .eq("purchase_orders.status", "submitted")
        .eq("items.category", "raw")
        .order("batch_number")
    : { data: [] as PendingLine[] };

  return (
    <div>
      <PageHeader
        title="New Assign Record"
        description="Pull a sample and assign an AR number to a batch awaiting QC. The sample deducts from available stock automatically on save."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <QcAssignForm lines={(lines ?? []) as unknown as PendingLine[]} initialLineId={initialLineId} />
        </CardBody>
      </Card>
    </div>
  );
}
