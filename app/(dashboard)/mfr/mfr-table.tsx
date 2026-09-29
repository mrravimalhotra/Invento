"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, isLegacyCode, formatQty } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type MfrRow = {
  id: string;
  code: string;
  name: string;
  version: number;
  batch_size_qty: string | number;
  batch_size_unit: string;
  approved_by: string | null;
  approved_at: string | null;
  active: boolean;
  items: { id: string; item_code: string; item_types: { description: string } | null } | null;
};

export function MfrTable({ rows }: { rows: MfrRow[] }) {
  const columns: Column<MfrRow>[] = [
    {
      header: "Code",
      accessor: (r) => (
        <Link href={`/mfr/${r.id}`} className="font-medium text-brand hover:underline">
          {r.code}
        </Link>
      ),
      searchValue: (r) => r.code,
    },
    { header: "Name", accessor: (r) => r.name, searchValue: (r) => r.name },
    { header: "Version", accessor: (r) => `v${r.version}` },
    {
      header: "Finished product",
      accessor: (r) =>
        r.items ? (
          <Link href={`/items/${r.items.id}`} className="text-brand hover:underline">
            {r.items.item_code}
          </Link>
        ) : (
          "—"
        ),
      searchValue: (r) => r.items?.item_code ?? "",
    },
    { header: "Item type", accessor: (r) => r.items?.item_types?.description ?? "—" },
    { header: "Batch size", accessor: (r) => `${formatQty(r.batch_size_qty)} ${r.batch_size_unit}` },
    {
      header: "Approval",
      accessor: (r) =>
        r.approved_by ? (
          <Badge status="approved">Approved · {formatDate(r.approved_at)}</Badge>
        ) : (
          <Badge status="not_submitted">Not approved</Badge>
        ),
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.active ? "approved" : "not_submitted"}>{r.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  const exportConfig: TableExport<MfrRow> = {
    title: "Master Formula Records",
    filename: "mfr-list",
    formats: ["pdf"],
    columns: [
      { header: "Code", value: (r) => r.code },
      { header: "Name", value: (r) => r.name },
      { header: "Version", value: (r) => `v${r.version}` },
      { header: "Finished product", value: (r) => r.items?.item_code ?? "" },
      { header: "Item type", value: (r) => r.items?.item_types?.description ?? "" },
      { header: "Batch size", value: (r) => `${formatQty(r.batch_size_qty)} ${r.batch_size_unit}` },
      { header: "Approval", value: (r) => (r.approved_by ? `Approved ${formatDate(r.approved_at)}` : "Not approved") },
      { header: "Status", value: (r) => (r.active ? "Active" : "Inactive") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search MFR code or name…"
      emptyLabel="No MFR definitions yet."
      isLegacy={(r) => isLegacyCode(r.code)}
      exportConfig={exportConfig}
    />
  );
}
