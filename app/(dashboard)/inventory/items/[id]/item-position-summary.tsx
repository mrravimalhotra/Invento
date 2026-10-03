import { formatQty } from "@/lib/utils";
import type { RmStockSplit } from "@/lib/usable-stock";

// Inventory Ledger redesign, Phase 4 (claude/inventory-ledger-redesign.md,
// Option C) — the per-item detail page's full-room version of the Stock
// Position table's compact "Breakdown" subline: every applicable
// item_position (0031_stock_position.sql) figure as its own labeled
// stat, category-scoped since a category never has all 8 columns
// meaningfully populated at once (Phase 2's Purchase Lines/RM Report
// precedent for a per-item breakdown, extended to Packaging and FP here).
export type Position = {
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
  productionRmYield: number;
  onHand: number;
};

function Stat({ label, value, unit, emphasize }: { label: string; value: number; unit: string | null; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className={emphasize ? "mt-1 text-2xl font-semibold text-foreground" : "mt-1 text-lg font-medium text-foreground"}>
        {formatQty(value)} {unit}
      </p>
    </div>
  );
}

// ACC-22: the "Not yet usable" line under the raw-material card, e.g.
// "Not yet usable: 40 kg (30 kg awaiting QC, 10 kg rejected)".
export function notYetUsableText(split: RmStockSplit, unit: string | null): string | null {
  if (!(split.notYetUsable > 0)) return null;
  const u = unit ? ` ${unit}` : "";
  const parts: string[] = [];
  if (split.awaitingQc > 0) parts.push(`${formatQty(split.awaitingQc)}${u} awaiting QC`);
  if (split.dueForRetest > 0) parts.push(`${formatQty(split.dueForRetest)}${u} due for retest`);
  if (split.expired > 0) parts.push(`${formatQty(split.expired)}${u} expired`);
  if (split.rejected > 0) parts.push(`${formatQty(split.rejected)}${u} rejected`);
  return `Not yet usable: ${formatQty(split.notYetUsable)}${u} (${parts.join(", ")})`;
}

export function ItemPositionSummary({
  category,
  unit,
  position,
  rmStock,
}: {
  category: string;
  unit: string | null;
  position: Position;
  rmStock?: RmStockSplit;
}) {
  const p = position;

  if (category === "processed") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
        <Stat label="Batch yield (total)" value={p.yielded} unit={unit} />
        <Stat label="QC sampled" value={p.heldQc} unit={unit} />
        <Stat label="Stability sampled" value={p.heldStability} unit={unit} />
        <Stat label="R&D sampled" value={p.heldRnd} unit={unit} />
        <Stat label="Used in packaging" value={p.consumedByPackaging} unit={unit} />
        <Stat label="Available" value={p.onHand} unit={unit} emphasize />
      </div>
    );
  }

  // Task F (claude/packaged-fp-redesign.md) — Packaged Finished Product:
  // always fully issued, one-shot, so Available nets to zero once yield
  // and issue both land. Shown anyway (rather than hidden) so the history
  // is visible at a glance, same "never hide history" convention as every
  // other category here.
  if (category === "packaged_fp") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Packaged (total)" value={p.packagedYield} unit={unit} />
        <Stat label="Issued to Store" value={p.issuedStore} unit={unit} />
        <Stat label="Issued to R&D" value={p.issuedRnd} unit={unit} />
        <Stat label="Available" value={p.onHand} unit={unit} emphasize />
      </div>
    );
  }

  if (category === "packaging") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Received" value={p.received} unit={unit} />
        <Stat label="Issued" value={p.issuedPackaging} unit={unit} />
        <Stat label="Wastage" value={p.wastage} unit={unit} />
        <Stat label="Available" value={p.onHand} unit={unit} emphasize />
      </div>
    );
  }

  // raw material. ACC-22: "Available for FP production" is the stock in
  // batches Compose can pick (QC-approved, not due for retest, purchase order
  // submitted) — not the total on hand, which also counts batches awaiting QC,
  // rejected or due for retest. Those are listed underneath.
  const available = rmStock ? rmStock.usable : p.onHand;
  const notUsable = rmStock ? notYetUsableText(rmStock, unit) : null;
  // ACC-21: material made from production issues is never purchased, so it
  // shows "Produced" instead of "Received 0". Every figure is net of reversals
  // (a reopened PO, returned samples, cancelled FP drafts), so the cards add
  // up to the available figure.
  const showReceived = p.received > 0 || p.productionRmYield <= 0;
  const showProduced = p.productionRmYield > 0;
  const eightCards = showReceived && showProduced;
  return (
    <div>
      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-4 ${eightCards ? "lg:grid-cols-8" : "lg:grid-cols-7"}`}>
        {showReceived && <Stat label="Received" value={p.received} unit={unit} />}
        {showProduced && <Stat label="Produced" value={p.productionRmYield} unit={unit} />}
        <Stat label="QC held" value={p.heldQc} unit={unit} />
        <Stat label="Stability held" value={p.heldStability} unit={unit} />
        <Stat label="R&D held" value={p.heldRnd} unit={unit} />
        <Stat label="Used in FP" value={p.consumedByFp} unit={unit} />
        <Stat label="Wastage" value={p.wastage} unit={unit} />
        <Stat label="Available for FP production" value={available} unit={unit} emphasize />
      </div>
      {notUsable && <p className="mt-3 text-sm text-muted lg:text-right">{notUsable}</p>}
    </div>
  );
}
