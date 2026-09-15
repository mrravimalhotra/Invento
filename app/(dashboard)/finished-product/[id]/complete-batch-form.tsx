"use client";

import { useState } from "react";
import { useActionState } from "react";
import { completeFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { formatNumber } from "@/lib/utils";

type Defaults = {
  batch_yield: string | number | null;
  finish_date: string | null;
  expiry_month: string | null;
  qc_sample_qty: string | number | null;
  stability_qty: string | number | null;
  rnd_qty: string | number | null;
};

const numOrEmpty = (v: string | number | null) => (v === null || v === undefined || v === "" ? "" : String(v));

// Ravi (15 Sept 2026): "Once I click on complete batch, I should get
// option to review all information and confirm. In case I want to edit
// something, there should be a 'Back Button' ... which will discard
// information put in Complete batch screen [and] take me to original
// 'Complete Batch' screen." Clarified via AskUserQuestion: Back keeps
// what was typed rather than wiping the form (his exact answer: "Keep
// what was typed"), so every field here is now controlled state instead
// of an uncontrolled defaultValue — nothing is lost switching between
// the editable form and the review summary. Nothing is written to the
// database until Confirm is clicked (the underlying <form>/formAction is
// unchanged; only the visible step changes client-side) — see
// completeFinishedProductBatch in lib/actions/finished-product.ts, which
// now also moves the batch to the new "complete_awaiting_qc" status
// (0047_fp_batch_complete_awaiting_qc.sql) on that same save.
export function CompleteBatchForm({ batchId, defaults, unit }: { batchId: string; defaults: Defaults; unit: string }) {
  const boundAction = completeFinishedProductBatch.bind(null, batchId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  const [step, setStep] = useState<"form" | "review">("form");
  const [clientError, setClientError] = useState<string | undefined>(undefined);

  const [batchYield, setBatchYield] = useState(numOrEmpty(defaults.batch_yield));
  const [finishDate, setFinishDate] = useState(defaults.finish_date ?? "");
  const [expiryMonth, setExpiryMonth] = useState(defaults.expiry_month ?? "");

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

  // If the actual save comes back with a server-side error (e.g. samples
  // exceeding batch yield), drop back to the editable form so the values
  // that caused it are visible and fixable, rather than leaving the user
  // stuck on a review screen that shows numbers but no inputs to change.
  // Adjusted during render (React's documented pattern for reacting to a
  // prop/state change without an effect — see "Adjusting state when a
  // prop changes" in the React docs) rather than in a useEffect, which
  // the repo's lint config flags for a synchronous setState.
  const [lastSeenError, setLastSeenError] = useState(state?.error);
  if (state?.error !== lastSeenError) {
    setLastSeenError(state?.error);
    if (state?.error) setStep("form");
  }

  function goToReview() {
    if (!batchYield || Number(batchYield) <= 0) {
      setClientError("Batch yield is required and must be greater than 0.");
      return;
    }
    if (!finishDate) {
      setClientError("Finish date is required.");
      return;
    }
    if (!expiryMonth) {
      setClientError("Expiry date is required.");
      return;
    }
    if (!sampleUnit) {
      setClientError("Sample unit is required.");
      return;
    }
    if (!qcSampleQty || Number(qcSampleQty) <= 0) {
      setClientError("QC sample qty is required and must be greater than 0.");
      return;
    }
    if (!stabilityQty || Number(stabilityQty) <= 0) {
      setClientError("Stability sample qty is required and must be greater than 0.");
      return;
    }
    if (!rndQty || Number(rndQty) <= 0) {
      setClientError("R&D sample qty is required and must be greater than 0.");
      return;
    }
    setClientError(undefined);
    setStep("review");
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {step === "form" && (
        <p className="text-sm text-muted">
          All fields below are required and saved together — the batch is only truly &ldquo;finished&rdquo; once every
          one of them is known, so this screen doesn&apos;t support a partial/in-progress save.
        </p>
      )}
      {step === "form" && clientError && <p className="text-sm text-red">{clientError}</p>}
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      <div className={step === "form" ? "grid gap-4 sm:grid-cols-3" : "hidden"}>
        <Field
          label={`Batch yield (${unit})`}
          htmlFor="batch_yield"
          required
          hint="How much Finished Product this batch actually produced."
        >
          <Input
            id="batch_yield"
            name="batch_yield"
            type="number"
            step="any"
            min="0"
            required
            value={batchYield}
            onChange={(e) => setBatchYield(e.target.value)}
          />
        </Field>
        <Field label="Finish date" htmlFor="finish_date" required>
          <Input
            id="finish_date"
            name="finish_date"
            type="date"
            required
            value={finishDate}
            onChange={(e) => setFinishDate(e.target.value)}
          />
        </Field>
        {/* Ravi (15 Sept 2026): Expiry date is now mandatory here and here
            only — it's dropped entirely from batch creation (Step 1),
            since it can only really be known once the batch is finished.
            FB-0025 (12 Sept 2026) already renamed this field's label from
            "Expiry Month" — the underlying column is still named
            `expiry_month` (a real `date`, not a display label; see the
            "Best Before" month/year rendering in labels/label-picker.tsx,
            which reads this same column and is unaffected by any of this). */}
        <Field label="Expiry date" htmlFor="expiry_month" required>
          <Input
            id="expiry_month"
            name="expiry_month"
            type="date"
            required
            value={expiryMonth}
            onChange={(e) => setExpiryMonth(e.target.value)}
          />
        </Field>
        <Field
          label="Sample unit"
          htmlFor="sample_unit"
          required
          hint="For QC/Stability/R&D sample qty below — converted to the batch's own unit on save."
        >
          <Select id="sample_unit" name="sample_unit" required value={sampleUnit} onChange={(e) => setSampleUnit(e.target.value)}>
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
          required
          hint={sampleUnitDiffers ? `= ${formatNumber(qcConverted)} ${unit}` : undefined}
        >
          <Input
            id="qc_sample_qty"
            name="qc_sample_qty"
            type="number"
            step="any"
            min="0"
            required
            value={qcSampleQty}
            onChange={(e) => setQcSampleQty(e.target.value)}
          />
        </Field>
        <Field
          label="Stability sample qty"
          htmlFor="stability_qty"
          required
          hint={sampleUnitDiffers ? `= ${formatNumber(stabilityConverted)} ${unit}` : undefined}
        >
          <Input
            id="stability_qty"
            name="stability_qty"
            type="number"
            step="any"
            min="0"
            required
            value={stabilityQty}
            onChange={(e) => setStabilityQty(e.target.value)}
          />
        </Field>
        <Field
          label="R&D sample qty"
          htmlFor="rnd_qty"
          required
          hint={sampleUnitDiffers ? `= ${formatNumber(rndConverted)} ${unit}` : undefined}
        >
          <Input
            id="rnd_qty"
            name="rnd_qty"
            type="number"
            step="any"
            min="0"
            required
            value={rndQty}
            onChange={(e) => setRndQty(e.target.value)}
          />
        </Field>
      </div>
      {step === "form" && sampleUnitDiffers && (
        <p className="-mt-2 text-xs text-muted">
          QC / Stability / R&amp;D sample quantities above are in <strong>{sampleUnit}</strong> — converted to{" "}
          <strong>{unit}</strong> automatically when you save.
        </p>
      )}

      {step === "review" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Review the details below before confirming. Confirming saves this batch and moves it to{" "}
            <strong>Complete - Awaiting QC</strong>. Back returns to the form above with everything you typed still
            in place.
          </p>
          <div className="grid gap-3 rounded-lg border border-border bg-black/[0.02] p-4 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted">Batch yield</span>
              <p className="mt-1 font-medium">
                {formatNumber(batchYield)} {unit}
              </p>
            </div>
            <div>
              <span className="text-muted">Finish date</span>
              <p className="mt-1 font-medium">{finishDate}</p>
            </div>
            <div>
              <span className="text-muted">Expiry date</span>
              <p className="mt-1 font-medium">{expiryMonth}</p>
            </div>
            <div>
              <span className="text-muted">Sample unit</span>
              <p className="mt-1 font-medium">{sampleUnit}</p>
            </div>
            <div>
              <span className="text-muted">QC sample qty</span>
              <p className="mt-1 font-medium">
                {formatNumber(qcSampleQty)} {sampleUnit}
                {sampleUnitDiffers && ` (= ${formatNumber(qcConverted)} ${unit})`}
              </p>
            </div>
            <div>
              <span className="text-muted">Stability sample qty</span>
              <p className="mt-1 font-medium">
                {formatNumber(stabilityQty)} {sampleUnit}
                {sampleUnitDiffers && ` (= ${formatNumber(stabilityConverted)} ${unit})`}
              </p>
            </div>
            <div>
              <span className="text-muted">R&amp;D sample qty</span>
              <p className="mt-1 font-medium">
                {formatNumber(rndQty)} {sampleUnit}
                {sampleUnitDiffers && ` (= ${formatNumber(rndConverted)} ${unit})`}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {step === "form" && (
          <Button type="button" onClick={goToReview}>
            Complete batch
          </Button>
        )}
        {step === "review" && (
          <>
            <Button type="button" variant="secondary" onClick={() => setStep("form")} disabled={pending}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Confirming…" : "Confirm"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
