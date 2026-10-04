"use client";

import Link from "next/link";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatQty, formatDate, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type RejectedKind = "raw" | "production_raw" | "finished";

export const REJECTED_KIND_LABELS: Record<RejectedKind, string> = {
  raw: "Raw Material",
  production_raw: "Raw Material (from production)",
  finished: "Finished Product",
};

export type RejectedRow = {
  key: string;
  kind: RejectedKind;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  batch: string;
  isLegacy: boolean;
  arNumber: string | null;
  rejectedAt: string | null;
  // Received quantity (raw material) or batch yield (finished product).
  totalQty: number;
  qcQty: number;
  stabilityQty: number;
  rndQty: number;
  // What is still held in the batch (the rejected quantity).
  heldQty: number;
  unit: string;
};

export function RejectedTable({ rows }: { rows: RejectedRow[] }) {
  const columns: Column<RejectedRow>[] = [
    {
      header: "Type",
      accessor: (r) => <span className="text-xs">{REJECTED_KIND_LABELS[r.kind]}</span>,
      searchValue: (r) => REJECTED_KIND_LABELS[r.kind],
    },
    {
      header: "Item",
      accessor: (r) => {
        const body = (
          <>
            <div className="font-medium">{r.itemName}</div>
            <div className="text-xs text-muted">{r.itemCode}</div>
          </>
        );
        return r.itemId ? (
          <Link href={`/inventory/items/${r.itemId}`} className="block hover:underline">
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        );
      },
      searchValue: (r) => `${r.itemName} ${r.itemCode}`,
    },
    {
      header: "Batch",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {r.batch}
          <LegacyTag show={r.isLegacy} />
        </span>
      ),
      searchValue: (r) => r.batch,
    },
    {
      header: "AR No.",
      accessor: (r) => r.arNumber ?? "—",
      searchValue: (r) => r.arNumber ?? "",
    },
    {
      header: "Rejected on",
      accessor: (r) => (r.rejectedAt ? <span className="whitespace-nowrap">{formatDate(r.rejectedAt)}</span> : "—"),
      sortValue: (r) => r.rejectedAt ?? "",
    },
    {
      header: "Batch quantity",
      accessor: (r) => <span className="whitespace-nowrap">{formatQty(r.totalQty)} {r.unit}</span>,
      sortValue: (r) => r.totalQty,
    },
    {
      header: "Samples",
      accessor: (r) => (
        <span className="whitespace-nowrap text-xs text-muted">
          QC {formatQty(r.qcQty)} · Stability {formatQty(r.stabilityQty)} · R&amp;D {formatQty(r.rndQty)}
        </span>
      ),
    },
    {
      header: "Rejected quantity",
      accessor: (r) => (
        <span className="whitespace-nowrap font-medium">
          {formatQty(r.heldQty)} {r.unit}
        </span>
      ),
      sortValue: (r) => r.heldQty,
    },
    {
      header: "Status",
      accessor: () => <Badge status="rejected">Rejected</Badge>,
    },
  ];

  const exportConfig: TableExport<RejectedRow> = {
    title: "Rejected Materials",
    filename: "rejected-materials",
    formats: ["excel", "pdf"],
    columns: [
      { header: "Type", value: (r) => REJECTED_KIND_LABELS[r.kind] },
      { header: "Item code", value: (r) => r.itemCode },
      { header: "Item", value: (r) => r.itemName },
      { header: "Batch", value: (r) => r.batch },
      { header: "AR No.", value: (r) => r.arNumber ?? "" },
      { header: "Rejected on", type: "date", value: (r) => r.rejectedAt },
      { header: "Batch quantity", type: "number", decimals: 3, value: (r) => r.totalQty },
      { header: "QC sample", type: "number", decimals: 3, value: (r) => r.qcQty },
      { header: "Stability sample", type: "number", decimals: 3, value: (r) => r.stabilityQty },
      { header: "R&D sample", type: "number", decimals: 3, value: (r) => r.rndQty },
      { header: "Rejected quantity", type: "number", decimals: 3, value: (r) => r.heldQty },
      { header: "Unit", value: (r) => r.unit },
      { header: "Source", value: (r) => (r.isLegacy ? "Legacy" : "New") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item, batch, AR number, type…"
      emptyLabel="No rejected batches."
      pageSize={20}
      isOpeningStock={(r) => r.isLegacy}
      isLegacy={(r) => isLegacyCode(r.itemCode) || isLegacyCode(r.batch)}
      exportConfig={exportConfig}
    />
  );
}
