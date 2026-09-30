"use client";

import { useFlashActionState } from "@/lib/use-flash-action";

import { submitFinishedProductToQc, type ActionState } from "@/lib/actions/finished-product";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { isLegacyCode, formatQty } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type AwaitingFpQcLine = {
  id: string;
  batch_number: string;
  qc_sample_qty: string | number | null;
  unit: string | null;
  mfr_definitions: { name: string } | null;
};

// Ravi (21 Sept 2026): "Finished product once created should also appear in
// notification as 'Awaiting QC'" — a Finished Product batch that's been
// completed (status 'complete_awaiting_qc', set by completeFinishedProductBatch
// — see lib/actions/finished-product.ts and the "Complete - Awaiting QC" label
// in lib/finished-product-status.ts) sits there until someone visits that
// specific batch's own page and clicks "Submit to QC". Nothing surfaced that
// it was waiting, the same gap the existing "Awaiting QC" card (awaiting-qc.tsx)
// already closes for raw material batches that arrived but have no QC record
// yet — this is the Finished Product equivalent of that same notification,
// on the same /qc page RM's card already lives on.
//
// Each row submits directly via submitFinishedProductToQc (the exact same
// action + form the FP batch's own detail page uses — see
// app/(dashboard)/finished-product/[id]/submit-to-qc-form.tsx) rather than
// just linking to that page: nothing else needs to be entered to submit
// (qc_sample_qty/unit/expiry are already set during Complete Batch), so a
// true one-click "resolve from here" beats a link-through for this one,
// unlike RM's card (which links to /qc/new because a real AR form still
// needs filling in there). Same "Hide legacy data" respect and same
// per-row form/pending-state isolation as due-for-retest.tsx.
export function AwaitingFpQc({ lines, canSubmit }: { lines: AwaitingFpQcLine[]; canSubmit: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy ? lines.filter((l) => !isLegacyCode(l.batch_number)) : lines;

  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-brand/25">
      <CardHeader title="Finished Product Awaiting QC" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          These batches have been completed but haven&apos;t been submitted to QC yet — submit below to open an
          AR.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((line) => (
            <AwaitingFpQcRow key={line.id} line={line} canSubmit={canSubmit} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function AwaitingFpQcRow({ line, canSubmit }: { line: AwaitingFpQcLine; canSubmit: boolean }) {
  const boundAction = submitFinishedProductToQc.bind(null, line.id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form
      action={formAction}
      className="flex items-center justify-between gap-3 rounded-md border border-brand/25 bg-brand-light/40 px-3 py-2 text-sm"
    >
      <div>
        <p className="font-medium">
          {line.mfr_definitions?.name ?? "—"} · {line.batch_number}
        </p>
        {line.qc_sample_qty !== null && (
          <p className="text-xs text-muted">
            QC sample: {formatQty(line.qc_sample_qty)} {line.unit}
          </p>
        )}
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
      </div>
      {canSubmit && (
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Submitting…" : "Submit to QC"}
        </Button>
      )}
    </form>
  );
}
