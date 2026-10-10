"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { formatDate, formatQty, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type SampleRow = {
  key: string;
  kind: "raw" | "production_raw" | "fp";
  itemId: string | null;
  itemCode: string;
  itemName: string;
  batch: string;
  unit: string;
  qc: number;
  stability: number;
  rnd: number;
  stabilityLeft: number | null;
  qcStatus: string | null;
  arNumber: string | null;
  expiryDate: string | null;
  takenAt: string | null;
  isLegacy: boolean;
};

const KIND_LABEL: Record<SampleRow["kind"], string> = {
  raw: "Raw material",
  production_raw: "Raw material (from production)",
  fp: "Finished product",
};

const statusText = (s: string | null) => (s ? s.replace(/_/g, " ") : "");
const qty = (v: number, unit: string) => (v === 0 ? <span className="text-muted">—</span> : <span className="whitespace-nowrap">{formatQty(v)} {unit}</span>);

export function SamplesTable({ rows }: { rows: SampleRow[] }) {
  const columns: Column<SampleRow>[] = [
    { header: "Type", accessor: (r) => <span className="text-xs">{KIND_LABEL[r.kind]}</span>, searchValue: (r) => KIND_LABEL[r.kind] },
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
    { header: "AR No.", accessor: (r) => r.arNumber ?? "—", searchValue: (r) => r.arNumber ?? "" },
    {
      header: "QC status",
      accessor: (r) => (r.qcStatus ? <Badge status={r.qcStatus}>{statusText(r.qcStatus)}</Badge> : "—"),
      searchValue: (r) => statusText(r.qcStatus),
    },
    { header: "QC sample", accessor: (r) => qty(r.qc, r.unit), sortValue: (r) => r.qc },
    { header: "Stability sample", accessor: (r) => qty(r.stability, r.unit), sortValue: (r) => r.stability },
    { header: "R&D sample", accessor: (r) => qty(r.rnd, r.unit), sortValue: (r) => r.rnd },
    {
      header: "Stability left",
      accessor: (r) => (r.stabilityLeft === null ? "—" : qty(r.stabilityLeft, r.unit)),
      sortValue: (r) => r.stabilityLeft ?? -1,
    },
    {
      header: "Expiry date",
      accessor: (r) => (r.expiryDate ? <span className="whitespace-nowrap">{formatDate(r.expiryDate)}</span> : "—"),
      sortValue: (r) => r.expiryDate ?? "9999-12-31",
    },
    {
      header: "Taken on",
      accessor: (r) => (r.takenAt ? <span className="whitespace-nowrap">{formatDate(r.takenAt)}</span> : "—"),
      sortValue: (r) => r.takenAt ?? "",
    },
  ];

  const exportConfig: TableExport<SampleRow> = {
    title: "Retained Samples",
    filename: "retained-samples",
    formats: ["excel", "pdf"],
    columns: [
      { header: "Type", value: (r) => KIND_LABEL[r.kind] },
      { header: "Item code", value: (r) => r.itemCode },
      { header: "Item", value: (r) => r.itemName },
      { header: "Batch", value: (r) => r.batch },
      { header: "AR No.", value: (r) => r.arNumber },
      { header: "QC status", value: (r) => statusText(r.qcStatus) },
      { header: "QC sample", type: "number", decimals: 3, value: (r) => r.qc },
      { header: "Stability sample", type: "number", decimals: 3, value: (r) => r.stability },
      { header: "R&D sample", type: "number", decimals: 3, value: (r) => r.rnd },
      { header: "Stability left", type: "number", decimals: 3, value: (r) => r.stabilityLeft },
      { header: "Unit", value: (r) => r.unit },
      { header: "Expiry date", type: "date", value: (r) => r.expiryDate },
      { header: "Taken on", type: "date", value: (r) => r.takenAt },
      { header: "Source", value: (r) => (r.isLegacy ? "Legacy" : "New") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item, batch, AR number, type, status…"
      emptyLabel="No samples recorded."
      pageSize={20}
      isOpeningStock={(r) => r.isLegacy}
      isLegacy={(r) => isLegacyCode(r.itemCode) || isLegacyCode(r.batch)}
      exportConfig={exportConfig}
    />
  );
}
