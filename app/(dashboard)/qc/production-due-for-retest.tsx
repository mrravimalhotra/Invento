"use client";

import { startProductionRetestQualityCheck } from "@/lib/actions/qc";
import { isLegacyCode, formatQty } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";
import { RetestCard, RetestRow, suggestedSample } from "./retest-card";

export type ProductionDueForRetestLine = {
  id: string;
  batch_number: string;
  qc_qty: string | number | null;
  live_remaining_qty: string | number;
  stability_reserve_left: string | number;
  unit: string;
  items: { item_code: string; name: string } | null;
};

// FB-0043 (28 Sept 2026) — Production-issued RM equivalent of
// "Due for retest" (due-for-retest.tsx). Same one-click "Start Retest"
// per batch (sample size entered here since 0080 — reserve first, then stock),
// originally pulling from the stability sample reserved at Packaging
// issue time (production_issue_batches.stability_qty) instead of a fresh
// pull — see startProductionRetestQualityCheck in lib/actions/qc.ts.
export function ProductionDueForRetest({ lines, canStart }: { lines: ProductionDueForRetestLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.items?.item_code) && !isLegacyCode(l.batch_number))
    : lines;

  if (visible.length === 0) return null;

  return (
    <RetestCard
      title="Production batches due for retest"
      intro={<>Retest date has passed on these approved Production-issued batches. Enter the retest sample: it comes from the batch&apos;s stability reserve first, then from its remaining stock.</>}
    >
      {visible.map((line) => (
        <RetestRow
          key={line.id}
          action={startProductionRetestQualityCheck.bind(null, line.id)}
          heading={<>{line.items ? `${line.items.item_code} — ${line.items.name}` : "—"} · {line.batch_number}</>}
          details={
            <>
              Stability reserve left: {formatQty(Number(line.stability_reserve_left ?? 0))} {line.unit} · Stock left:{" "}
              {formatQty(Number(line.live_remaining_qty ?? 0))} {line.unit}
            </>
          }
          batchLabel={line.batch_number}
          unit={line.unit}
          defaultSample={suggestedSample(line.qc_qty)}
          canStart={canStart}
        />
      ))}
    </RetestCard>
  );
}
