"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { entryUnitsFor } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";

export type PackagingItemOption = {
  id: string;
  item_code: string;
  name: string;
  unit: string | null;
  /** Stock on hand in the item's own unit (FB-0052 live check). */
  on_hand?: number;
};

export type MaterialLine = { itemId: string; quantity: string; unit: string };

/**
 * "Allow selection of multiple packaging materials such as bottles, caps
 * etc. Each material can have a different unit/quantity" (Ravi, 3 Sept
 * 2026) — replaces the old single Packaging item / Packaging qty used pair.
 * Same client-side add/remove-row pattern as mfr-line-editor.tsx: renders
 * `lineCount` + item_id_i/quantity_i/unit_i inputs so the bound Server
 * Action (lib/actions/packaging.ts) can reconstruct the material list.
 * Plain named form fields under the hood, so this still degrades to a
 * working (if static) one-row form without JS.
 */
export function PackagingMaterialsEditor({
  packagingItems,
  namePrefix = "",
  compact = false,
  onLinesChange,
  shortItems,
}: {
  packagingItems: PackagingItemOption[];
  /** FB-0052: each packaging line has its own materials; its field names get a prefix such as "ln0_". */
  namePrefix?: string;
  /** FB-0052: stacked rows without a header, for use inside a table cell of the multi-line form. */
  compact?: boolean;
  /** Called with the current material lines after every change. */
  onLinesChange?: (lines: MaterialLine[]) => void;
  /** FB-0052: per material row, true when that material is short on stock — its Quantity box gets a red outline. */
  shortItems?: boolean[];
}) {
  const [lines, setLines] = useState<MaterialLine[]>([{ itemId: "", quantity: "", unit: "" }]);

  // FB-0052: every change is also reported to the parent (the multi-line form
  // checks the materials against stock while the person types).
  function commit(next: MaterialLine[]) {
    setLines(next);
    onLinesChange?.(next);
  }
  function addLine() {
    commit([...lines, { itemId: "", quantity: "", unit: "" }]);
  }
  function removeLine(i: number) {
    if (lines.length > 1) commit(lines.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, patch: Partial<MaterialLine>) {
    commit(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-1.5">
        <input type="hidden" name={`${namePrefix}lineCount`} value={lines.length} />
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="min-w-[9rem] flex-1">
              <Select
                name={`${namePrefix}item_id_${i}`}
                value={line.itemId}
                onChange={(e) => {
                  const item = packagingItems.find((it) => it.id === e.target.value);
                  updateLine(i, { itemId: e.target.value, unit: item?.unit || line.unit || "" });
                }}
                required={i === 0}
                aria-label={`Packaging material ${i + 1}`}
              >
                <option value="">Material…</option>
                {packagingItems.map((it) => (
                  <option key={it.id} value={it.id} data-legacy={isLegacyCode(it.item_code) ? "1" : undefined}>
                    {it.item_code} — {it.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-24 shrink-0">
              <Input
                name={`${namePrefix}quantity_${i}`}
                type="number"
                step="any"
                min="0"
                placeholder="Qty"
                className={shortItems?.[i] ? "border-red ring-1 ring-red focus:border-red focus:ring-red" : undefined}
                aria-invalid={shortItems?.[i] || undefined}
                aria-label={`Quantity used ${i + 1}`}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                required={i === 0}
              />
            </div>
            <div className="w-[5.5rem] shrink-0">
              <Select
                name={`${namePrefix}unit_${i}`}
                value={line.unit}
                onChange={(e) => updateLine(i, { unit: e.target.value })}
                required={i === 0}
                aria-label={`Unit ${i + 1}`}
              >
                <option value="">Unit…</option>
                {entryUnitsFor(packagingItems.find((it) => it.id === line.itemId)?.unit).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              onClick={() => removeLine(i)}
              className="text-muted hover:text-red disabled:opacity-30"
              disabled={lines.length === 1}
              aria-label="Remove material"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div>
          <button type="button" onClick={addLine} className="text-xs font-medium text-brand hover:underline">
            + Add material
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={`${namePrefix}lineCount`} value={lines.length} />
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Packaging material</th>
              <th className="px-3 py-2 w-32">Quantity used</th>
              <th className="px-3 py-2 w-28">Unit</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <Select
                    name={`${namePrefix}item_id_${i}`}
                    value={line.itemId}
                    onChange={(e) => {
                      const item = packagingItems.find((it) => it.id === e.target.value);
                      // Same "item's own unit wins" default as
                      // mfr-line-editor.tsx (FB-0020) — still overridable.
                      updateLine(i, { itemId: e.target.value, unit: item?.unit || line.unit || "" });
                    }}
                    required={i === 0}
                  >
                    <option value="">Select material…</option>
                    {packagingItems.map((it) => (
                      <option key={it.id} value={it.id} data-legacy={isLegacyCode(it.item_code) ? "1" : undefined}>
                        {it.item_code} — {it.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    name={`${namePrefix}quantity_${i}`}
                    type="number"
                    step="any"
                    min="0"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    required={i === 0}
                  />
                </td>
                <td className="px-3 py-2">
                  <Select
                    name={`${namePrefix}unit_${i}`}
                    value={line.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    required={i === 0}
                  >
                    <option value="">Unit…</option>
                    {/* Item's stock unit and units that convert to it (0076). */}
                    {entryUnitsFor(packagingItems.find((it) => it.id === line.itemId)?.unit).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-muted hover:text-red disabled:opacity-30"
                    disabled={lines.length === 1}
                    aria-label="Remove material"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4" /> Add material
        </Button>
      </div>
    </div>
  );
}
