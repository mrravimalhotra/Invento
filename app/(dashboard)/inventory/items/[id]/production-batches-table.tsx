"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

// Production-sourced Raw Material batches (Ravi, 19 Sept 2026 —
// "Packaging issued to Production"; supabase/migrations/
// 0050_production_rm_from_packaging.sql). A Raw Material item created this
// way (e.g. RM-FP-00001, paired to a Finished Product via
// items.production_rm_item_id) is never purchased, so it never shows up
// in PurchaseBatchesTable — this is its equivalent "batch" listing,
// sourced from production_issue_batches instead of purchase_lines. No QC
// columns: these batches carry no QC state of their own (the original
// Finished Product batch's own QC approval already cleared this material
// — the confirmed "no new QC step" decision).
export type ProductionBatchRow = {
  id: string;
  batch_number: string;
  quantity: string | number;
  live_remaining_qty: string | number;
  unit: string;
  created_at: string;
};

export function ProductionBatchesTable({ rows }: { rows: ProductionBatchRow[] }) {
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
      header: "Issued to Production on",
      accessor: (r) => formatDate(r.created_at),
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
