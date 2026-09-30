"use client";

import { useFlashActionState } from "@/lib/use-flash-action";

import { createProductionQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { isLegacyCode, formatQty } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type AwaitingProductionQcLine = {
  id: string;
  batch_number: string;
  qc_qty: string | number | null;
  unit: string | null;
  items: { item_code: string; name: string } | null;
};

// FB-0043 (28 Sept 2026) — Production-issued RM equivalent of the
// "Awaiting QC" card (awaiting-qc.tsx). One-click submit, not a link into
// /qc/new: unlike a purchased batch, a Production issue's QC quantity was
// already fixed on the Packaging New Issue form at the moment the batch
// was created — nothing left to choose here, same reasoning
// AwaitingFpQc uses for Finished Product batches. Confirmed decision #3:
// raised manually (a click), never auto-submitted.
export function AwaitingProductionQc({ lines, canStart }: { lines: AwaitingProductionQcLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.items?.item_code) && !isLegacyCode(l.batch_number))
    : lines;

  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-brand/25">
      <CardHeader title="Production batches awaiting QC" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          These Production-issued Raw Material batches don&apos;t have a QC record yet — start one below.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((line) => (
            <AwaitingProductionQcRow key={line.id} line={line} canStart={canStart} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function AwaitingProductionQcRow({ line, canStart }: { line: AwaitingProductionQcLine; canStart: boolean }) {
  const boundAction = createProductionQualityCheck.bind(null, line.id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form
      action={formAction}
      className="flex items-center justify-between gap-3 rounded-md border border-brand/25 bg-brand-light/40 px-3 py-2 text-sm"
    >
      <div>
        <p className="font-medium">
          {line.items ? `${line.items.item_code} — ${line.items.name}` : "—"} · {line.batch_number}
        </p>
        {line.qc_qty !== null && (
          <p className="text-xs text-muted">
            QC qty: {formatQty(line.qc_qty)} {line.unit}
          </p>
        )}
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
      </div>
      {canStart && (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Starting…" : "Start QC"}
        </Button>
      )}
    </form>
  );
}
