"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatNumber, isLegacyCode } from "@/lib/utils";

// Inventory Ledger redesign, Phase 4 (claude/inventory-ledger-redesign.md,
// Option B) — Stock Balance becomes Stock Position: on top of the same
// on-hand figure the old table showed, every item now also carries the
// item_position breakdown (0031_stock_position.sql) that explains *how*
// that number was reached, and each row links to a full per-item detail
// page (Option C, same phase — see /inventory/items/[id]).
//
// One shared table across all three categories (Ravi's explicit choice —
// "all three get the full breakdown treatment," not RM only) rather than
// three separate tables, since Stock Position answering "what do I have"
// at a glance is more useful kept as one sortable/searchable list. The
// breakdown numbers differ by category (RM: received/QC/Stability/R&D/
// wastage/FP-consumed; FP: yielded/QC/Stability/R&D; Packaging:
// received/issued) — rather than exploding that into ~8 mostly-empty
// columns, it's rendered as a compact per-category subline, the same
// "primary figure + explanatory subline" convention already used for
// Purchase Lines' live-remaining figure and the Ledger's FP-batch
// context line.
const CATEGORY_LABELS: Record<string, string> = {
  processed: "Finished product",
  packaged_fp: "Packaged finished product",
};

export type PositionRow = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  low_stock_threshold: string | number | null;
  category: string;
  onHand: number;
  low: boolean;
  received: number;
  yielded: number;
  heldQc: number;
  heldStability: number;
  heldRnd: number;
  consumedByFp: number;
  issuedPackaging: number;
  consumedByPackaging: number;
  packagedYield: number;
  issuedStore: number;
  issuedRnd: number;
  wastage: number;
};

function Breakdown({ r }: { r: PositionRow }) {
  const parts: string[] = [];
  if (r.category === "processed") {
    parts.push(`Yield ${formatNumber(r.yielded)}`);
    if (r.heldQc > 0) parts.push(`QC ${formatNumber(r.heldQc)}`);
    if (r.heldStability > 0) parts.push(`Stability ${formatNumber(r.heldStability)}`);
    if (r.heldRnd > 0) parts.push(`R&D ${formatNumber(r.heldRnd)}`);
    if (r.consumedByPackaging > 0) parts.push(`Packaged ${formatNumber(r.consumedByPackaging)}`);
  } else if (r.category === "packaged_fp") {
    // Task F (claude/packaged-fp-redesign.md) — always fully issued,
    // one-shot: on-hand nets to zero once yield and issue both land, so
    // the breakdown is the only place this item's history is visible at
    // a glance.
    parts.push(`Packaged ${formatNumber(r.packagedYield)}`);
    if (r.issuedStore > 0) parts.push(`Store ${formatNumber(r.issuedStore)}`);
    if (r.issuedRnd > 0) parts.push(`R&D ${formatNumber(r.issuedRnd)}`);
  } else if (r.category === "packaging") {
    parts.push(`Received ${formatNumber(r.received)}`);
    if (r.issuedPackaging > 0) parts.push(`Issued ${formatNumber(r.issuedPackaging)}`);
  } else {
    // raw material
    parts.push(`Received ${formatNumber(r.received)}`);
    if (r.heldQc > 0) parts.push(`QC ${formatNumber(r.heldQc)}`);
    if (r.heldStability > 0) parts.push(`Stability ${formatNumber(r.heldStability)}`);
    if (r.heldRnd > 0) parts.push(`R&D ${formatNumber(r.heldRnd)}`);
    if (r.consumedByFp > 0) parts.push(`FP use ${formatNumber(r.consumedByFp)}`);
    if (r.wastage > 0) parts.push(`Wastage ${formatNumber(r.wastage)}`);
  }
  return <span className="text-xs text-muted">{parts.join(" · ")}</span>;
}

export function StockPositionTable({ rows }: { rows: PositionRow[] }) {
  const columns: Column<PositionRow>[] = [
    {
      header: "Item",
      accessor: (r) => (
        <Link href={`/inventory/items/${r.id}`} className="block hover:underline">
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted">{r.item_code}</div>
        </Link>
      ),
      searchValue: (r) => `${r.name} ${r.item_code}`,
    },
    {
      header: "Category",
      accessor: (r) => <span className="capitalize">{CATEGORY_LABELS[r.category] ?? r.category}</span>,
      searchValue: (r) => r.category,
    },
    {
      header: "On hand",
      accessor: (r) => (
        <span className={r.low ? "font-semibold text-red" : "font-medium"}>
          {formatNumber(r.onHand)} {r.unit}
        </span>
      ),
      sortValue: (r) => r.onHand,
    },
    {
      header: "Breakdown",
      accessor: (r) => <Breakdown r={r} />,
    },
    {
      header: "Low-stock threshold",
      accessor: (r) => (r.low_stock_threshold === null ? "—" : `${formatNumber(r.low_stock_threshold)} ${r.unit ?? ""}`),
    },
    {
      header: "Status",
      accessor: (r) =>
        r.low_stock_threshold === null ? (
          <span className="text-xs text-muted">No threshold set</span>
        ) : r.low ? (
          <Badge status="rejected">Low stock</Badge>
        ) : (
          <Badge status="approved">OK</Badge>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search item name or code…"
      emptyLabel="No active items yet."
      pageSize={20}
      isLegacy={(r) => isLegacyCode(r.item_code)}
    />
  );
}
