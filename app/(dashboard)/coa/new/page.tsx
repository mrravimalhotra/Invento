import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CoaForm, type ApprovedQc } from "./coa-form";

export default async function NewCoaPage() {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "coa")) redirect("/coa");

  const supabase = await createClient();
  const { data: approved } = await supabase
    .from("quality_checks")
    .select("id, ar_number, items(item_code, name), purchase_lines(batch_number), finished_product_batches(batch_number)")
    .eq("status", "approved")
    .order("ar_number");

  return (
    <div>
      <PageHeader
        title="New Certificate of Analysis"
        description="Pick an Approved quality check. File upload is not built in this pass — paste a URL to the certificate document."
      />
      <Card className="max-w-xl">
        <CardBody>
          <CoaForm approvedChecks={(approved ?? []) as unknown as ApprovedQc[]} />
        </CardBody>
      </Card>
    </div>
  );
}
