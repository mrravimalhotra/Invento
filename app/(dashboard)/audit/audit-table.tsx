"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";
import {
  type AuditLogRow,
  tableLabel,
  recordLabel,
  summarizeChange,
  changedByLabel,
  changedViaLabel,
} from "./audit-diff";

export type { AuditLogRow };

export function AuditTable({ rows }: { rows: AuditLogRow[] }) {
  const columns: Column<AuditLogRow>[] = [
    { header: "When", accessor: (r) => formatDateTime(r.changed_at), searchValue: (r) => formatDateTime(r.changed_at) },
    { header: "Table", accessor: (r) => tableLabel(r.table_name), searchValue: (r) => tableLabel(r.table_name) },
    { header: "Record", accessor: (r) => recordLabel(r), searchValue: (r) => recordLabel(r) },
    {
      header: "Action",
      accessor: (r) => <Badge status={r.action}>{r.action}</Badge>,
      searchValue: (r) => r.action,
    },
    {
      header: "Changed By",
      accessor: (r) => changedByLabel(r),
      searchValue: (r) => changedByLabel(r),
    },
    // Where the change came from (0072_complete_audit_trail.sql): the Invento
    // app, a server-side job, Supabase Auth, or a direct database edit.
    {
      header: "Via",
      accessor: (r) => changedViaLabel(r.changed_via),
      searchValue: (r) => changedViaLabel(r.changed_via),
    },
    { header: "What changed", accessor: (r) => summarizeChange(r) },
    {
      header: "",
      accessor: (r) => (
        <Link href={`/audit/${r.id}`} className="text-sm text-brand hover:underline">
          View
        </Link>
      ),
    },
  ];

  // Only System Admin and Super Auditor can open this page (canReadAudit), so
  // the export is limited to them too.
  const exportConfig: TableExport<AuditLogRow> = {
    title: "Audit Log",
    filename: "audit-log",
    formats: ["excel"],
    columns: [
      { header: "When", type: "datetime", value: (r) => r.changed_at },
      { header: "Table", value: (r) => tableLabel(r.table_name) },
      { header: "Record", value: (r) => recordLabel(r) },
      { header: "Action", value: (r) => r.action },
      { header: "Changed By", value: (r) => changedByLabel(r) },
      { header: "Via", value: (r) => changedViaLabel(r.changed_via) },
      { header: "What changed", value: (r) => summarizeChange(r) },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyLabel="No audit history yet for this filter."
      searchPlaceholder="Search record, table, or changed by…"
      pageSize={25}
      exportConfig={exportConfig}
    />
  );
}
