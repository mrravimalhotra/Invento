import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { BmrTable, type BmrRow } from "./bmr-table";

// Ravi (16 Sept 2026): "Now move the highlighted 'Batch Mfg. Record' to
// Admin page and rename this to 'Batch Mfg. Record- Deprecated' we will
// later remove this functionality. Make a note that this needs to be
// removed from app later. Do not touch functionality under 'Finished
// Product' screen."
//
// This is the real, DB-backed BMR module (bmr_records/bmr_weighment_lines/
// bmr_observations, Prepared/Checked/Approved sign-off) — previously at
// `/bmr`, Manufacturing group, nav module 10. It is NOT the same thing as
// the stateless .docx download on the Finished Product batch header card
// (that one stayed exactly where it is, untouched — see
// docs/modules/finished-product.md). Moved here to resolve the naming
// collision the two shared: rather than rename/relocate the FP-screen docx
// download again (Ravi reverted that the first time — see git history),
// Ravi chose to deprecate and relocate this module instead.
//
// TODO(remove-later): this whole route
// (app/(dashboard)/admin/bmr-deprecated/) and its nav entry
// (lib/constants/nav.ts) are slated for removal — tracked in the
// project's claude/open-requirements-log.md until then.
//
// Access, confirmed with Ravi via AskUserQuestion before building: this
// module was previously usable by System Admin, MFR Manager, Quality
// Checker, and QC Reviewer (`MODULE_WRITE_ROLES.bmr`, unchanged — it still
// documents the real RLS policy on bmr_records/etc., which was not
// touched). Ravi chose to additionally restrict the app-level UI/action
// gate to System Admin only here, matching /admin/purge-test-data's
// precedent for an Admin-only page — so every page and Server Action in
// this module now checks `system_admin` directly rather than the wider
// `canWrite(..., "bmr")` set every other screen in this module used
// before the move.
export default async function BmrListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const isSystemAdmin = user.roles.includes("system_admin");

  const { data } = await supabase
    .from("bmr_records")
    .select("id, prepared_at, checked_at, approved_at, finished_product_batches(batch_number)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as BmrRow[];

  return (
    <div>
      <PageHeader
        title="Batch Mfg. Record- Deprecated"
        description="One BMR per finished product batch — weighment lines, in-process observations, and Prepared / Checked / Approved sign-off."
        action={isSystemAdmin ? <LinkButton href="/admin/bmr-deprecated/new">New BMR</LinkButton> : undefined}
      />

      {!isSystemAdmin ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin access to use this page. Ask an existing System Admin if you need
            access.
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-bg px-4 py-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Deprecated. This module will be removed from the app entirely in a future update —
              relocated here and restricted to System Admin in the meantime.
            </p>
          </div>
          <Card>
            <BmrTable rows={rows} />
          </Card>
        </div>
      )}
    </div>
  );
}
