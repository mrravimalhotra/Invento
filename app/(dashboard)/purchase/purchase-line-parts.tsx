"use client";

// Pieces shared by the Add line and Edit line purchase forms
// (purchase-line-form.tsx): the sample quantities, the sampling notes, price
// and GST, the money summary and the figures behind them. Moved here on
// 18 Oct 2026 so a change is made once for both forms.

import { useState } from "react";
import { lineMoney } from "@/lib/money";
import { Field, Input } from "@/components/ui/form";
import { convertUnit } from "@/lib/constants/units";
import { formatNumber, formatQty } from "@/lib/utils";
import { BigQuantityNotice, isMuchLargerThanLast, useLastPurchase } from "./big-quantity-notice";

type Setter = (v: string) => void;

export function useLineFigures(f: {
  quantity: string;
  unit: string;
  sampleUnit: string;
  qcQty: string;
  stabilityQty: string;
  rndQty: string;
  unitPrice: string;
  gstPct: string;
  isRaw: boolean;
}) {
  const qty = Number(f.quantity) || 0;
  // SCAN-P10-06: the same paisa rounding as the order page and the downloads.
  const money = lineMoney({ quantity: qty, unit_price: Number(f.unitPrice) || 0, gst_pct: Number(f.gstPct) || 0 });
  const sampleUnitDiffers = !!f.sampleUnit && !!f.unit && f.sampleUnit !== f.unit;
  const toLineUnit = (v: string) => convertUnit(Number(v) || 0, f.sampleUnit || f.unit, f.unit) ?? (Number(v) || 0);
  const qcConverted = toLineUnit(f.qcQty);
  const stabilityConverted = toLineUnit(f.stabilityQty);
  const rndConverted = toLineUnit(f.rndQty);
  const remainingPreview = qty - qcConverted - stabilityConverted - rndConverted;
  // DES-11: the server and database refuse samples above the quantity; the
  // form now says so before the button is pressed (tiny tolerance so a
  // unit-conversion rounding error is not reported as over-sampling).
  const overSampled = f.isRaw && remainingPreview < -1e-9;
  return { qty, money, sampleUnitDiffers, qcConverted, stabilityConverted, rndConverted, remainingPreview, overSampled };
}

export type LineFigures = ReturnType<typeof useLineFigures>;

/** The "10 times the last purchase" check and its tick box; `key` identifies what was confirmed. */
export function useBigQuantityCheck(itemId: string, excludeLineId: string | undefined, qty: number, unit: string, key: string) {
  const last = useLastPurchase(itemId, excludeLineId);
  const bigVsLast = isMuchLargerThanLast(qty, unit, last);
  const [confirmedKey, setConfirmedKey] = useState("");
  const bigConfirmed = confirmedKey === key;
  const notice =
    bigVsLast && last ? (
      <BigQuantityNotice last={last} confirmed={bigConfirmed} onConfirmedChange={(v) => setConfirmedKey(v ? key : "")} />
    ) : null;
  return { needsBigConfirm: bigVsLast && !bigConfirmed, notice };
}

function NumberInput({ id, value, onChange }: { id: string; value: string; onChange: Setter }) {
  return (
    <Input id={id} name={id} type="number" step="any" min="0" required value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

export function QuantityField({ value, onChange }: { value: string; onChange: Setter }) {
  return (
    <Field label="Quantity received" htmlFor="quantity" required>
      <NumberInput id="quantity" value={value} onChange={onChange} />
    </Field>
  );
}

// Ravi (15 Sept 2026): "make QC, Stability & R&D Sample mandatory along with
// sample unit" — required, but 0 stays a valid, explicitly-entered value (see
// lib/actions/purchase.ts).
export function SampleQtyFields({
  figures,
  unit,
  qcQty,
  setQcQty,
  stabilityQty,
  setStabilityQty,
  rndQty,
  setRndQty,
}: {
  figures: LineFigures;
  unit: string;
  qcQty: string;
  setQcQty: Setter;
  stabilityQty: string;
  setStabilityQty: Setter;
  rndQty: string;
  setRndQty: Setter;
}) {
  const hint = (converted: number) => (figures.sampleUnitDiffers ? `= ${formatQty(converted)} ${unit}` : undefined);
  return (
    <>
      <Field label="QC qty" htmlFor="qc_qty" required hint={hint(figures.qcConverted)}>
        <NumberInput id="qc_qty" value={qcQty} onChange={setQcQty} />
      </Field>
      <Field label="Stability qty" htmlFor="stability_qty" required hint={hint(figures.stabilityConverted)}>
        <NumberInput id="stability_qty" value={stabilityQty} onChange={setStabilityQty} />
      </Field>
      <Field label="R&D qty" htmlFor="rnd_qty" required hint={hint(figures.rndConverted)}>
        <NumberInput id="rnd_qty" value={rndQty} onChange={setRndQty} />
      </Field>
    </>
  );
}

export function SamplingNotes({
  figures,
  isRaw,
  unit,
  sampleUnit,
}: {
  figures: LineFigures;
  isRaw: boolean;
  unit: string;
  sampleUnit: string;
}) {
  return (
    <>
      {isRaw && figures.sampleUnitDiffers && (
        <p className="-mt-2 text-xs text-muted">
          QC / Stability / R&amp;D quantities above are in <strong>{sampleUnit}</strong> — converted to <strong>{unit}</strong>{" "}
          automatically when you save.
        </p>
      )}

      {isRaw && (
        <p className="-mt-2 text-xs text-muted">
          Remaining after sampling (available for production):{" "}
          <strong className="text-foreground">
            {formatQty(figures.remainingPreview)} {unit}
          </strong>
        </p>
      )}
      {figures.overSampled && (
        <p role="alert" className="-mt-2 text-sm text-red">
          QC + Stability + R&amp;D samples ({formatQty(figures.qcConverted + figures.stabilityConverted + figures.rndConverted)}{" "}
          {unit}) are more than the quantity received ({formatQty(figures.qty)} {unit}). Reduce a sample quantity to continue.
        </p>
      )}
    </>
  );
}

export function PriceFields({
  unitPrice,
  setUnitPrice,
  gstPct,
  setGstPct,
}: {
  unitPrice: string;
  setUnitPrice: Setter;
  gstPct: string;
  setGstPct: Setter;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Unit Price (₹)" htmlFor="unit_price" required>
        <NumberInput id="unit_price" value={unitPrice} onChange={setUnitPrice} />
      </Field>
      <Field label="GST %" htmlFor="gst_pct" required>
        <NumberInput id="gst_pct" value={gstPct} onChange={setGstPct} />
      </Field>
    </div>
  );
}

// Ravi (15 Sept 2026): "Reorder amounts in this order (Rate inc GST, Items Total
// Excl GST, GST Amount, Total Cost - do not change labels)".
export function MoneySummary({ figures }: { figures: LineFigures }) {
  const m = figures.money;
  return (
    <div className="grid gap-1 rounded-md border border-border bg-black/[0.02] p-3 text-sm sm:grid-cols-4">
      <span>
        Rate incl. GST(₹): <strong>{formatNumber(m.priceInclGst)}</strong>
      </span>
      <span>
        Item Total Excl GST (₹): <strong>{formatNumber(m.itemTotalExclGst)}</strong>
      </span>
      <span>
        GST amount(₹): <strong>{formatNumber(m.gstAmount)}</strong>
      </span>
      <span>
        Total Cost (₹): <strong>{formatNumber(m.lineTotal)}</strong>
      </span>
    </div>
  );
}
