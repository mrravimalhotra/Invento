import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewEnvironmentalReadingForm } from "../environmental-control-form";

export default async function NewEnvironmentalReadingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "environmental_control")) redirect("/environmental-control");

  return (
    <div>
      <PageHeader title="New environmental reading" description="Log a temperature/humidity reading for an area." />
      <Card className="max-w-md">
        <CardBody>
          <NewEnvironmentalReadingForm />
        </CardBody>
      </Card>
    </div>
  );
}
