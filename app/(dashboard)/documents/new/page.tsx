import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewDocumentForm } from "../document-form";

export default async function NewDocumentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canWrite(user.roles, "documents")) redirect("/documents");

  return (
    <div>
      <PageHeader title="New SOP / STP document" description="Register a new procedure document with its current revision and a link to the file." />
      <Card className="max-w-md">
        <CardBody>
          <NewDocumentForm />
        </CardBody>
      </Card>
    </div>
  );
}
