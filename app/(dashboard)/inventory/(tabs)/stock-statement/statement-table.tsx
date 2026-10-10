"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatQty, isLegacyCode } from "@/lib/utils";
import type { TableExport } from "@/lib/table-export";

export type StatementRow = {
  itemId: string;
  itemCode: string;
  itemName: string;
  category: string;
  unit: string;
  opening: number;
  purchased: number;
  produced: number;
  otherIn: number;
  usedInProduction: number;
  packaging: number;
  samples: number;
  wastage: number;
  rejected: number;
  otherOut: number;
  closing: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  raw: "Raw material",
  processed: "Finished product",
  packaging: "Packaging",
  packaged_fp: "Packaged finished product",
};

// A movement column: blank when zero so the figures that matter stand out.
function Qty({ v, bold }: { v: number; bold?: boolean }) {
  if (v === 0 && !bold) return <span className="text-muted">—</span>;
  return <span className={bold ? "font-semibold" : undefined}>{formatQty(v)}</span>;
}

export function StatementTable({ rows, from, to }: { rows: StatementRow[]; from: string; to: string }) {
  const num = (header: string, get: (r: StatementRow) => number, bold = false): Column<StatementRow> => ({
    header,
    accessor: (r) => (
      <span className="whitespace-nowrap tabular-nums">
        <Qty v={get(r)} bold={bold} />
      </span>
    ),
    sortValue: get,
  });

  const columns: Column<StatementRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <Link href={`/inventory/items/${r.itemId}`} className="block hover:underline">
          <div className="font-medium">{r.itemName}</div>
          <div className="text-xs text-muted">
            {r.itemCode} · {CATEGORY_LABELS[r.category] ?? r.category}
          </div>
        </Link>
      ),
      searchValue: (r) => `${r.itemName} ${r.itemCode} ${CATEGORY_LABELS[r.category] ?? r.category}`,
      sortValue: (r) => r.itemCode,
    },
    { header: "Unit", accessor: (r) => r.unit || "—" },
    num("Opening", (r) => r.opening, true),
    num("Purchased", (r) => r.purchased),
    num("Produced", (r) => r.produced),
    num("Other in", (r) => r.otherIn),
    num("Used in production", (r) => r.usedInProduction),
    num("Packaging", (r) => r.packaging),
    num("Samples", (r) => r.samples),
    num("Wastage", (r) => r.wastage),
    num("Rejected", (r) => r.rejected),
    num("Other out", (r) => r.otherOut),
    num("Closing", (r) => r.closing, true),
    {
      // Drill-down: the ledger entries behind the figures, for this item and period.
      header: "Entries",
      accessor: (r) => (
        <Link
          href={`/inventory?item=${r.itemId}&from=${from}&to=${to}`}
          className="whitespace-nowrap text-sm font-medium text-brand-dark hover:underline"
        >
          View ledger
        </Link>
      ),
    },
  ];

  const exportConfig: TableExport<StatementRow> = {
    title: "Stock Statement",
    filename: `stock-statement-${from}-to-${to}`,
    formats: ["excel", "pdf"],
    note: `Period: ${formatDate(from)} to ${formatDate(to)} (India time)`,
    columns: [
      { header: "Item code", value: (r) => r.itemCode },
      { header: "Item", value: (r) => r.itemName },
      { header: "Category", value: (r) => CATEGORY_LABELS[r.category] ?? r.category },
      { header: "Unit", value: (r) => r.unit },
      { header: "Opening", type: "number", decimals: 3, value: (r) => r.opening },
      { header: "Purchased", type: "number", decimals: 3, value: (r) => r.purchased },
      { header: "Produced", type: "number", decimals: 3, value: (r) => r.produced },
      { header: "Other in", type: "number", decimals: 3, value: (r) => r.otherIn },
      { header: "Used in production", type: "number", decimals: 3, value: (r) => r.usedInProduction },
      { header: "Packaging", type: "number", decimals: 3, value: (r) => r.packaging },
      { header: "Samples", type: "number", decimals: 3, value: (r) => r.samples },
      { header: "Wastage", type: "number", decimals: 3, value: (r) => r.wastage },
      { header: "Rejected", type: "number", decimals: 3, value: (r) => r.rejected },
      { header: "Other out", type: "number", decimals: 3, value: (r) => r.otherOut },
      { header: "Closing", type: "number", decimals: 3, value: (r) => r.closing },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item name, code or category…"
      emptyLabel="No stock or movement for this period."
      pageSize={20}
      isLegacy={(r) => isLegacyCode(r.itemCode)}
      exportConfig={exportConfig}
    />
  );
}
