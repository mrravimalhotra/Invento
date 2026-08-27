"use client";

import { useActionState, useMemo, useState } from "react";
import { createQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export type PendingLine = {
  id: string;
  batch_number: string;
  qc_qty: string | number | null;
  unit: string | null;
  expiry_date: string | null;
  item_id: string;
  items: { item_code: string; name: string } | null;
};

export function QcAssignForm({ lines }: { lines: PendingLine[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createQualityCheck, undefined);

  const items = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lines) {
      if (!map.has(l.item_id)) map.set(l.item_id, l.items ? `${l.items.item_code} — ${l.items.name}` : l.item_id);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
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

  function handleBatchChange(nextLineId: string) {
    setPurchaseLineId(nextLineId);
    const line = lines.find((l) => l.id === nextLineId);
    setSampleQty(line?.qc_qty !== null && line?.qc_qty !== undefined ? String(line.qc_qty) : "");
    setSampleUnit(line?.unit ?? "");
    setExpiryDate(line?.expiry_date ?? "");
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Item" htmlFor="item_id" required>
        <Select id="item_id" value={itemId} onChange={(e) => handleItemChange(e.target.value)} required>
          <option value="">Select item…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
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
            <option key={l.id} value={l.id}>
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
