import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canReadAudit } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { AuditFilters } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { AuditExportAll } from "./audit-export-all";
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_TABLE_OPTIONS,
  beforeAfterText,
  type AuditLogRow,
} from "./audit-diff";
import { friendlyDbError } from "@/lib/db-errors";
import { resolveAuditNames } from "@/lib/audit-names";
import { AUDIT_PAGE_SIZE, auditQuery, cleanRecordText, isUuid, type AuditFilter } from "@/lib/audit-query";

// SCAN-P1-15: the log is read one page of AUDIT_PAGE_SIZE changes at a time (newest first) with
// filters for table, action, person, record and dates; "Download all matching" exports the whole
// filtered set, not only the page on screen.

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type Params = { table?: string; from?: string; to?: string; user?: string; action?: string; record?: string; page?: string };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const filter: AuditFilter = {
    table: AUDIT_TABLE_OPTIONS.some((o) => o.value === params.table) ? (params.table as string) : "",
    from: isValidDate(params.from) ? params.from : "",
    to: isValidDate(params.to) ? params.to : "",
    user: isUuid(params.user) ? params.user : "",
    action: AUDIT_ACTION_OPTIONS.some((o) => o.value === params.action) ? (params.action as string) : "",
    record: cleanRecordText(params.record ?? ""),
  };
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.page ?? "1", 10) || 1));

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canRead = canReadAudit(user.roles);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Who changed what, when, and from where — every insert, edit and delete across all Invento records (masters, purchasing, QC, production, packaging, finished products, stock corrections, user roles and accounts). Entries cannot be edited or deleted. Restricted to System Admin and Super Auditor."
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
        <AuditLogList filter={filter} page={page} />
      )}
    </div>
  );
}

function pageHref(filter: AuditFilter, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/audit?${s}` : "/audit";
}

async function AuditLogList({ filter, page }: { filter: AuditFilter; page: number }) {
  const supabase = await createClient();
  const offset = (page - 1) * AUDIT_PAGE_SIZE;

  type RawRow = Omit<AuditLogRow, "changed_by_name"> & { changed_by: string | null };
  const [{ data, error, count }, { data: allProfiles }] = await Promise.all([
    auditQuery(supabase, filter, true)
      .range(offset, offset + AUDIT_PAGE_SIZE - 1)
      .returns<RawRow[]>(),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const rawRows = data ?? [];
  const names = await resolveAuditNames(supabase, rawRows);

  const rows: AuditLogRow[] = rawRows.map((r) => {
    const text = beforeAfterText(r, names);
    return {
      ...r,
      changed_by_name: r.changed_by ? (names[r.changed_by] ?? null) : null,
      before_text: text.before,
      after_text: text.after,
    };
  });

  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const users = (allProfiles ?? [])
    .filter((p): p is { id: string; full_name: string } => !!p.full_name)
    .map((p) => ({ id: p.id, name: p.full_name }));

  return (
    <Card>
      <AuditFilters {...filter} users={users} />
      {error && <p className="p-4 text-sm text-red">{friendlyDbError(error, "Couldn't load this list.")}</p>}
      <AuditTable rows={rows} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted">
        <span>
          {total.toLocaleString("en-IN")} {total === 1 ? "change" : "changes"} match
          {pageCount > 1 ? ` · showing ${(offset + 1).toLocaleString("en-IN")} to ${(offset + rows.length).toLocaleString("en-IN")} (page ${page} of ${pageCount.toLocaleString("en-IN")})` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <Link href={pageHref(filter, page - 1)} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-black/5 max-md:min-h-10 max-md:py-2.5">
              Newer
            </Link>
          )}
          {page < pageCount && (
            <Link href={pageHref(filter, page + 1)} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-black/5 max-md:min-h-10 max-md:py-2.5">
              Older
            </Link>
          )}
          <AuditExportAll filter={filter} disabled={total === 0} />
        </div>
      </div>
    </Card>
  );
}
