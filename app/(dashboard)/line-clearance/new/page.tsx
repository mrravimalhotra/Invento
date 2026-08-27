import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewLineClearanceForm } from "../line-clearance-form";

export default async function NewLineClearancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "line_clearance")) redirect("/line-clearance");

  return (
    <div>
      <PageHeader title="New line clearance check" description="Record whether an area/line is clear before a batch starts." />
      <Card className="max-w-md">
        <CardBody>
          <NewLineClearanceForm />
        </CardBody>
      </Card>
    </div>
  );
}
