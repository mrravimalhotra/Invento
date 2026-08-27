import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { VendorForm } from "../vendor-form";

export default async function NewVendorPage() {
  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "vendors")) redirect("/vendors");

  return (
    <div>
      <PageHeader title="New vendor" description="Vendor code is assigned automatically on save." />
      <Card className="max-w-xl">
        <CardBody>
          <VendorForm />
        </CardBody>
      </Card>
    </div>
  );
}
