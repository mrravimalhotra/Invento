"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { isLegacyCode, formatQty, fpBatchBoth } from "@/lib/utils";
import type { EnrichedLedgerRow } from "@/lib/ledger-enrich";
import { ledgerReasonLabel } from "@/lib/ledger-reasons";
import type { TableExport } from "@/lib/table-export";

export type LedgerRow = EnrichedLedgerRow;

// Reference labels: lib/ledger-reasons.ts (ACC-32) — one list shared with the
// Reason filter.

function formatEventAt(iso: string) {
  // known-issues.md ("React error #418 on /inventory") — with no explicit
  // timeZone, this formats in whatever timezone the code happens to run
  // in: the server's during SSR, the browser's during hydration. Those can
  // disagree on which calendar day an event falls under near a day
  // boundary, and React flags the resulting server/client text mismatch
  // as a hydration error. Pinning both to the same zone (matching the
  // en-IN locale already chosen) makes server and client agree always,
  // regardless of either runtime's own timezone.
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function InventoryLedgerTable({ rows, ledgerLimit }: { rows: LedgerRow[]; ledgerLimit: number }) {
  const columns: Column<LedgerRow>[] = [
    {
      header: "Date / time",
      accessor: (r) => <span className="whitespace-nowrap">{formatEventAt(r.event_at)}</span>,
      sortValue: (r) => r.event_at,
    },
    {
      header: "Event",
      accessor: (r) => <Badge status={r.event_type}>{r.event_type}</Badge>,
      searchValue: (r) => r.event_type,
    },
    {
      header: "Item",
      accessor: (r) => (
        <div>
          <div className="font-medium">
            {r.items?.name ?? "—"}{" "}
            <span className="text-xs font-normal text-muted">{r.items?.item_code}</span>
          </div>
          {(r.purchase_lines?.batch_number || r.production_issue_batches?.batch_number) && (
            <div className="text-xs text-muted">
              Batch {r.purchase_lines?.batch_number ?? r.production_issue_batches?.batch_number}
            </div>
          )}
          {r.fpBatchNumber && (
            <div className="text-xs text-muted">FP batch {fpBatchBoth(r.fpBatchNumber, r.fpBatchShortNumber)}</div>
          )}
        </div>
      ),
      searchValue: (r) =>
        `${r.items?.name ?? ""} ${r.items?.item_code ?? ""} ${r.purchase_lines?.batch_number ?? ""} ${r.production_issue_batches?.batch_number ?? ""} ${r.fpBatchNumber ?? ""}`,
    },
    {
      header: "Quantity",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {formatQty(r.quantity)} {r.unit}
        </span>
      ),
    },
    {
      // Phase 4 (claude/inventory-ledger-redesign.md, Option A) — that
      // item's on-hand balance immediately after this event
      // (inventory_ledger_with_balance, 0031_stock_position.sql). Blank
      // rather than 0 when absent so a page/query that didn't request it
      // doesn't look like every item's balance is genuinely zero.
      header: "Running balance",
      accessor: (r) =>
        r.running_balance === null || r.running_balance === undefined ? (
          "—"
        ) : (
          <span className="whitespace-nowrap font-medium">
            {formatQty(r.running_balance)} {r.unit}
          </span>
        ),
      sortValue: (r) => (r.running_balance === null || r.running_balance === undefined ? 0 : Number(r.running_balance)),
    },
    {
      header: "Department",
      accessor: (r) => (r.department ? <span className="capitalize">{r.department}</span> : "—"),
    },
    {
      header: "Reference",
      accessor: (r) =>
        r.reference_type ? ledgerReasonLabel(r.reference_type) : "—",
      searchValue: (r) => (r.reference_type ? `${r.reference_type} ${ledgerReasonLabel(r.reference_type)}` : ""),
    },
    {
      header: "By",
      accessor: (r) => r.eventByName ?? "—",
    },
  ];

  // Export decision (c), 29 Sept 2026: Excel of the ledger events loaded on
  // this page (narrow with the item / reason / date filters above the table).
  const exportConfig: TableExport<LedgerRow> = {
    title: "Inventory Ledger",
    filename: "inventory-ledger",
    formats: ["excel"],
    note: rows.length === ledgerLimit ? `Most recent ${ledgerLimit.toLocaleString("en-IN")} events only — narrow the filters to see others` : undefined,
    columns: [
      { header: "Date / time", type: "datetime", value: (r) => r.event_at },
      { header: "Event", value: (r) => r.event_type },
      { header: "Item code", value: (r) => r.items?.item_code ?? "" },
      { header: "Item", value: (r) => r.items?.name ?? "" },
      { header: "Batch", value: (r) => r.purchase_lines?.batch_number ?? r.production_issue_batches?.batch_number ?? "" },
      { header: "FP batch", value: (r) => r.fpBatchShortNumber ?? r.fpBatchNumber ?? "" },
      { header: "Quantity", type: "number", decimals: 3, value: (r) => Number(r.quantity) },
      { header: "Unit", value: (r) => r.unit ?? "" },
      {
        header: "Running balance",
        type: "number",
        decimals: 3,
        value: (r) => (r.running_balance === null || r.running_balance === undefined ? null : Number(r.running_balance)),
      },
      { header: "Department", value: (r) => r.department ?? "" },
      { header: "Reference", value: (r) => (r.reference_type ? ledgerReasonLabel(r.reference_type) : "") },
      { header: "By", value: (r) => r.eventByName ?? "" },
    ],
  };

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search item, batch, event type, reference…"
        emptyLabel="No ledger events yet."
        pageSize={20}
        exportConfig={exportConfig}
        // FB-0019 ("when legacy rows are hidden, legacy stock should not be
        // visibile in the ledger") — a ledger event is legacy if the item
        // itself is a legacy code, or the batch it moved (raw-material or
        // Finished Product) is a legacy batch number. Same app-wide
        // "Hide legacy data" preference every other list already reads
        // (lib/hooks/use-hide-legacy.ts), not a separate toggle.
        isLegacy={(r) =>
          isLegacyCode(r.items?.item_code) ||
          isLegacyCode(r.purchase_lines?.batch_number) ||
          isLegacyCode(r.production_issue_batches?.batch_number) ||
          isLegacyCode(r.fpBatchNumber)
        }
      />
      {rows.length === ledgerLimit && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Showing the most recent {ledgerLimit.toLocaleString("en-IN")} events.
        </p>
      )}
    </>
  );
}
