"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber, isLegacyCode } from "@/lib/utils";

export type LedgerRow = {
  id: string;
  event_at: string;
  event_type: string;
  quantity: string | number;
  unit: string | null;
  department: string | null;
  reference_type: string | null;
  reference_id: string | null;
  event_by: string | null;
  items: { name: string; item_code: string } | null;
  purchase_lines: { batch_number: string } | null;
  eventByName: string | null;
  // FB-0013 ("Batch should be visible in inventory ledger") — the Finished
  // Product batch a 'finished_product'/'packaging' event relates to,
  // resolved server-side via reference_id (see page.tsx). Distinct from
  // purchase_lines.batch_number above, which is the raw-material batch.
  fpBatchNumber: string | null;
};

// Inventory Ledger redesign, Phase 1 (claude/inventory-ledger-redesign.md)
// — 0028_ledger_sample_pull_fix.sql added three new reference_type values
// (qc_sample/stability_sample/rnd_sample) alongside the existing ones.
// The old rendering (`className="capitalize"` over the raw column value)
// only capitalizes the first letter, so an underscored value would have
// shown as "Qc_sample" rather than a real label — fixed with an explicit
// map instead of trying to out-clever CSS for every future value too.
const REFERENCE_TYPE_LABELS: Record<string, string> = {
  purchase: "Purchase",
  qc: "QC",
  qc_sample: "QC Sample",
  stability_sample: "Stability Sample",
  rnd_sample: "R&D Sample",
  finished_product: "Finished Product",
  packaging: "Packaging",
};

function formatEventAt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
          {r.purchase_lines?.batch_number && (
            <div className="text-xs text-muted">Batch {r.purchase_lines.batch_number}</div>
          )}
          {r.fpBatchNumber && <div className="text-xs text-muted">FP batch {r.fpBatchNumber}</div>}
        </div>
      ),
      searchValue: (r) =>
        `${r.items?.name ?? ""} ${r.items?.item_code ?? ""} ${r.purchase_lines?.batch_number ?? ""} ${r.fpBatchNumber ?? ""}`,
    },
    {
      header: "Quantity",
      accessor: (r) => (
        <span className="whitespace-nowrap">
          {formatNumber(r.quantity)} {r.unit}
        </span>
      ),
    },
    {
      header: "Department",
      accessor: (r) => (r.department ? <span className="capitalize">{r.department}</span> : "—"),
    },
    {
      header: "Reference",
      accessor: (r) =>
        r.reference_type ? (REFERENCE_TYPE_LABELS[r.reference_type] ?? r.reference_type) : "—",
      searchValue: (r) => r.reference_type ?? "",
    },
    {
      header: "By",
      accessor: (r) => r.eventByName ?? "—",
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        searchPlaceholder="Search item, batch, event type, reference…"
        emptyLabel="No ledger events yet."
        pageSize={20}
        // FB-0019 ("when legacy rows are hidden, legacy stock should not be
        // visibile in the ledger") — a ledger event is legacy if the item
        // itself is a legacy code, or the batch it moved (raw-material or
        // Finished Product) is a legacy batch number. Same app-wide
        // "Hide legacy data" preference every other list already reads
        // (lib/hooks/use-hide-legacy.ts), not a separate toggle.
        isLegacy={(r) =>
          isLegacyCode(r.items?.item_code) || isLegacyCode(r.purchase_lines?.batch_number) || isLegacyCode(r.fpBatchNumber)
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
