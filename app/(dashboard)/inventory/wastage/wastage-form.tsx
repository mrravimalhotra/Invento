"use client";

import { useActionState, useMemo, useState } from "react";
import { recordWastage, type ActionState } from "@/lib/actions/inventory";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";
import { formatNumber, isLegacyCode } from "@/lib/utils";

type ItemOption = { id: string; name: string; item_code: string; unit: string | null };
type PurchaseLineOption = {
  id: string;
  item_id: string;
  batch_number: string;
  // Phase 2 (claude/inventory-ledger-redesign.md) — live, not the static
  // generated remaining_qty: already net of FP consumption and any prior
  // wastage against this batch, which is exactly what someone about to
  // record more wastage needs to see.
  live_remaining_qty: string | number;
  unit: string;
};

export function WastageForm({
  items,
  purchaseLines,
}: {
  items: ItemOption[];
  purchaseLines: PurchaseLineOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(recordWastage, undefined);
  const [itemId, setItemId] = useState("");

  const selectedItem = items.find((i) => i.id === itemId);
  const batchesForItem = useMemo(
    () => purchaseLines.filter((pl) => pl.item_id === itemId),
    [purchaseLines, itemId]
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Item" htmlFor="itemId" required>
        <Select
          id="itemId"
          name="itemId"
          required
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">Select an item…</option>
          {items.map((it) => (
            <option key={it.id} value={it.id} data-legacy={isLegacyCode(it.item_code) ? "1" : undefined}>
              {it.name} ({it.item_code})
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Batch (purchase line)"
        htmlFor="purchaseLineId"
        hint="Optional — leave blank for wastage not tied to a specific received batch."
      >
        <Select id="purchaseLineId" name="purchaseLineId" defaultValue="" disabled={!itemId}>
          <option value="">— none —</option>
          {batchesForItem.map((pl) => (
            <option key={pl.id} value={pl.id} data-legacy={isLegacyCode(pl.batch_number) ? "1" : undefined}>
              {pl.batch_number} (remaining {formatNumber(pl.live_remaining_qty)} {pl.unit})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity" htmlFor="quantity" required>
          <Input id="quantity" name="quantity" type="number" step="any" min="0" required />
        </Field>
        <Field label="Unit" htmlFor="unit" required>
          <Select id="unit" name="unit" required defaultValue={selectedItem?.unit ?? ""} key={selectedItem?.unit}>
            <option value="">Select unit…</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Reason" htmlFor="reason" required hint="Recorded with this request; see docs/modules/inventory.md for a schema note on persistence.">
        <Textarea id="reason" name="reason" required rows={3} />
      </Field>

      <div>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Recording…" : "Record wastage"}
        </Button>
      </div>
    </form>
  );
}
