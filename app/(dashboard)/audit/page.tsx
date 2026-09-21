import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canReadAudit } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { AuditFilters } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { AUDIT_TABLE_OPTIONS, type AuditLogRow } from "./audit-diff";

// Same row-cap-and-say-so pattern as the QC list (QC_LIMIT) and Inventory
// Ledger (LEDGER_LIMIT) — most-recent-first with a server-side filter to
// fall back on, rather than an unbounded fetch.
const AUDIT_LIMIT = 500;

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const table = AUDIT_TABLE_OPTIONS.some((o) => o.value === params.table) ? (params.table as string) : "";
  const from = isValidDate(params.from) ? params.from : "";
  const to = isValidDate(params.to) ? params.to : "";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canRead = canReadAudit(user.roles);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Who changed what, and when — status and approval history for QC decisions, Finished Product batches, Purchase Orders, and MFR definitions. Restricted to System Admin and Super Auditor."
      />

      {!canRead ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin or Super Auditor access to view the audit log. Ask an existing
            System Admin to grant it to you.
          </CardBody>
        </Card>
      ) : (
        <AuditLogList table={table} from={from} to={to} />
      )}
    </div>
  );
}

async function AuditLogList({ table, from, to }: { table: string; from: string; to: string }) {
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, table_name, row_id, action, old_data, new_data, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(AUDIT_LIMIT);
  if (table) query = query.eq("table_name", table);
  if (from) query = query.gte("changed_at", `${from}T00:00:00`);
  if (to) query = query.lte("changed_at", `${to}T23:59:59.999`);

  type RawRow = Omit<AuditLogRow, "changed_by_name"> & { changed_by: string | null };
  const { data, error } = await query.returns<RawRow[]>();
  const rawRows = data ?? [];

  const changedByIds = [...new Set(rawRows.map((r) => r.changed_by).filter((id): id is string => !!id))];
  const { data: profiles } = changedByIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", changedByIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const rows: AuditLogRow[] = rawRows.map((r) => ({
    ...r,
    changed_by_name: r.changed_by ? (nameById.get(r.changed_by) ?? null) : null,
  }));

  return (
    <Card>
      <AuditFilters table={table} from={from} to={to} />
      {error && <p className="p-4 text-sm text-red">{error.message}</p>}
      <AuditTable rows={rows} />
      {rows.length === AUDIT_LIMIT && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Showing the most recent {AUDIT_LIMIT.toLocaleString("en-IN")} changes for this filter.
          Narrow the date range to see further back.
        </p>
      )}
    </Card>
  );
}
