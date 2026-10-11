"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { cn, formatDate, formatQty, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

import type { AgeingBucket } from "@/lib/ageing";

export type AgeingRow = {
  key: string;
  kind: "raw" | "production_raw" | "fp";
  itemId: string | null;
  itemCode: string;
  itemName: string;
  batch: string;
  unit: string;
  remaining: number | null;
  arNumber: string | null;
  retestDate: string | null;
  expiryDate: string | null;
  isLegacy: boolean;
  bucket: AgeingBucket;
  days: number;
  due: "Retest" | "Expiry";
  dueDate: string;
};

const BUCKETS: { value: AgeingBucket; label: string; status: string }[] = [
  { value: "expired", label: "Expired", status: "expired" },
  { value: "retest_overdue", label: "Retest overdue", status: "awaiting_retest" },
  { value: "d30", label: "Within 30 days", status: "pending" },
  { value: "d60", label: "31 to 60 days", status: "pending" },
  { value: "d90", label: "61 to 90 days", status: "pending" },
  { value: "later", label: "Over 90 days", status: "approved" },
];

const KIND_LABEL: Record<AgeingRow["kind"], string> = {
  raw: "Raw material",
  production_raw: "Raw material (from production)",
  fp: "Finished product",
};

function whenText(r: AgeingRow) {
  if (r.days < 0) return `${Math.abs(r.days)} day${Math.abs(r.days) === 1 ? "" : "s"} ago`;
  if (r.days === 0) return "today";
  return `in ${r.days} day${r.days === 1 ? "" : "s"}`;
}

export function AgeingView({ rows, initialBucket }: { rows: AgeingRow[]; initialBucket?: string }) {
  const [bucket, setBucket] = useState<AgeingBucket | "all">(
    BUCKETS.some((b) => b.value === initialBucket) ? (initialBucket as AgeingBucket) : "all"
  );

  const counts = useMemo(() => {
    const c = new Map<AgeingBucket, number>();
    for (const r of rows) c.set(r.bucket, (c.get(r.bucket) ?? 0) + 1);
    return c;
  }, [rows]);
  const shown = bucket === "all" ? rows : rows.filter((r) => r.bucket === bucket);

  const columns: Column<AgeingRow>[] = [
    {
      header: "Type",
      accessor: (r) => <span className="text-xs">{KIND_LABEL[r.kind]}</span>,
      searchValue: (r) => KIND_LABEL[r.kind],
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
    { header: "AR No.", accessor: (r) => r.arNumber ?? "—", searchValue: (r) => r.arNumber ?? "" },
    {
      header: "In stock",
      accessor: (r) => (r.remaining === null ? "—" : <span className="whitespace-nowrap">{formatQty(r.remaining)} {r.unit}</span>),
      sortValue: (r) => r.remaining ?? 0,
    },
    {
      header: "Retest date",
      accessor: (r) => (r.retestDate ? <span className="whitespace-nowrap">{formatDate(r.retestDate)}</span> : "—"),
      sortValue: (r) => r.retestDate ?? "9999-12-31",
    },
    {
      header: "Expiry date",
      accessor: (r) => (r.expiryDate ? <span className="whitespace-nowrap">{formatDate(r.expiryDate)}</span> : "—"),
      sortValue: (r) => r.expiryDate ?? "9999-12-31",
    },
    {
      header: "Next",
      accessor: (r) => (
        <span className="whitespace-nowrap text-xs">
          {r.due} {whenText(r)}
        </span>
      ),
      sortValue: (r) => r.dueDate,
    },
    {
      header: "Ageing",
      accessor: (r) => {
        const b = BUCKETS.find((x) => x.value === r.bucket)!;
        return <Badge status={b.status}>{b.label}</Badge>;
      },
      searchValue: (r) => BUCKETS.find((x) => x.value === r.bucket)!.label,
      sortValue: (r) => r.dueDate,
    },
  ];

  const exportConfig: TableExport<AgeingRow> = {
    title: "Expiry and Retest Ageing",
    filename: "expiry-retest-ageing",
    formats: ["excel", "pdf"],
    note: bucket === "all" ? undefined : `Showing: ${BUCKETS.find((b) => b.value === bucket)?.label}`,
    columns: [
      { header: "Type", value: (r) => KIND_LABEL[r.kind] },
      { header: "Item code", value: (r) => r.itemCode },
      { header: "Item", value: (r) => r.itemName },
      { header: "Batch", value: (r) => r.batch },
      { header: "AR No.", value: (r) => r.arNumber },
      { header: "In stock", type: "number", decimals: 3, value: (r) => r.remaining },
      { header: "Unit", value: (r) => r.unit },
      { header: "Retest date", type: "date", value: (r) => r.retestDate },
      { header: "Expiry date", type: "date", value: (r) => r.expiryDate },
      { header: "Next", value: (r) => `${r.due} ${whenText(r)}` },
      { header: "Ageing", value: (r) => BUCKETS.find((b) => b.value === r.bucket)!.label },
      { header: "Source", value: (r) => (r.isLegacy ? "Legacy" : "New") },
    ],
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-border p-4">
        <button
          type="button"
          onClick={() => setBucket("all")}
          className={cn(
            "rounded-md border px-3 py-1.5 text-left text-sm",
            bucket === "all" ? "border-brand bg-brand-light text-brand-dark" : "border-border hover:bg-black/[0.03]"
          )}
        >
          <div className="text-xs text-muted">All</div>
          <div className="font-semibold">{rows.length}</div>
        </button>
        {BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => setBucket(b.value)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-left text-sm",
              bucket === b.value ? "border-brand bg-brand-light text-brand-dark" : "border-border hover:bg-black/[0.03]"
            )}
          >
            <div className="text-xs text-muted">{b.label}</div>
            <div className="font-semibold">{counts.get(b.value) ?? 0}</div>
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={shown}
        searchPlaceholder="Search item, batch, AR number, type…"
        emptyLabel="No batches in this group."
        pageSize={20}
        isOpeningStock={(r) => r.isLegacy}
        isLegacy={(r) => isLegacyCode(r.itemCode) || isLegacyCode(r.batch)}
        exportConfig={exportConfig}
      />
    </div>
  );
}
