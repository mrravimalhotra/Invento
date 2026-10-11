"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canReadAudit } from "@/lib/constants/roles";
import { friendlyDbError } from "@/lib/db-errors";
import { resolveAuditNames } from "@/lib/audit-names";
import { AUDIT_EXPORT_LIMIT, auditQuery, cleanRecordText, isUuid, type AuditFilter } from "@/lib/audit-query";
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_TABLE_OPTIONS,
  beforeAfterText,
  changedByLabel,
  changedViaLabel,
  recordLabel,
  summarizeChange,
  tableLabel,
  type AuditLogRow,
} from "@/app/(dashboard)/audit/audit-diff";

// SCAN-P1-15: every audit change that matches the filters, as plain text rows for the Excel file.
// Reads at most AUDIT_EXPORT_LIMIT of the newest changes and says so when there were more.

type ExportRow = {
  when: string;
  table: string;
  record: string;
  action: string;
  by: string;
  via: string;
  summary: string;
  before: string;
  after: string;
};
type Result = { rows: ExportRow[]; truncated: boolean; filterText: string; error?: string };

const PAGE = 1000;

export async function loadAuditExport(input: AuditFilter): Promise<Result> {
  const empty: Result = { rows: [], truncated: false, filterText: "" };
  const user = await getCurrentUser();
  if (!user || !canReadAudit(user.roles)) return { ...empty, error: "Not authorized." };

  // Re-check every filter value; never trust what the browser sent.
  const filter: AuditFilter = {
    table: AUDIT_TABLE_OPTIONS.some((o) => o.value === input.table) ? input.table : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(input.from ?? "") ? input.from : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(input.to ?? "") ? input.to : "",
    user: isUuid(input.user) ? input.user : "",
    action: AUDIT_ACTION_OPTIONS.some((o) => o.value === input.action) ? input.action : "",
    record: cleanRecordText(input.record ?? ""),
  };

  const supabase = await createClient();
  type RawRow = Omit<AuditLogRow, "changed_by_name"> & { changed_by: string | null };
  const raw: RawRow[] = [];
  let truncated = false;
  for (let offset = 0; offset < AUDIT_EXPORT_LIMIT; offset += PAGE) {
    const { data, error } = await auditQuery(supabase, filter, false)
      .range(offset, offset + PAGE - 1)
      .returns<RawRow[]>();
    if (error) return { ...empty, error: friendlyDbError(error, "Couldn't load the audit log.") };
    raw.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
    if (offset + PAGE >= AUDIT_EXPORT_LIMIT) truncated = true;
  }

  const names = await resolveAuditNames(supabase, raw);
  const rows: ExportRow[] = raw.map((r) => {
    const text = beforeAfterText(r, names);
    const byName = r.changed_by ? (names[r.changed_by] ?? null) : null;
    return {
      when: r.changed_at,
      table: tableLabel(r.table_name),
      record: recordLabel(r),
      action: r.action,
      by: changedByLabel({ changed_by_name: byName, changed_via: r.changed_via }),
      via: changedViaLabel(r.changed_via),
      summary: summarizeChange(r),
      before: text.before,
      after: text.after,
    };
  });

  const parts: string[] = [];
  if (filter.table) parts.push(`Table: ${tableLabel(filter.table)}`);
  if (filter.action) parts.push(`Action: ${AUDIT_ACTION_OPTIONS.find((o) => o.value === filter.action)?.label}`);
  if (filter.user) parts.push(`Changed by: ${names[filter.user] ?? filter.user}`);
  if (filter.record) parts.push(`Record: ${filter.record}`);
  if (filter.from) parts.push(`From ${filter.from}`);
  if (filter.to) parts.push(`To ${filter.to}`);
  return { rows, truncated, filterText: parts.length ? parts.join(" · ") : "No filter (all changes)" };
}
