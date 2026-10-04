"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useMemo, useState } from "react";
import { recordWastage, type ActionState } from "@/lib/actions/inventory";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits } from "@/lib/constants/units";
import { isLegacyCode, formatQty } from "@/lib/utils";

type ItemOption = { id: string; name: string; item_code: string; unit: string | null };
type PurchaseLineOption = {
  id: string;
  item_id: string;
  batch_number: string;
  is_legacy?: boolean | null;
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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(recordWastage, undefined);
  const [itemId, setItemId] = useState("");
  const [lineId, setLineId] = useState("");

  const batchesForItem = useMemo(
    () => purchaseLines.filter((pl) => pl.item_id === itemId),
    [purchaseLines, itemId]
  );
  // FB-0033/FB-0034 (13 Sept 2026): batch is now required for every new
  // wastage entry. An item with no received (submitted) purchase lines on
  // file has nothing to pick, so wastage genuinely can't be recorded for
  // it yet — surfaced explicitly rather than leaving a required select
  // stuck on an empty "Select a batch…" placeholder with no explanation.
  const noBatchesForItem = itemId !== "" && batchesForItem.length === 0;
  const selectedBatch = batchesForItem.find((pl) => pl.id === lineId);
  // SEC-06 (28 Sept 2026): wastage is recorded in the batch's own unit.
  // The Unit list shows the batch's unit (the default) plus only units that
  // convert to it (e.g. g/mg for a kg batch); record_wastage() converts on
  // save and refuses anything else. Previously this offered every unit and
  // defaulted to the item's unit, so "500 g" against a kg batch removed
  // 500 kg.
  const unitOptions = selectedBatch ? compatibleUnits(selectedBatch.unit) : [];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Item" htmlFor="itemId" required>
        <Select
          id="itemId"
          name="itemId"
          required
          value={itemId}
          onChange={(e) => {
            setItemId(e.target.value);
            setLineId("");
          }}
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
        required
        hint={
          noBatchesForItem
            ? "No received batches on file for this item — wastage can't be recorded without one."
            : "The received batch this wastage came from."
        }
      >
        <Select
          id="purchaseLineId"
          name="purchaseLineId"
          required
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          disabled={!itemId || noBatchesForItem}
        >
          <option value="">Select a batch…</option>
          {batchesForItem.map((pl) => (
            <option key={pl.id} value={pl.id} data-legacy={isLegacyCode(pl.batch_number) ? "1" : undefined}>
              {pl.batch_number}{pl.is_legacy ? " (Legacy)" : ""} (remaining {formatQty(pl.live_remaining_qty)} {pl.unit})
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity" htmlFor="quantity" required>
          <Input id="quantity" name="quantity" type="number" step="any" min="0" required />
        </Field>
        <Field
          label="Unit"
          htmlFor="unit"
          required
          hint={
            selectedBatch && unitOptions.length > 1
              ? `Batch is held in ${selectedBatch.unit}; other units are converted when saved.`
              : undefined
          }
        >
          <Select
            id="unit"
            name="unit"
            required
            defaultValue={selectedBatch?.unit ?? ""}
            key={selectedBatch?.id ?? "no-batch"}
            disabled={!selectedBatch}
          >
            <option value="">{selectedBatch ? "Select unit…" : "Select a batch first"}</option>
            {selectedBatch && unitOptions.length === 0 && (
              <option value={selectedBatch.unit}>{selectedBatch.unit}</option>
            )}
            {unitOptions.map((u) => (
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
        <Button type="submit" variant="danger" disabled={pending || noBatchesForItem}>
          {pending ? "Recording…" : "Record wastage"}
        </Button>
      </div>
    </form>
  );
}
