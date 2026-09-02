"use client";

import { useActionState } from "react";
import { startRetestQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

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
export function DueForRetest({ lines, canStart }: { lines: DueForRetestLine[]; canStart: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line) => (
        <DueForRetestRow key={line.id} line={line} canStart={canStart} />
      ))}
    </div>
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
