"use client";

import { useActionState } from "react";
import { startRetestQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatNumber, isLegacyCode } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type DueForRetestLine = {
  id: string;
  batch_number: string;
  stability_qty: string | number;
  unit: string;
  items: { item_code: string; name: string } | null;
};

// One-click "Start Retest" per batch — pulls from the stability sample
// already reserved at Purchase time (see startRetestQualityCheck in
// lib/actions/qc.ts) rather than a fresh sample pull. Each row is its own
// form/action pair so one batch's error or pending state never affects
// the others.
//
// Respects the app-wide "Hide legacy data" preference the same way the
// "Awaiting QC" card (awaiting-qc.tsx) and the legacy-aware <Select>
// comboboxes do: read silently, filter client-side, no card-local checkbox.
// The Card wrapper itself lives here (not in qc/page.tsx) so the whole card
// can disappear once filtering leaves nothing to show — the server only
// knows the unfiltered count when deciding whether to render at all.
export function DueForRetest({ lines, canStart }: { lines: DueForRetestLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.items?.item_code) && !isLegacyCode(l.batch_number))
    : lines;

  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-amber/40">
      <CardHeader title="Due for retest" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Retest date has passed on these approved batches — start a new AR using the stability sample
          already reserved for each.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((line) => (
            <DueForRetestRow key={line.id} line={line} canStart={canStart} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function DueForRetestRow({ line, canStart }: { line: DueForRetestLine; canStart: boolean }) {
  const boundAction = startRetestQualityCheck.bind(null, line.id);
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
