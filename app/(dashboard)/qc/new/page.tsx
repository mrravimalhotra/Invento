import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
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

  // Batches still open for QC (qc_status = 'not_submitted'), only from
  // Final-Submitted purchase orders (FB-0018 — a draft line was never pushed
  // to stock) and raw material only (packaging never goes through QC).
  // ACC-08 (29 Sept 2026): one filtered, paged request on purchase_line_qc
  // (0077). Before, every not-submitted line in the system was fetched
  // first and cut off at Supabase's 1,000-row cap before these filters
  // applied, so a newly arrived batch could be missing from this picker.
  type OpenLine = {
    purchase_line_id: string;
    batch_number: string;
    qc_qty: string | number | null;
    unit: string | null;
    item_id: string;
    item_code: string;
    item_name: string;
    default_sample_unit: string | null;
  };
  const { data: open } = await fetchAllRows<OpenLine>((from, to) =>
    supabase
      .from("purchase_line_qc")
      .select("purchase_line_id, batch_number, qc_qty, unit, item_id, item_code, item_name, default_sample_unit")
      .eq("qc_status", "not_submitted")
      .eq("active", true)
      .eq("po_status", "submitted")
      .eq("item_category", "raw")
      .order("batch_number", { ascending: true })
      .order("purchase_line_id", { ascending: true })
      .range(from, to)
  );
  const lines: PendingLine[] = open.map((r) => ({
    id: r.purchase_line_id,
    batch_number: r.batch_number,
    qc_qty: r.qc_qty,
    unit: r.unit,
    item_id: r.item_id,
    items: { item_code: r.item_code, name: r.item_name, default_sample_unit: r.default_sample_unit },
  }));

  return (
    <div>
      <PageHeader
        title="New Assign Record"
        // ACC-38: saving no longer moves stock — the QC sample is set aside when the
        // purchase order is submitted (0028), so the old "deducts on save" text was wrong.
        description="Assign an Analytical Report No. to a batch awaiting QC and record the sample. The QC sample was already set aside from stock when the purchase order was submitted, so saving here does not change stock."
      />
      <Card className="max-w-2xl">
        <CardBody>
          <QcAssignForm lines={lines} initialLineId={initialLineId} />
        </CardBody>
      </Card>
    </div>
  );
}
