import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PurchaseOrderForm } from "../purchase-order-form";

export default async function NewPurchaseOrderPage() {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "purchase")) redirect("/purchase");

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, vendor_code, name")
    .eq("active", true)
    .order("name");

  return (
    <div>
      <PageHeader title="New purchase order" description="PO number is assigned automatically on save." />
      <Card className="max-w-xl">
        <CardBody>
          <PurchaseOrderForm vendors={vendors ?? []} />
        </CardBody>
      </Card>
    </div>
  );
}
