"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";
import { BATCH_QC_LABELS, computeBatchQcState, type BatchQcState } from "@/lib/batch-qc-status";

// Inventory Ledger redesign, Phase 4 (claude/inventory-ledger-redesign.md,
// Option C) — every purchase batch behind a raw-material or packaging
// item's Stock Position, with the batch's own *live* remaining quantity
// (Phase 2, purchase_lines.live_remaining_qty) rather than the static
// receipt-time figure. QC status is raw-material only (packaging never
// goes through QC in this app, same reasoning as every other
// QC-adjacent picker/report) — `showQcStatus` hides that column and the
// QC Status prop entirely for a packaging item's table.
export type PurchaseBatchRow = {
  id: string;
  batch_number: string;
  quantity: string | number;
  qc_qty: string | number;
  stability_qty: string | number;
  rnd_qty: string | number;
  live_remaining_qty: string | number;
  unit: string;
  expiry_date: string | null;
  created_at: string;
  purchase_order_status: string;
  qc_status?: string | null;
  retest_date?: string | null;
};

export function PurchaseBatchesTable({ rows, showQcStatus }: { rows: PurchaseBatchRow[]; showQcStatus: boolean }) {
  const columns: Column<PurchaseBatchRow>[] = [
    {
      header: "Batch",
      accessor: (r) => (
        <div>
          <div className="font-medium">{r.batch_number}</div>
          {r.purchase_order_status === "draft" && <div className="text-xs text-muted">Draft PO — not yet in stock</div>}
        </div>
      ),
      searchValue: (r) => r.batch_number,
    },
    {
      header: "Received",
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
          {formatNumber(r.qc_qty)} / {formatNumber(r.stability_qty)} / {formatNumber(r.rnd_qty)} {r.unit}
        </span>
      ),
    },
    ...(showQcStatus
      ? [
          {
            header: "QC status",
            accessor: (r: PurchaseBatchRow) => {
              const state: BatchQcState = computeBatchQcState(r.qc_status, r.retest_date);
              return <Badge status={state}>{BATCH_QC_LABELS[state]}</Badge>;
            },
          } as Column<PurchaseBatchRow>,
        ]
      : []),
    {
      header: "Re-test date",
      accessor: (r) => formatDate(r.expiry_date),
    },
    {
      header: "Received on",
      accessor: (r) => formatDate(r.created_at),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search batch number…"
      emptyLabel="No purchase batches for this item yet."
      pageSize={10}
      isLegacy={(r) => isLegacyCode(r.batch_number)}
    />
  );
}
