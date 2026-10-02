"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type PackagingItemOption } from "./packaging-materials-editor";

// FB-0052 (2 Oct 2026): a Store / R&D packaging issue can carry several lines
// — each its own Finished Product batch, pack size (quantity + unit),
// unit count and packaging materials — saved together in one go. The date
// and department above are shared by every line. Each line shows the bulk
// product it uses (pack size × unit count, converted to the product's own
// unit), and a summary checks the lines TOGETHER against what is left in
// each batch (the database enforces the same rule when saving).
export const MAX_PACKAGING_LINES = 30;

export type PackagingBatchOption = {
  id: string;
  batch_number: string;
  fp_unit: string | null;
  fp_name: string | null;
  /** Bulk quantity still free to pack or issue, in the product's unit. null = no yield recorded (database check does not apply). */
  left_qty: number | null;
};

type Line = {
  key: number;
  batchId: string;
  qty: string;
  unit: string;
  units: string;
};

function fmt(n: number) {
  return String(Math.round(n * 1e6) / 1e6);
}

export function PackagingLinesEditor({
  fpBatches,
  packagingItems,
}: {
  fpBatches: PackagingBatchOption[];
  packagingItems: PackagingItemOption[];
}) {
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([{ key: 0, batchId: "", qty: "", unit: "", units: "" }]);

  const batchOf = (id: string) => fpBatches.find((b) => b.id === id);

  function addLine() {
    setLines((ls) => {
      if (ls.length >= MAX_PACKAGING_LINES) return ls;
      // New line starts on the same batch as the one above it (the usual case: another pack size of the same batch).
      const prev = ls[ls.length - 1];
      const unit = prev ? prev.unit : "";
      return [
        ...ls,
        {
          key: nextKey.current++,
          batchId: prev?.batchId ?? "",
          qty: "",
          unit,
          units: "",
        },
      ];
    });
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));
  }
  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // Bulk used by one line, in its batch's own unit; null until it can be worked out.
  function usedBy(l: Line): number | null {
    const b = batchOf(l.batchId);
    const q = Number(l.qty);
    const u = Number(l.units);
    if (!b?.fp_unit || !l.unit || !(q > 0) || !(u > 0)) return null;
    const c = convertUnit(q, l.unit, b.fp_unit);
    return c === null ? null : c * u;
  }

  const usedByBatch = new Map<string, number>();
  for (const l of lines) {
    const used = usedBy(l);
    if (used !== null) usedByBatch.set(l.batchId, (usedByBatch.get(l.batchId) ?? 0) + used);
  }
  const anyOver = [...usedByBatch].some(([id, used]) => {
    const left = batchOf(id)?.left_qty;
    return left != null && used > left + 1e-7;
  });

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="pl_count" value={lines.length} />

      {lines.map((l, i) => {
        const b = batchOf(l.batchId);
        const used = usedBy(l);
        return (
          <div key={l.key} className="rounded-md border border-border p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Line {i + 1}</p>
              <button
                type="button"
                onClick={() => removeLine(l.key)}
                className="text-muted hover:text-red disabled:opacity-30"
                disabled={lines.length === 1}
                aria-label={`Remove line ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <Field
              label="Finished product batch"
              htmlFor={`pl_batch_${i}`}
              required
              hint={i === 0 ? "Only Approved batches are listed." : undefined}
            >
              <Select
                id={`pl_batch_${i}`}
                name={`pl_batch_${i}`}
                required
                value={l.batchId}
                onChange={(e) => {
                  const nb = batchOf(e.target.value);
                  // Keep the chosen pack size unit if the new product accepts it, otherwise use the product's own unit.
                  const keep = nb?.fp_unit && l.unit && compatibleUnits(nb.fp_unit).includes(l.unit as never);
                  update(l.key, {
                    batchId: e.target.value,
                    unit: keep ? l.unit : (nb?.fp_unit ?? ""),
                  });
                }}
              >
                <option value="" disabled>
                  Select…
                </option>
                {fpBatches.map((fb) => (
                  <option key={fb.id} value={fb.id} data-legacy={isLegacyCode(fb.batch_number) ? "1" : undefined}>
                    {fb.fp_name ? `${fb.batch_number} — ${fb.fp_name}` : fb.batch_number}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Pack size quantity" htmlFor={`pl_size_qty_${i}`} required>
                <Input
                  id={`pl_size_qty_${i}`}
                  name={`pl_size_qty_${i}`}
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                />
              </Field>
              <Field label="Pack size unit" htmlFor={`pl_size_unit_${i}`} required>
                <Select
                  id={`pl_size_unit_${i}`}
                  name={`pl_size_unit_${i}`}
                  required
                  value={l.unit}
                  onChange={(e) => update(l.key, { unit: e.target.value })}
                  disabled={!b?.fp_unit}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {(b?.fp_unit ? compatibleUnits(b.fp_unit) : []).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Unit count"
                htmlFor={`pl_units_${i}`}
                required
                hint="Packaged units made (bottles, packs, …)."
              >
                <Input
                  id={`pl_units_${i}`}
                  name={`pl_units_${i}`}
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={l.units}
                  onChange={(e) => update(l.key, { units: e.target.value })}
                />
              </Field>
            </div>

            <p className="text-xs text-muted" aria-live="polite">
              {b?.fp_unit
                ? used !== null
                  ? `Bulk product used: ${fmt(used)} ${b.fp_unit} (${l.qty} ${l.unit} × ${l.units}).`
                  : `Bulk product used: enter pack size and unit count (pack size in a unit compatible with ${b.fp_unit}).`
                : "Select a batch to see the bulk product used."}
            </p>

            <Field
              label="Packaging materials"
              required
              hint={
                i === 0
                  ? "Bottles, caps, labels, … used for this line, each with its own quantity and unit."
                  : undefined
              }
            >
              <PackagingMaterialsEditor packagingItems={packagingItems} namePrefix={`ln${i}_`} />
            </Field>
          </div>
        );
      })}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addLine}
          disabled={lines.length >= MAX_PACKAGING_LINES}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        {lines.length >= MAX_PACKAGING_LINES && (
          <span className="ml-2 text-xs text-muted">At most {MAX_PACKAGING_LINES} lines per issue.</span>
        )}
      </div>

      {usedByBatch.size > 0 && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${anyOver ? "border-red/40 bg-red/5" : "border-border bg-black/[0.02]"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">All lines together, per batch</p>
          <ul className="flex flex-col gap-0.5">
            {[...usedByBatch].map(([id, used]) => {
              const b = batchOf(id);
              const left = b?.left_qty;
              const over = left != null && used > left + 1e-7;
              return (
                <li key={id} className={over ? "text-red" : undefined}>
                  {b?.batch_number}: {fmt(used)} {b?.fp_unit} used
                  {left != null ? ` of ${fmt(left)} ${b?.fp_unit} left in the batch` : ""}
                  {over ? " — more than the batch has left" : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
