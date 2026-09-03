import { formatNumber } from "@/lib/utils";

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
  wastage: number;
  onHand: number;
};

function Stat({ label, value, unit, emphasize }: { label: string; value: number; unit: string | null; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className={emphasize ? "mt-1 text-2xl font-semibold text-foreground" : "mt-1 text-lg font-medium text-foreground"}>
        {formatNumber(value)} {unit}
      </p>
    </div>
  );
}

export function ItemPositionSummary({ category, unit, position }: { category: string; unit: string | null; position: Position }) {
  const p = position;

  if (category === "processed") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Batch yield (total)" value={p.yielded} unit={unit} />
        <Stat label="QC sampled" value={p.heldQc} unit={unit} />
        <Stat label="Stability sampled" value={p.heldStability} unit={unit} />
        <Stat label="R&D sampled" value={p.heldRnd} unit={unit} />
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

  // raw material
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
      <Stat label="Received" value={p.received} unit={unit} />
      <Stat label="QC held" value={p.heldQc} unit={unit} />
      <Stat label="Stability held" value={p.heldStability} unit={unit} />
      <Stat label="R&D held" value={p.heldRnd} unit={unit} />
      <Stat label="Used in FP" value={p.consumedByFp} unit={unit} />
      <Stat label="Wastage" value={p.wastage} unit={unit} />
      <Stat label="Available for FP production" value={p.onHand} unit={unit} emphasize />
    </div>
  );
}
