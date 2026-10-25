import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canReadAudit } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { resolveAuditNames } from "@/lib/audit-names";
import {
  type AuditLogRow,
  tableLabel,
  recordLabel,
  diffFields,
  readableValue,
  friendlyFieldName,
  changedViaLabel,
  summarizeChange,
} from "../audit-diff";

export default async function AuditLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!canReadAudit(user.roles)) {
    return (
      <div>
        <PageHeader title="Audit Log" />
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin or Super Auditor access to view the audit log.
          </CardBody>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("audit_log")
    .select("id, table_name, row_id, action, old_data, new_data, changed_by, changed_at, changed_via")
    .eq("id", id)
    .maybeSingle<Omit<AuditLogRow, "changed_by_name"> & { changed_by: string | null }>();

  if (!row) notFound();

  // SCAN-P8-12: people, items, vendors, batches, recipes and item types shown by name, not id.
  const names = await resolveAuditNames(supabase, [row]);
  const changedByName: string | null = row.changed_by ? (names[row.changed_by] ?? null) : null;

  const changes = diffFields(row);

  return (
    <div>
      <PageHeader back={{ href: "/audit", label: "Audit Log" }}
        title={`${tableLabel(row.table_name)} · ${recordLabel(row)}`}
        description={`Change recorded ${formatDateTime(row.changed_at)}${changedByName ? ` by ${changedByName}` : ""}${row.changed_via ? ` via ${changedViaLabel(row.changed_via)}` : ""}.`}
      />

      <Card className="mb-4">
        <CardHeader title="Summary" />
        <CardBody className="flex flex-wrap items-center gap-3 text-sm">
          <Badge status={row.action}>{row.action}</Badge>
          <span className="text-muted">Table: {tableLabel(row.table_name)}</span>
          <span className="text-muted">Record ID: {row.row_id}</span>
          <span className="text-muted">Via: {changedViaLabel(row.changed_via)}</span>
          <span className="text-muted">{summarizeChange(row)}</span>
        </CardBody>
      </Card>

      {row.action === "truncate" ? (
        <Card className="mb-4">
          <CardHeader title="Whole table emptied" />
          <CardBody className="text-sm text-muted">
            Every row in this table was removed in one statement (TRUNCATE). Individual rows are not
            listed for this kind of change.
          </CardBody>
        </Card>
      ) : row.action === "update" ? (
        <Card className="mb-4">
          <CardHeader title={`Fields changed (${changes.length})`} />
          {changes.length === 0 ? (
            <CardBody className="text-sm text-muted">
              This update didn&apos;t change any tracked field values (e.g. only updated_at moved).
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="px-5 py-2 font-medium">Field</th>
                    <th scope="col" className="px-5 py-2 font-medium">Before</th>
                    <th scope="col" className="px-5 py-2 font-medium">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {changes.map((c) => (
                    <tr key={c.key}>
                      <td className="px-5 py-2 text-muted" title={c.key}>{friendlyFieldName(c.key)}</td>
                      <td className="px-5 py-2">{readableValue(c.oldValue, names)}</td>
                      <td className="px-5 py-2 font-medium">{readableValue(c.newValue, names)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-4">
          <CardHeader title={row.action === "insert" ? "Record as created" : "Record as it was before deletion"} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {Object.entries((row.action === "insert" ? row.new_data : row.old_data) ?? {}).map(([key, value]) => (
                  <tr key={key}>
                    <td className="px-5 py-2 text-muted" title={key}>{friendlyFieldName(key)}</td>
                    <td className="px-5 py-2">{readableValue(value, names)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Raw snapshot" />
        <CardBody className="flex flex-col gap-3">
          {row.old_data && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-foreground">Before (raw JSON)</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-black/5 p-3 text-xs">
                {JSON.stringify(row.old_data, null, 2)}
              </pre>
            </details>
          )}
          {row.new_data && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-foreground">After (raw JSON)</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-black/5 p-3 text-xs">
                {JSON.stringify(row.new_data, null, 2)}
              </pre>
            </details>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
