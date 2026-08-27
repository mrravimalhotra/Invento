import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewBmrForm } from "../bmr-forms";

export default async function NewBmrPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "bmr")) redirect("/bmr");

  const supabase = await createClient();
  const [{ data: fpBatches }, { data: bmrRows }] = await Promise.all([
    supabase
      .from("finished_product_batches")
      .select("id, batch_number")
      .eq("active", true)
      .order("batch_number", { ascending: false }),
    supabase.from("bmr_records").select("finished_product_batch_id"),
  ]);

  const usedIds = new Set((bmrRows ?? []).map((r) => r.finished_product_batch_id));
  const available = (fpBatches ?? []).filter((b) => !usedIds.has(b.id));

  return (
    <div>
      <PageHeader
        title="New BMR"
        description="Pick the finished product batch this Batch Manufacturing Record documents. Only batches without a BMR yet are listed."
      />
      <Card className="max-w-md">
        <CardBody>
          <NewBmrForm batches={available} />
        </CardBody>
      </Card>
    </div>
  );
}
