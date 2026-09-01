"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useActionState } from "react";
import { createPurchaseLine, previewBatchNumber, type ActionState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";
import { formatNumber, isLegacyCode } from "@/lib/utils";

export type RawItemOption = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
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

  const [itemId, setItemId] = useState("");
  const [sampleUnit, setSampleUnit] = useState<string | null>(null);
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
    setSampleUnit(null);
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
    const item = items.find((i) => i.id === id);
    // Pre-fill QC / Stability / R&D from the item's defaults — the actual
    // fix for the Automatic Sampling Deduction gap (DESIGN.md §7.1). Still
    // editable/overridable below.
    if (item) {
      setUnit(item.unit ?? "");
      setQcQty(numOrEmpty(item.default_qc_qty) || "0");
      setStabilityQty(numOrEmpty(item.default_stability_qty) || "0");
      setRndQty(numOrEmpty(item.default_rnd_qty) || "0");
      setSampleUnit(item.default_sample_unit);
    } else {
      setUnit("");
      setQcQty("");
      setStabilityQty("");
      setRndQty("");
      setSampleUnit(null);
    }
    setBatchNumber("");
    if (id) {
      startBatchTransition(async () => {
        const res = await previewBatchNumber(id);
        setBatchNumber(res.batchNumber ?? "");
      });
    }
  }

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const gst = Number(gstPct) || 0;
  const baseAmount = qty * price;
  const gstAmount = baseAmount * (gst / 100);
  const priceInclGst = price * (1 + gst / 100);
  const lineTotal = baseAmount + gstAmount;
  const remainingPreview = qty - (Number(qcQty) || 0) - (Number(stabilityQty) || 0) - (Number(rndQty) || 0);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId} />
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Item" htmlFor="item_id" required>
          <Select id="item_id" name="item_id" required value={itemId} onChange={(e) => handleItemChange(e.target.value)}>
            <option value="">Select item…</option>
            {items.map((i) => (
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
          <Select id="unit" name="unit" required value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Select unit…</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
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
        <Field
          label="QC qty"
          htmlFor="qc_qty"
          hint={sampleUnit ? `In ${unit || "item unit"} — item's sampling default is recorded in ${sampleUnit}.` : "Pre-filled from item default."}
        >
          <Input id="qc_qty" name="qc_qty" type="number" step="any" min="0" value={qcQty} onChange={(e) => setQcQty(e.target.value)} />
        </Field>
        <Field
          label="Stability qty"
          htmlFor="stability_qty"
          hint={sampleUnit ? `In ${unit || "item unit"} — item's sampling default is recorded in ${sampleUnit}.` : "Pre-filled from item default."}
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
          hint={sampleUnit ? `In ${unit || "item unit"} — item's sampling default is recorded in ${sampleUnit}.` : "Pre-filled from item default."}
        >
          <Input id="rnd_qty" name="rnd_qty" type="number" step="any" min="0" value={rndQty} onChange={(e) => setRndQty(e.target.value)} />
        </Field>
      </div>

      {sampleUnit && (
        <p className="-mt-2 text-xs text-amber">
          This item&apos;s default QC / stability / R&amp;D quantities were recorded in <strong>{sampleUnit}</strong>, not{" "}
          {unit || "the item's unit"}. The quantities above are pre-filled as raw numbers — convert them to {unit || "the line's unit"} by
          hand before saving.
        </p>
      )}

      <p className="-mt-2 text-xs text-muted">
        Remaining after sampling (available for production):{" "}
        <strong className="text-foreground">
          {formatNumber(remainingPreview)} {unit}
        </strong>
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Unit price" htmlFor="unit_price">
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
        <Field label="Expiry date" htmlFor="expiry_date" required>
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            required
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-1 rounded-md border border-border bg-black/[0.02] p-3 text-sm sm:grid-cols-3">
        <span>
          GST amount: <strong>{formatNumber(gstAmount)}</strong>
        </span>
        <span>
          Price incl. GST: <strong>{formatNumber(priceInclGst)}</strong>
        </span>
        <span>
          Line total: <strong>{formatNumber(lineTotal)}</strong>
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
