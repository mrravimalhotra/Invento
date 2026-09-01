import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { latestQcByBatch, resolveDisplayStatus } from "@/lib/finished-product-status";
import { PackagingForm } from "../packaging-form";

export default async function NewPackagingIssuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "packaging")) redirect("/packaging");

  const supabase = await createClient();
  const [{ data: allFpBatches }, { data: packagingItems }] = await Promise.all([
    supabase
      .from("finished_product_batches")
      .select("id, batch_number, status")
      .eq("active", true)
      .order("batch_number", { ascending: false }),
    supabase
      .from("items")
      .select("id, item_code, name, unit")
      .eq("active", true)
      .eq("category", "packaging")
      .order("created_at", { ascending: false }),
  ]);

  // finished_product_batches.status only ever moves to 'in_process' or
  // 'submitted_to_qc' from this module's own actions — the approved/rejected
  // verdict lives on the linked quality_checks row instead (see
  // lib/finished-product-status.ts). Resolve display status the same way the
  // Finished Product list does, rather than filtering on the raw column,
  // which would never match and always report zero eligible batches.
  const candidates = allFpBatches ?? [];
  const { data: qcRows } = candidates.length
    ? await supabase
        .from("quality_checks")
        .select("finished_product_batch_id, status, created_at")
        .in(
          "finished_product_batch_id",
          candidates.map((r) => r.id)
        )
        .not("finished_product_batch_id", "is", null)
    : { data: [] };
  const latestQc = latestQcByBatch((qcRows ?? []) as { finished_product_batch_id: string; status: string; created_at: string }[]);
  const fpBatches = candidates.filter((b) => resolveDisplayStatus(b.status, latestQc.get(b.id)) === "approved");

  return (
    <div>
      <PageHeader
        title="New packaging issue"
        description="Issue finished product out to a department. Pulls packaging material from stock automatically."
      />
      <Card className="max-w-xl">
        <CardBody>
          <PackagingForm fpBatches={fpBatches ?? []} packagingItems={packagingItems ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}
