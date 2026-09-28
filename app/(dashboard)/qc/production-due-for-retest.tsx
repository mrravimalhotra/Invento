"use client";

import { useActionState } from "react";
import { startProductionRetestQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatNumber, isLegacyCode } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type ProductionDueForRetestLine = {
  id: string;
  batch_number: string;
  stability_qty: string | number;
  unit: string;
  items: { item_code: string; name: string } | null;
};

// FB-0043 (28 Sept 2026) — Production-issued RM equivalent of
// "Due for retest" (due-for-retest.tsx). Same one-click "Start Retest"
// per batch, pulling from the stability sample reserved at Packaging
// issue time (production_issue_batches.stability_qty) instead of a fresh
// pull — see startProductionRetestQualityCheck in lib/actions/qc.ts.
export function ProductionDueForRetest({ lines, canStart }: { lines: ProductionDueForRetestLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.items?.item_code) && !isLegacyCode(l.batch_number))
    : lines;

  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-amber/40">
      <CardHeader title="Production batches due for retest" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Retest date has passed on these approved Production-issued batches — start a new AR using the
          stability sample already reserved for each.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((line) => (
            <ProductionDueForRetestRow key={line.id} line={line} canStart={canStart} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function ProductionDueForRetestRow({ line, canStart }: { line: ProductionDueForRetestLine; canStart: boolean }) {
  const boundAction = startProductionRetestQualityCheck.bind(null, line.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form
      action={formAction}
      className="flex items-center justify-between gap-3 rounded-md border border-amber/30 bg-amber-bg/40 px-3 py-2 text-sm"
    >
      <div>
        <p className="font-medium">
          {line.items ? `${line.items.item_code} — ${line.items.name}` : "—"} · {line.batch_number}
        </p>
        <p className="text-xs text-muted">
          Stability sample available: {formatNumber(line.stability_qty)} {line.unit}
        </p>
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
      </div>
      {canStart && (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Starting…" : "Start Retest"}
        </Button>
      )}
    </form>
  );
}
