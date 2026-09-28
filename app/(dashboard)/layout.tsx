import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PageFeedback } from "@/components/feedback/page-feedback";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // SEC-01 part 2 (28 Sept 2026, 0075_security_hardening.sql): the database
  // now only lets an account with at least one role read business data. A
  // signed-in account with no role (new and not yet set up, or a disabled
  // leaver) gets this page instead of an empty-looking app.
  if (user.roles.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <Topbar user={user} />
        <main className="flex flex-1 items-start justify-center p-6">
          <Card className="w-full max-w-lg">
            <CardHeader title="Awaiting access" />
            <CardBody className="flex flex-col gap-2 text-sm text-muted">
              <p>You&apos;re signed in, but your account doesn&apos;t have a role in Invento yet.</p>
              <p>
                Ask your System Administrator to assign your role on User Roles &amp; Access. Once
                they have, reload this page.
              </p>
            </CardBody>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar user={user} />
        <main className="flex-1 overflow-x-hidden p-6">
          {children}
          <PageFeedback currentUserId={user.id} />
        </main>
      </div>
    </div>
  );
}
