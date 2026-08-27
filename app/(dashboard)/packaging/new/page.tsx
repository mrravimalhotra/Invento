import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PackagingForm } from "../packaging-form";

export default async function NewPackagingIssuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "packaging")) redirect("/packaging");

  const supabase = await createClient();
  const [{ data: fpBatches }, { data: packagingItems }] = await Promise.all([
    supabase
      .from("finished_product_batches")
      .select("id, batch_number")
      .eq("active", true)
      .eq("status", "approved")
      .order("batch_number", { ascending: false }),
    supabase.from("items").select("id, name, unit").eq("active", true).eq("category", "packaging").order("name"),
  ]);

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
