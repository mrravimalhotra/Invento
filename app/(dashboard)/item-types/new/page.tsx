import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewItemTypeForm } from "../item-type-form";

export default async function NewItemTypePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "item_types")) redirect("/item-types");

  return (
    <div>
      <PageHeader title="New item type" description="Add a category used on the Item Master screen." />
      <Card className="max-w-md">
        <CardBody>
          <NewItemTypeForm />
        </CardBody>
      </Card>
    </div>
  );
}
