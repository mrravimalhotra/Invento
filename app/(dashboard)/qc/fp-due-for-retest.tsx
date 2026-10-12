"use client";

import { useFlashActionState } from "@/lib/use-flash-action";

import { startFpRetestQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { compatibleUnits } from "@/lib/constants/units";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { formatDate, formatQty, isLegacyCode } from "@/lib/utils";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";

export type FpDueForRetestLine = {
  batch_id: string;
  item_code: string | null;
  item_name: string | null;
  batch_label: string;
  unit: string;
  qc_sample_qty: string | number | null;
  stability_reserve_left: string | number | null;
  bulk_left: string | number | null;
  retest_date: string | null;
  expiry_date: string | null;
  is_legacy?: boolean;
};

// "Finished product due for retest" (SCAN-P4-04, 12 Oct 2026): the same retest cycle as raw
// material. The sample is drawn from the batch's stability sample first, then from its bulk
// (start_fp_retest(), migration 0120). Each row is its own form so one batch's error never
// affects the others. Respects the app-wide "Hide legacy data" preference like the other cards.
export function FpDueForRetest({ lines, canStart }: { lines: FpDueForRetestLine[]; canStart: boolean }) {
  const [hideLegacy] = useHideLegacy();
  const visible = hideLegacy
    ? lines.filter((l) => !isLegacyCode(l.item_code) && !isLegacyCode(l.batch_label))
    : lines;

  if (visible.length === 0) return null;

  return (
    <Card className="mb-4 border-amber/40">
      <CardHeader title="Finished product due for retest" />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Retest date has arrived on these approved finished product batches. Enter the retest sample: it comes from the
          batch&apos;s stability sample first, then from its bulk. Until the retest is approved the batch cannot be packed or labelled.
        </p>
        <div className="flex flex-col gap-2">
          {visible.map((line) => (
            <FpDueForRetestRow key={line.batch_id} line={line} canStart={canStart} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function FpDueForRetestRow({ line, canStart }: { line: FpDueForRetestLine; canStart: boolean }) {
  const boundAction = startFpRetestQualityCheck.bind(null, line.batch_id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const reserveLeft = Number(line.stability_reserve_left ?? 0);
  const bulkLeft = Number(line.bulk_left ?? 0);
  const defaultSample = Number(line.qc_sample_qty ?? 0) > 0 ? String(line.qc_sample_qty) : "";

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber/30 bg-amber-bg/40 px-3 py-2 text-sm"
    >
      <div>
        <p className="font-medium">
          {line.item_code ? `${line.item_code} — ${line.item_name ?? ""}` : (line.item_name ?? "—")} · {line.batch_label}
          <LegacyTag show={line.is_legacy} />
        </p>
        <p className="text-xs text-muted">
          Stability sample left: {formatQty(reserveLeft)} {line.unit} · Bulk left: {formatQty(bulkLeft)} {line.unit}
          {line.retest_date ? ` · Retest date ${formatDate(line.retest_date)}` : ""}
          {line.expiry_date ? ` · Expires ${formatDate(line.expiry_date)}` : ""}
        </p>
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
      </div>
      {canStart && (
        <div className="flex items-center gap-2">
          <Input
            name="sample_qty"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={defaultSample}
            aria-label={`Retest sample quantity for ${line.batch_label}`}
            className="w-24"
          />
          <Select name="sample_unit" defaultValue={line.unit} aria-label="Sample unit" className="w-20">
            {compatibleUnits(line.unit).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Starting…" : "Start Retest"}
          </Button>
        </div>
      )}
    </form>
  );
}
