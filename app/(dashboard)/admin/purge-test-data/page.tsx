import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { PurgeTestDataForm } from "./purge-form";

// Ravi (13 Sept 2026): "Create an admin controlled button to Purge all
// inventory/purchase related data except authentication and similar
// records so i can do testing from scratch without any historical
// records" — for end-to-end testing of the bulk-upload feature. Scoping
// and the full list of what's wiped vs. kept lives in
// supabase/migrations/0039_purge_test_data.sql; this page is
// deliberately System Admin-only (not the wider canWrite() set every
// other bulk-upload/module screen uses) — this is a materially bigger
// action than anything else in the app.
export default async function PurgeTestDataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isSystemAdmin = user.roles.includes("system_admin");

  return (
    <div>
      <PageHeader
        title="Purge Test Data"
        description="Wipe every item, vendor, purchase, QC, production, and inventory record in the app for a clean testing slate — keeps your account, user roles, and Tester Feedback tickets."
      />

      {!isSystemAdmin ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin access to purge data. Ask an existing System Admin, or use the
            User Roles screen if you already have that access on another account.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-bg px-4 py-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Take a backup before using this if there&apos;s anything you might still need — see{" "}
              <code className="font-mono">backup-before-purge-2026-09-13.sql</code> in the project
              notes for a ready-to-run Supabase backup script. This button has no undo inside the
              app.
            </p>
          </div>

          <Card>
            <CardHeader title="Purge everything except your account" />
            <CardBody>
              <PurgeTestDataForm />
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
