"use client";

import { useActionState, useMemo, useState } from "react";
import { createQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { isLegacyCode } from "@/lib/utils";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";

export type PendingLine = {
  id: string;
  batch_number: string;
  qc_qty: string | number | null;
  unit: string | null;
  expiry_date: string | null;
  item_id: string;
  items: { item_code: string; name: string; default_sample_unit: string | null } | null;
};

export function QcAssignForm({ lines }: { lines: PendingLine[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createQualityCheck, undefined);

  const items = useMemo(() => {
    const map = new Map<string, { label: string; legacy: boolean }>();
    for (const l of lines) {
      if (!map.has(l.item_id)) {
        map.set(l.item_id, {
          label: l.items ? `${l.items.item_code} — ${l.items.name}` : l.item_id,
          legacy: isLegacyCode(l.items?.item_code),
        });
      }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [lines]);

  const [itemId, setItemId] = useState("");
  const [purchaseLineId, setPurchaseLineId] = useState("");
  const [sampleQty, setSampleQty] = useState("");
  const [sampleUnit, setSampleUnit] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const batchesForItem = useMemo(() => lines.filter((l) => l.item_id === itemId), [lines, itemId]);

  function handleItemChange(nextItemId: string) {
    setItemId(nextItemId);
    setPurchaseLineId("");
    setSampleQty("");
    setSampleUnit("");
    setExpiryDate("");
  }

  // FB-0021 ("sample quantity and Sample unit should be auto populated
  // from defaults given at the time of raw material creation"): the
  // purchase line's own qc_qty is still the authoritative recorded
  // amount for this specific batch (already converted into the line's
  // unit at purchase time, FB-0017) — but shown here re-expressed in the
  // item's own default_sample_unit when that's compatible with the line's
  // unit, same "validDefault" convention Purchase's Add-line form uses,
  // rather than always falling back to the line's own (often larger, e.g.
  // "kg") unit.
  function handleBatchChange(nextLineId: string) {
    setPurchaseLineId(nextLineId);
    const line = lines.find((l) => l.id === nextLineId);
    const lineUnit = line?.unit ?? "";
    const itemDefault = line?.items?.default_sample_unit ?? null;
    const validDefault = !!itemDefault && !!lineUnit && compatibleUnits(lineUnit).some((u) => u === itemDefault);
    const displayUnit = validDefault ? (itemDefault as string) : lineUnit;

    const rawQty = line?.qc_qty !== null && line?.qc_qty !== undefined ? Number(line.qc_qty) : null;
    const converted = rawQty !== null && lineUnit ? convertUnit(rawQty, lineUnit, displayUnit) : null;
    setSampleQty(converted !== null ? String(converted) : rawQty !== null ? String(rawQty) : "");
    setSampleUnit(displayUnit);
    setExpiryDate(line?.expiry_date ?? "");
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Item" htmlFor="item_id" required>
        <Select id="item_id" value={itemId} onChange={(e) => handleItemChange(e.target.value)} required>
          <option value="">Select item…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id} data-legacy={it.legacy ? "1" : undefined}>
              {it.label}
            </option>
          ))}
        </Select>
        {items.length === 0 && (
          <p className="mt-1 text-xs text-muted">No batches are currently awaiting QC.</p>
        )}
      </Field>

      <Field label="Batch" htmlFor="purchase_line_id" required>
        <Select
          id="purchase_line_id"
          name="purchase_line_id"
          value={purchaseLineId}
          onChange={(e) => handleBatchChange(e.target.value)}
          required
          disabled={!itemId}
        >
          <option value="">Select batch…</option>
          {batchesForItem.map((l) => (
            <option key={l.id} value={l.id} data-legacy={isLegacyCode(l.batch_number) ? "1" : undefined}>
              {l.batch_number}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Sample quantity" htmlFor="sample_qty">
          <Input
            id="sample_qty"
            name="sample_qty"
            type="number"
            step="any"
            min={0}
            value={sampleQty}
            onChange={(e) => setSampleQty(e.target.value)}
          />
        </Field>
        <Field label="Sample unit" htmlFor="sample_unit">
          <Input id="sample_unit" name="sample_unit" value={sampleUnit} onChange={(e) => setSampleUnit(e.target.value)} />
        </Field>
      </div>

      <Field label="Expiry date" htmlFor="expiry_date" required hint="Pre-filled from the batch — adjust if the QC sample's expiry differs.">
        <Input
          id="expiry_date"
          name="expiry_date"
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          required
        />
      </Field>

      <p className="text-xs text-muted">The AR number is assigned automatically on save.</p>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !purchaseLineId}>
          {pending ? "Saving…" : "Create AR"}
        </Button>
        <LinkButton href="/qc" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
