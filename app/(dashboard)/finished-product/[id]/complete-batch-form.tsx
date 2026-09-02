"use client";

import { useState } from "react";
import { useActionState } from "react";
import { completeFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { formatNumber } from "@/lib/utils";

type Defaults = {
  wt_total_rm: string | number | null;
  finish_date: string | null;
  expiry_month: string | null;
  qc_sample_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
};

const numOrEmpty = (v: string | number | null) => (v === null || v === undefined || v === "" ? "" : String(v));

export function CompleteBatchForm({ batchId, defaults, unit }: { batchId: string; defaults: Defaults; unit: string }) {
  const boundAction = completeFinishedProductBatch.bind(null, batchId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  // 0021_fp_stability_rnd_qty.sql: QC / Stability / R&D sample quantity
  // can be entered in a unit that differs from the batch's own `unit`
  // (e.g. grams while the batch is tracked in kg) — same "sample unit"
  // pattern Purchase's line form uses (FB-0017). Defaults to the batch's
  // own unit, so re-saving an existing batch without touching this
  // dropdown never re-converts its already-stored values (convertUnit
  // short-circuits when from === to).
  const [sampleUnit, setSampleUnit] = useState(unit);
  const [qcSampleQty, setQcSampleQty] = useState(numOrEmpty(defaults.qc_sample_qty));
  const [stabilityQty, setStabilityQty] = useState(numOrEmpty(defaults.stability_qty));
  const [rndQty, setRndQty] = useState(numOrEmpty(defaults.rnd_qty));

  const sampleUnitDiffers = !!sampleUnit && sampleUnit !== unit;
  const qcConverted = convertUnit(Number(qcSampleQty) || 0, sampleUnit || unit, unit) ?? (Number(qcSampleQty) || 0);
  const stabilityConverted =
    convertUnit(Number(stabilityQty) || 0, sampleUnit || unit, unit) ?? (Number(stabilityQty) || 0);
  const rndConverted = convertUnit(Number(rndQty) || 0, sampleUnit || unit, unit) ?? (Number(rndQty) || 0);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Total weight of RM used (${unit})`} htmlFor="wt_total_rm">
          <Input id="wt_total_rm" name="wt_total_rm" type="number" step="any" min="0" defaultValue={defaults.wt_total_rm ?? ""} />
        </Field>
        <Field label="Finish date" htmlFor="finish_date">
          <Input id="finish_date" name="finish_date" type="date" defaultValue={defaults.finish_date ?? ""} />
        </Field>
        <Field label="Expiry month" htmlFor="expiry_month">
          <Input id="expiry_month" name="expiry_month" type="date" defaultValue={defaults.expiry_month ?? ""} />
        </Field>
        <Field
          label="Sample unit"
          htmlFor="sample_unit"
          hint="For QC/Stability/R&D sample qty below — converted to the batch's own unit on save."
        >
          <Select id="sample_unit" name="sample_unit" value={sampleUnit} onChange={(e) => setSampleUnit(e.target.value)}>
            {compatibleUnits(unit).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="QC sample qty"
          htmlFor="qc_sample_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(qcConverted)} ${unit}` : undefined}
        >
          <Input
            id="qc_sample_qty"
            name="qc_sample_qty"
            type="number"
            step="any"
            min="0"
            value={qcSampleQty}
            onChange={(e) => setQcSampleQty(e.target.value)}
          />
        </Field>
        <Field
          label="Stability sample qty"
          htmlFor="stability_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(stabilityConverted)} ${unit}` : undefined}
        >
          <Input
            id="stability_qty"
            name="stability_qty"
            type="number"
            step="any"
            min="0"
            value={stabilityQty}
            onChange={(e) => setStabilityQty(e.target.value)}
          />
        </Field>
        <Field
          label="R&D sample qty"
          htmlFor="rnd_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(rndConverted)} ${unit}` : undefined}
        >
          <Input
            id="rnd_qty"
            name="rnd_qty"
            type="number"
            step="any"
            min="0"
            value={rndQty}
            onChange={(e) => setRndQty(e.target.value)}
          />
        </Field>
      </div>
      {sampleUnitDiffers && (
        <p className="-mt-2 text-xs text-muted">
          QC / Stability / R&amp;D sample quantities above are in <strong>{sampleUnit}</strong> — converted to{" "}
          <strong>{unit}</strong> automatically when you save.
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save batch details"}
        </Button>
      </div>
    </form>
  );
}
