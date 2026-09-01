import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { LineClearanceTable, type LineClearanceRow } from "./line-clearance-table";

export default async function LineClearancePage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data } = await supabase
    .from("line_clearance_checks")
    .select("id, area, batch_reference, status, checked_at")
    .order("checked_at", { ascending: false });

  const rows: LineClearanceRow[] = data ?? [];
  const canCreate = canWrite(user?.roles ?? [], "line_clearance");

  return (
    <div>
      <PageHeader
        title="Line Clearance"
        description="Before-batch clearance checks for production areas — confirms a line is clean and free of the previous batch before a new one starts."
        action={canCreate ? <LinkButton href="/line-clearance/new">New check</LinkButton> : undefined}
      />
      {created === "1" && (
        <p className="mb-4 rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          New check has been successfully added.
        </p>
      )}
      <Card>
        <LineClearanceTable rows={rows} />
      </Card>
    </div>
  );
}
