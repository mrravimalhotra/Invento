import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listAllFeedback } from "@/lib/actions/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { FeedbackAdminList } from "./feedback-admin-list";

export default async function FeedbackAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = user.roles.includes("system_admin");

  return (
    <div>
      <PageHeader
        title="Tester Feedback"
        description="Every observation submitted from the feedback widget on each page, in one place — triage each into a category and a status; the tester sees your notes and status on the page they reported it from."
      />

      {!canManage ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin access to triage feedback. You can still submit feedback from any
            page — use the &quot;Feedback &amp; change log&quot; section at the bottom.
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="All submissions" />
          <FeedbackAdminList rows={await listAllFeedback()} />
        </Card>
      )}
    </div>
  );
}
