import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { PageFeedback } from "@/components/feedback/page-feedback";
import { PdfUserSetter } from "@/components/shell/pdf-user-setter";
import { CompanySetter } from "@/components/shell/company-setter";
import { createClient } from "@/lib/supabase/server";
import { fetchCompany, fetchIdleTimeoutMinutes } from "@/lib/company-server";
import { IdleSignOut } from "@/components/shell/idle-sign-out";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { FlashHost } from "@/components/ui/flash-host";
import { Suspense } from "react";

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
        <Topbar user={user} showMenu={false} />
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

  const supabase = await createClient();
  const [company, idleMinutes] = await Promise.all([fetchCompany(supabase), fetchIdleTimeoutMinutes(supabase)]);
  // SCAN-P1-02: automatic sign-out after inactivity; a System Admin is never signed out this way.
  const idleSignOut = idleMinutes > 0 && !user.roles.includes("system_admin");

  return (
    <div className="flex min-h-screen">
      {/* SCAN-P7-23: keyboard users can jump past the menu. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-brand"
      >
        Skip to main content
      </a>
      <Sidebar isSystemAdmin={user.roles.includes("system_admin")} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar user={user} />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden p-4 outline-none md:p-6">
          <Suspense fallback={null}>
            <FlashHost />
          </Suspense>
          {children}
          <PageFeedback currentUserId={user.id} />
          <PdfUserSetter name={user.fullName} />
          <CompanySetter company={company} />
          {idleSignOut && <IdleSignOut minutes={idleMinutes} />}
        </main>
      </div>
    </div>
  );
}
