"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { createPurchaseLine, updatePurchaseLine, previewBatchNumber, type ActionState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { UNITS, compatibleUnits, convertUnit } from "@/lib/constants/units";
import { formatNumber, isLegacyCode } from "@/lib/utils";
import type { LineRow } from "./[id]/purchase-lines-table";

export type RawItemOption = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  category: string;
  default_qc_qty: number | string | null;
  default_stability_qty: number | string | null;
  default_rnd_qty: number | string | null;
  default_sample_unit: string | null;
};

const numOrEmpty = (v: number | string | null) => (v === null || v === undefined || v === "" ? "" : String(v));

export function PurchaseLineForm({
  purchaseOrderId,
  items,
}: {
  purchaseOrderId: string;
  items: RawItemOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPurchaseLine, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // Purchase type: which of the two purchasable categories this line is
  // for. Packaging items never go through QC/Stability/R&D sampling (that
  // only ever applied to raw material), so the whole sampling block below
  // is hidden — not just left blank — when "packaging" is selected; the
  // item dropdown is filtered to match so the two lists (~3,500 raw items
  // vs ~80 packaging items) never get mixed together.
  const [category, setCategory] = useState<"raw" | "packaging">("raw");
  const categoryItems = items.filter((i) => i.category === category);
  const isRaw = category === "raw";

  const [itemId, setItemId] = useState("");
  // FB-0017 (2 Sept 2026): the unit QC/Stability/R&D quantity are entered
  // in — independently choosable from the line's own `unit` (e.g. record
  // "5" here in "g" while the line itself is in "kg"). Real conversion
  // happens at submit (lib/actions/purchase.ts) using convertUnit(); this
  // is no longer just a display hint like items.default_sample_unit was.
  const [sampleUnit, setSampleUnit] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [batchPending, startBatchTransition] = useTransition();
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [qcQty, setQcQty] = useState("");
  const [stabilityQty, setStabilityQty] = useState("");
  const [rndQty, setRndQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [gstPct, setGstPct] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  function resetForm() {
    setItemId("");
    setBatchNumber("");
    setQuantity("");
    setUnit("");
    setQcQty("");
    setStabilityQty("");
    setRndQty("");
    setSampleUnit("");
    setUnitPrice("");
    setGstPct("");
    setExpiryDate("");
  }

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      // Clearing controlled field state after a successful submit — bounded,
      // one-shot, not a synchronization loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function handleItemChange(id: string) {
    setItemId(id);
    const item = categoryItems.find((i) => i.id === id);
    if (item) {
      const lineUnit = item.unit ?? "";
      setUnit(lineUnit);
      // Packaging items skip QC/Stability/R&D sampling entirely (never
      // captured, never shown) — only pre-fill these for raw material.
      if (isRaw) {
        // Pre-fill QC / Stability / R&D from the item's defaults — the
        // actual fix for the Automatic Sampling Deduction gap (DESIGN.md
        // §7.1). Still editable/overridable below.
        setQcQty(numOrEmpty(item.default_qc_qty) || "0");
        setStabilityQty(numOrEmpty(item.default_stability_qty) || "0");
        setRndQty(numOrEmpty(item.default_rnd_qty) || "0");
        // Default the sample unit to the item's own default — but only if
        // it's actually convertible into this line's unit (same guard as
        // the dropdown's own option list below); falls back to the line
        // unit itself otherwise, never a silently-wrong default.
        const itemDefault = item.default_sample_unit;
        const validDefault = itemDefault && compatibleUnits(lineUnit).some((u) => u === itemDefault);
        setSampleUnit(validDefault ? (itemDefault as string) : lineUnit);
      }
    } else {
      setUnit("");
      setQcQty("");
      setStabilityQty("");
      setRndQty("");
      setSampleUnit("");
    }
    setBatchNumber("");
    if (id) {
      startBatchTransition(async () => {
        const res = await previewBatchNumber(id);
        setBatchNumber(res.batchNumber ?? "");
      });
    }
  }

  function handleCategoryChange(next: "raw" | "packaging") {
    setCategory(next);
    // Switching category invalidates whatever item/batch/sampling state was
    // picked against the old list — reset everything item-dependent rather
    // than leaving a stale selection from the other category sitting in
    // hidden form state.
    setItemId("");
    setUnit("");
    setQcQty("");
    setStabilityQty("");
    setRndQty("");
    setSampleUnit("");
    setBatchNumber("");
  }

  function handleUnitChange(newUnit: string) {
    setUnit(newUnit);
    // If the currently-picked sample unit no longer belongs to the new
    // line unit's family (e.g. line unit changed from kg to ltr), reset it
    // to match — never leave a stale, now-incompatible sample unit sitting
    // in the dropdown.
    if (!compatibleUnits(newUnit).some((u) => u === sampleUnit)) setSampleUnit(newUnit);
  }

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPct) || 0;
  const baseAmount = qty * price;
  const gstAmount = baseAmount * (gst / 100);
  const priceInclGst = price * (1 + gst / 100);
  const lineTotal = baseAmount + gstAmount;
  const sampleUnitDiffers = !!sampleUnit && !!unit && sampleUnit !== unit;
  const qcConverted = convertUnit(Number(qcQty) || 0, sampleUnit || unit, unit) ?? (Number(qcQty) || 0);
  const stabilityConverted = convertUnit(Number(stabilityQty) || 0, sampleUnit || unit, unit) ?? (Number(stabilityQty) || 0);
  const rndConverted = convertUnit(Number(rndQty) || 0, sampleUnit || unit, unit) ?? (Number(rndQty) || 0);
  const remainingPreview = qty - qcConverted - stabilityConverted - rndConverted;

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId} />
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Purchase type" htmlFor="purchase_category" required>
          <Select
            id="purchase_category"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as "raw" | "packaging")}
          >
            <option value="raw">Raw Material</option>
            <option value="packaging">Packaging Item</option>
          </Select>
        </Field>
      </div>

      <div className={`grid gap-4 ${isRaw ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Field label="Item" htmlFor="item_id" required>
          <Select id="item_id" name="item_id" required value={itemId} onChange={(e) => handleItemChange(e.target.value)}>
            <option value="">Select item…</option>
            {categoryItems.map((i) => (
              <option key={i.id} value={i.id} data-legacy={isLegacyCode(i.item_code) ? "1" : undefined}>
                {i.item_code} — {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch number" hint="Auto-generated when an item is selected.">
          <Input value={batchPending ? "Generating…" : batchNumber} readOnly disabled />
        </Field>
        <Field label="Unit" htmlFor="unit" required>
          <Select id="unit" name="unit" required value={unit} onChange={(e) => handleUnitChange(e.target.value)}>
            <option value="">Select unit…</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        {isRaw && (
          <Field
            label="Sample unit"
            htmlFor="sample_unit"
            hint="For QC/Stability/R&D qty below — converted to the line unit above on save."
          >
            <Select id="sample_unit" name="sample_unit" required value={sampleUnit} onChange={(e) => setSampleUnit(e.target.value)}>
              <option value="">Select…</option>
              {(unit ? compatibleUnits(unit) : UNITS).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className={`grid gap-4 ${isRaw ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Field label="Quantity received" htmlFor="quantity" required>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        {isRaw && (
          <>
        <Field
          label="QC qty"
          htmlFor="qc_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(qcConverted)} ${unit}` : "Pre-filled from item default."}
        >
          <Input id="qc_qty" name="qc_qty" type="number" step="any" min="0" value={qcQty} onChange={(e) => setQcQty(e.target.value)} />
        </Field>
        <Field
          label="Stability qty"
          htmlFor="stability_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(stabilityConverted)} ${unit}` : "Pre-filled from item default."}
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
          label="R&D qty"
          htmlFor="rnd_qty"
          hint={sampleUnitDiffers ? `= ${formatNumber(rndConverted)} ${unit}` : "Pre-filled from item default."}
        >
          <Input id="rnd_qty" name="rnd_qty" type="number" step="any" min="0" value={rndQty} onChange={(e) => setRndQty(e.target.value)} />
        </Field>
          </>
        )}
      </div>

      {isRaw && sampleUnitDiffers && (
        <p className="-mt-2 text-xs text-muted">
          QC / Stability / R&amp;D quantities above are in <strong>{sampleUnit}</strong> — converted to <strong>{unit}</strong>{" "}
          automatically when you save.
        </p>
      )}

      {isRaw && (
        <p className="-mt-2 text-xs text-muted">
          Remaining after sampling (available for production):{" "}
          <strong className="text-foreground">
            {formatNumber(remainingPreview)} {unit}
          </strong>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unit Price (₹)" htmlFor="unit_price">
          <Input
            id="unit_price"
            name="unit_price"
            type="number"
            step="any"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </Field>
        <Field label="GST %" htmlFor="gst_pct">
          <Input id="gst_pct" name="gst_pct" type="number" step="any" min="0" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
        </Field>
        {isRaw && (
          <Field
            label="Re-Test Date"
            htmlFor="expiry_date"
            required
            hint="Once this date arrives, the batch is due to go through QC again using its reserved stability sample."
          >
            <Input
              id="expiry_date"
              name="expiry_date"
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-1 rounded-md border border-border bg-black/[0.02] p-3 text-sm sm:grid-cols-4">
        <span>
          Item Total Excl GST (₹): <strong>{formatNumber(baseAmount)}</strong>
        </span>
        <span>
          GST amount(₹): <strong>{formatNumber(gstAmount)}</strong>
        </span>
        <span>
          Rate incl. GST(₹): <strong>{formatNumber(priceInclGst)}</strong>
        </span>
        <span>
          Total Cost (₹): <strong>{formatNumber(lineTotal)}</strong>
        </span>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add line"}
        </Button>
      </div>
    </form>
  );
}

// FB-0018: edits an existing draft-PO line. Deliberately narrower than
// PurchaseLineForm above — Item, Batch number, and Unit are shown
// read-only (see updatePurchaseLine's own comment in lib/actions/
// purchase.ts for why: batch numbers are per item/year, and unit is a
// label on already-stored numbers, not something safe to relabel without
// converting the stored values). Sample unit still defaults to the
// line's own unit (its qc/stability/rnd values are already stored
// converted into that unit — there's no original "as entered" sample
// unit kept on record), and can still be changed to re-enter/re-convert.
export function EditPurchaseLineForm({ line, onDone }: { line: LineRow; onDone: () => void }) {
  const boundAction = updatePurchaseLine.bind(null, line.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  const unit = line.unit;
  const isRaw = line.item?.category !== "packaging";
  const [sampleUnit, setSampleUnit] = useState(unit);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [qcQty, setQcQty] = useState(String(line.qc_qty));
  const [stabilityQty, setStabilityQty] = useState(String(line.stability_qty));
  const [rndQty, setRndQty] = useState(String(line.rnd_qty));
  const [unitPrice, setUnitPrice] = useState(line.unit_price ?? "");
  const [gstPct, setGstPct] = useState(line.gst_pct ?? "");
  const [expiryDate, setExpiryDate] = useState(line.expiry_date ?? "");

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPct) || 0;
  const baseAmount = qty * price;
  const gstAmount = baseAmount * (gst / 100);
  const priceInclGst = price * (1 + gst / 100);
  const lineTotal = baseAmount + gstAmount;
  const sampleUnitDiffers = sampleUnit !== unit;
  const qcConverted = convertUnit(Number(qcQty) || 0, sampleUnit, unit) ?? (Number(qcQty) || 0);
  const stabilityConverted = convertUnit(Number(stabilityQty) || 0, sampleUnit, unit) ?? (Number(stabilityQty) || 0);
  const rndConverted = convertUnit(Number(rndQty) || 0, sampleUnit, unit) ?? (Number(rndQty) || 0);
  const remainingPreview = qty - qcConverted - stabilityConverted - rndConverted;

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <div className={`grid gap-4 ${isRaw ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Field label="Item">
          <Input value={`${line.item?.item_code ?? ""} — ${line.item?.name ?? ""}`} readOnly disabled />
        </Field>
        <Field label="Batch number">
          <Input value={line.batch_number} readOnly disabled />
        </Field>
        <Field label="Unit" hint="Can't be changed here — delete and re-add the line if the unit itself was wrong.">
          <Input value={unit} readOnly disabled />
        </Field>
        {isRaw && (
          <Field
            label="Sample unit"
            htmlFor="sample_unit"
            hint="For QC/Stability/R&D qty below — converted to the line unit above on save."
          >
            <Select id="sample_unit" name="sample_unit" required value={sampleUnit} onChange={(e) => setSampleUnit(e.target.value)}>
              {compatibleUnits(unit).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className={`grid gap-4 ${isRaw ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <Field label="Quantity received" htmlFor="quantity" required>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="any"
            min="0"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        {isRaw && (
          <>
        <Field label="QC qty" htmlFor="qc_qty" hint={sampleUnitDiffers ? `= ${formatNumber(qcConverted)} ${unit}` : undefined}>
          <Input id="qc_qty" name="qc_qty" type="number" step="any" min="0" value={qcQty} onChange={(e) => setQcQty(e.target.value)} />
        </Field>
        <Field
          label="Stability qty"
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
        <Field label="R&D qty" htmlFor="rnd_qty" hint={sampleUnitDiffers ? `= ${formatNumber(rndConverted)} ${unit}` : undefined}>
          <Input id="rnd_qty" name="rnd_qty" type="number" step="any" min="0" value={rndQty} onChange={(e) => setRndQty(e.target.value)} />
        </Field>
          </>
        )}
      </div>

      {isRaw && sampleUnitDiffers && (
        <p className="-mt-2 text-xs text-muted">
          QC / Stability / R&amp;D quantities above are in <strong>{sampleUnit}</strong> — converted to <strong>{unit}</strong>{" "}
          automatically when you save.
        </p>
      )}

      {isRaw && (
        <p className="-mt-2 text-xs text-muted">
          Remaining after sampling (available for production):{" "}
          <strong className="text-foreground">
            {formatNumber(remainingPreview)} {unit}
          </strong>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unit Price (₹)" htmlFor="unit_price">
          <Input
            id="unit_price"
            name="unit_price"
            type="number"
            step="any"
            min="0"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
          />
        </Field>
        <Field label="GST %" htmlFor="gst_pct">
          <Input id="gst_pct" name="gst_pct" type="number" step="any" min="0" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
        </Field>
        {isRaw && (
          <Field
            label="Re-Test Date"
            htmlFor="expiry_date"
            required
            hint="Once this date arrives, the batch is due to go through QC again using its reserved stability sample."
          >
            <Input
              id="expiry_date"
              name="expiry_date"
              type="date"
              required
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-1 rounded-md border border-border bg-black/[0.02] p-3 text-sm sm:grid-cols-4">
        <span>
          Item Total Excl GST (₹): <strong>{formatNumber(baseAmount)}</strong>
        </span>
        <span>
          GST amount(₹): <strong>{formatNumber(gstAmount)}</strong>
        </span>
        <span>
          Rate incl. GST(₹): <strong>{formatNumber(priceInclGst)}</strong>
        </span>
        <span>
          Total Cost (₹): <strong>{formatNumber(lineTotal)}</strong>
        </span>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
