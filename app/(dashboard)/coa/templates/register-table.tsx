"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDateTime, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type RegisterRow = {
  subject_type: "raw_material" | "finished_product";
  subject_id: string;
  code: string;
  name: string;
  item_type: string | null;
  active: boolean;
  template_id: string | null;
  tests: number;
  revisions: number;
  last_changed_at: string | null;
  last_changed_by_name: string | null;
};

const TYPE_LABEL = { raw_material: "Raw material", finished_product: "Finished product" } as const;

function subjectHref(r: RegisterRow) {
  return r.subject_type === "raw_material" ? `/items/${r.subject_id}` : `/mfr/${r.subject_id}`;
}

export function RegisterTable({ rows }: { rows: RegisterRow[] }) {
  const columns: Column<RegisterRow>[] = [
    { header: "Type", accessor: (r) => TYPE_LABEL[r.subject_type], searchValue: (r) => TYPE_LABEL[r.subject_type] },
    {
      header: "Code",
      accessor: (r) => (
        <Link href={subjectHref(r)} className="font-medium text-brand hover:underline">
          {r.code}
        </Link>
      ),
      searchValue: (r) => r.code,
    },
    { header: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
    { header: "Item type", accessor: (r) => r.item_type ?? "—" },
    {
      header: "Template",
      accessor: (r) =>
        r.template_id ? <Badge status="approved">Defined</Badge> : <Badge status="rejected">Missing</Badge>,
    },
    { header: "Tests", accessor: (r) => (r.template_id ? r.tests : "—") },
    { header: "Changes", accessor: (r) => (r.template_id ? r.revisions : "—") },
    {
      header: "Last changed",
      accessor: (r) =>
        r.last_changed_at ? (
          <span>
            {formatDateTime(r.last_changed_at)}
            {r.last_changed_by_name ? <span className="text-muted"> · {r.last_changed_by_name}</span> : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      header: "",
      accessor: (r) => (
        <span className="flex gap-3 whitespace-nowrap">
          <Link href={subjectHref(r)} className="text-brand hover:underline">
            {r.template_id ? "Edit" : "Add"}
          </Link>
          {r.template_id && (
            <Link href={`/coa/templates/${r.template_id}`} className="text-brand hover:underline">
              History
            </Link>
          )}
        </span>
      ),
    },
  ];

  const exportConfig: TableExport<RegisterRow> = {
    title: "COA Template Register",
    filename: "coa-template-register",
    formats: ["pdf", "excel"],
    columns: [
      { header: "Type", value: (r) => TYPE_LABEL[r.subject_type] },
      { header: "Code", value: (r) => r.code },
      { header: "Name", value: (r) => r.name },
      { header: "Item type", value: (r) => r.item_type ?? "" },
      { header: "Template", value: (r) => (r.template_id ? "Defined" : "Missing") },
      { header: "Tests", value: (r) => (r.template_id ? r.tests : "") },
      { header: "Changes", value: (r) => (r.template_id ? r.revisions : "") },
      { header: "Last changed", value: (r) => (r.last_changed_at ? formatDateTime(r.last_changed_at) : "") },
      { header: "Changed by", value: (r) => r.last_changed_by_name ?? "" },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search code or name…"
      emptyLabel="Nothing to show for this filter."
      isLegacy={(r) => isLegacyCode(r.code)}
      exportConfig={exportConfig}
    />
  );
}
