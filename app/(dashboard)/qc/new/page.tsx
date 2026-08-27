import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { QcAssignForm, type PendingLine } from "./qc-assign-form";

export default async function NewQualityCheckPage() {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "qc_assign")) redirect("/qc");

  const supabase = await createClient();

  // Batches still open for QC: purchase_batch_status.qc_status = 'not_submitted'.
  const { data: openStatuses } = await supabase
    .from("purchase_batch_status")
    .select("purchase_line_id")
    .eq("qc_status", "not_submitted");

  const openIds = (openStatuses ?? []).map((s) => s.purchase_line_id).filter((id): id is string => !!id);

  const { data: lines } = openIds.length
    ? await supabase
        .from("purchase_lines")
        .select("id, batch_number, qc_qty, unit, expiry_date, item_id, items(item_code, name)")
        .in("id", openIds)
        .eq("active", true)
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
          <QcAssignForm lines={(lines ?? []) as unknown as PendingLine[]} />
        </CardBody>
      </Card>
    </div>
  );
}
