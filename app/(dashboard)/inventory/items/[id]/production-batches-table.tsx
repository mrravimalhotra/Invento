"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";
import { BATCH_QC_LABELS, computeBatchQcState } from "@/lib/batch-qc-status";
import { ProductionRmIntimationLink } from "./production-rm-intimation-link";

// Production-sourced Raw Material batches (Ravi, 19 Sept 2026 —
// "Packaging issued to Production"; supabase/migrations/
// 0050_production_rm_from_packaging.sql). A Raw Material item created this
// way (e.g. RM-FP-00001, paired to a Finished Product via
// items.production_rm_item_id) is never purchased, so it never shows up
// in PurchaseBatchesTable — this is its equivalent "batch" listing,
// sourced from production_issue_batches instead of purchase_lines.
//
// FB-0043 (28 Sept 2026): these batches now carry real QC state of their
// own — the original "the FP batch's own QC approval already covers this"
// decision was superseded ("it should be treated as new Raw material...
// should again go for QC process"). QC status / sample split / RM
// Intimation link below mirror PurchaseBatchesTable's own equivalent
// columns exactly.
export type ProductionBatchRow = {
  id: string;
  batch_number: string;
  quantity: string | number;
  live_remaining_qty: string | number;
  unit: string;
  qc_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
  created_at: string;
  qc_status?: string | null;
  retest_date?: string | null;
  packaging_issues: { code: string; created_at: string } | null;
};

export function ProductionBatchesTable({
  rows,
  itemName,
  itemCode,
}: {
  rows: ProductionBatchRow[];
  itemName: string;
  itemCode: string;
}) {
  const columns: Column<ProductionBatchRow>[] = [
    { header: "Batch", accessor: (r) => r.batch_number, searchValue: (r) => r.batch_number },
    {
      header: "Produced",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {formatNumber(r.quantity)} {r.unit}
        </span>
      ),
    },
    {
      header: "Remaining now",
      accessor: (r) => (
        <span className="whitespace-nowrap font-medium">
          {formatNumber(r.live_remaining_qty)} {r.unit}
        </span>
      ),
      sortValue: (r) => Number(r.live_remaining_qty),
    },
    {
      header: "QC / Stability / R&D",
      accessor: (r) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatNumber(r.qc_qty ?? 0)} / {formatNumber(r.stability_qty ?? 0)} / {formatNumber(r.rnd_qty ?? 0)} {r.unit}
        </span>
      ),
    },
    {
      header: "QC status",
      accessor: (r) => {
        const state = computeBatchQcState(r.qc_status ?? null, r.retest_date ?? null);
        return <Badge status={state}>{BATCH_QC_LABELS[state]}</Badge>;
      },
    },
    {
      header: "Issued to Production on",
      accessor: (r) => formatDate(r.created_at),
    },
    {
      header: "RM Intimation",
      accessor: (r) => (
        <ProductionRmIntimationLink
          itemName={itemName}
          itemCode={itemCode}
          batchNumber={r.batch_number}
          quantity={r.quantity}
          unit={r.unit}
          qcQty={r.qc_qty}
          rndQty={r.rnd_qty}
          packagingCode={r.packaging_issues?.code ?? null}
          packagingCreatedAt={r.packaging_issues?.created_at ?? null}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search batch number…"
      emptyLabel="No batches produced via Packaging issued to Production yet."
      pageSize={10}
      isLegacy={(r) => isLegacyCode(r.batch_number)}
    />
  );
}
