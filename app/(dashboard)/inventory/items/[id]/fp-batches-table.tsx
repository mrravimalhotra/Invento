"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";

// Inventory Ledger redesign, Phase 4 (claude/inventory-ledger-redesign.md,
// Option C) — every Finished Product batch that fed into this FP item's
// Stock Position, i.e. every finished_product_batches row for the MFR
// this item is linked to (mfr_definitions.finished_product_item_id,
// 0010_mfr_finished_product_link.sql). Only an Approved batch actually
// contributed to the item_position figures above it (Phase 3,
// 0030_finished_product_ledger.sql — stock only moves at QC approval);
// In Process / Submitted to QC / Rejected batches are still listed here
// for context, same as the main Finished Product list already does.
export type FpBatchRow = {
  id: string;
  batch_number: string;
  status: string;
  batch_yield: string | number | null;
  qc_sample_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
  finish_date: string | null;
};

export function FpBatchesTable({ rows, unit }: { rows: FpBatchRow[]; unit: string | null }) {
  const columns: Column<FpBatchRow>[] = [
    {
      header: "Batch",
      accessor: (r) => <span className="font-medium">{r.batch_number}</span>,
      searchValue: (r) => r.batch_number,
    },
    {
      header: "Status",
      accessor: (r) => <Badge status={r.status}>{r.status.replace(/_/g, " ")}</Badge>,
      searchValue: (r) => r.status,
    },
    {
      header: "Batch yield",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {r.batch_yield === null ? "—" : `${formatNumber(r.batch_yield)} ${unit ?? ""}`}
        </span>
      ),
    },
    {
      header: "QC / Stability / R&D",
      accessor: (r) => (
        <span className="whitespace-nowrap text-xs text-muted">
          {formatNumber(r.qc_sample_qty ?? 0)} / {formatNumber(r.stability_qty ?? 0)} / {formatNumber(r.rnd_qty ?? 0)} {unit}
        </span>
      ),
    },
    {
      header: "Finish date",
      accessor: (r) => formatDate(r.finish_date),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search batch number…"
      emptyLabel="No Finished Product batches for this item yet."
      pageSize={10}
      isLegacy={(r) => isLegacyCode(r.batch_number)}
    />
  );
}
