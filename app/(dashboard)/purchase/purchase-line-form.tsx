"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { createPurchaseLine, updatePurchaseLine, previewBatchNumber, type ActionState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { UNITS, compatibleUnits, convertUnit, entryUnitsFor } from "@/lib/constants/units";
import { isLegacyCode, formatQty } from "@/lib/utils";
import type { LineRow } from "./[id]/purchase-lines-table";
import {
  MoneySummary,
  PriceFields,
  QuantityField,
  SampleQtyFields,
  SamplingNotes,
  useBigQuantityCheck,
  useLineFigures,
} from "./purchase-line-parts";

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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(createPurchaseLine, undefined);
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
  // The item's stock unit — every quantity is saved in it (0076).
  const itemStockUnit = categoryItems.find((i) => i.id === itemId)?.unit ?? null;
  const [unit, setUnit] = useState("");
  const [qcQty, setQcQty] = useState("");
  const [stabilityQty, setStabilityQty] = useState("");
  const [rndQty, setRndQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [gstPct, setGstPct] = useState("");

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
  }

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      // Clearing controlled field state after a successful submit — bounded,
      // one-shot, not a synchronization loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resetForm();
    }
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
        //
        // Ravi (15 Sept 2026): "all numerical value where i have to type
        // values, quantity or price should not default to 0" — these
        // three used to fall back to "0" whenever an item had no real
        // configured default (numOrEmpty(...) || "0"), which is nearly
        // every item now that Item Master stopped capturing default
        // sample quantities at all (2 Sept 2026 — docs/modules/
        // items.md). That silent "0" defeated the point of making these
        // fields mandatory (FB pass earlier today): a user could submit
        // without ever having looked at them. Dropped the `|| "0"` — a
        // genuine configured default (a legacy item that still has one)
        // still pre-fills, since that's real data, not a guess; an item
        // with no default now leaves the field genuinely blank, forcing
        // a conscious entry.
        setQcQty(numOrEmpty(item.default_qc_qty));
        setStabilityQty(numOrEmpty(item.default_stability_qty));
        setRndQty(numOrEmpty(item.default_rnd_qty));
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

  const figures = useLineFigures({ quantity, unit, sampleUnit, qcQty, stabilityQty, rndQty, unitPrice, gstPct, isRaw });
  const { needsBigConfirm, notice: bigNotice } = useBigQuantityCheck(itemId, undefined, figures.qty, unit, `${itemId}|${quantity}|${unit}`);

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
        <Field
          label="Unit"
          htmlFor="unit"
          required
          hint={
            itemStockUnit && unit && unit !== itemStockUnit
              ? `Stock is kept in ${itemStockUnit}: this line is saved as ${formatQty(convertUnit(Number(quantity) || 0, unit, itemStockUnit) ?? 0)} ${itemStockUnit}, and the unit price as per ${itemStockUnit}.`
              : undefined
          }
        >
          <Select id="unit" name="unit" required value={unit} onChange={(e) => handleUnitChange(e.target.value)}>
            <option value="">Select unit…</option>
            {entryUnitsFor(itemStockUnit).map((u) => (
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
            required
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
        <QuantityField value={quantity} onChange={setQuantity} />
        {isRaw && (
          <SampleQtyFields
            figures={figures}
            unit={unit}
            qcQty={qcQty}
            setQcQty={setQcQty}
            stabilityQty={stabilityQty}
            setStabilityQty={setStabilityQty}
            rndQty={rndQty}
            setRndQty={setRndQty}
          />
        )}
      </div>

      <SamplingNotes figures={figures} isRaw={isRaw} unit={unit} sampleUnit={sampleUnit} />

      {bigNotice}

      <PriceFields unitPrice={unitPrice} setUnitPrice={setUnitPrice} gstPct={gstPct} setGstPct={setGstPct} />

      <MoneySummary figures={figures} />

      <div>
        <Button type="submit" disabled={pending || figures.overSampled || needsBigConfirm}>
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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);

  const unit = line.unit;
  const isRaw = line.item?.category !== "packaging";
  const [sampleUnit, setSampleUnit] = useState(unit);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [qcQty, setQcQty] = useState(String(line.qc_qty));
  const [stabilityQty, setStabilityQty] = useState(String(line.stability_qty));
  const [rndQty, setRndQty] = useState(String(line.rnd_qty));
  const [unitPrice, setUnitPrice] = useState(line.unit_price ?? "");
  const [gstPct, setGstPct] = useState(line.gst_pct ?? "");

  // Reacts to each new save result only; onDone is read at that moment (a new
  // onDone from the parent does not re-run it).
  const onResult = useEffectEvent((result: ActionState) => {
    if (result?.success) onDone();
  });
  useEffect(() => onResult(state), [state]);

  const figures = useLineFigures({ quantity, unit, sampleUnit, qcQty, stabilityQty, rndQty, unitPrice, gstPct, isRaw });
  const { needsBigConfirm, notice: bigNotice } = useBigQuantityCheck(line.item_id, line.id, figures.qty, unit, `${line.id}|${quantity}|${unit}`);

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
            required
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
        <QuantityField value={quantity} onChange={setQuantity} />
        {isRaw && (
          <SampleQtyFields
            figures={figures}
            unit={unit}
            qcQty={qcQty}
            setQcQty={setQcQty}
            stabilityQty={stabilityQty}
            setStabilityQty={setStabilityQty}
            rndQty={rndQty}
            setRndQty={setRndQty}
          />
        )}
      </div>

      <SamplingNotes figures={figures} isRaw={isRaw} unit={unit} sampleUnit={sampleUnit} />

      {bigNotice}

      <PriceFields unitPrice={unitPrice} setUnitPrice={setUnitPrice} gstPct={gstPct} setGstPct={setGstPct} />

      <MoneySummary figures={figures} />

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || figures.overSampled || needsBigConfirm}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
