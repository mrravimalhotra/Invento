"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { UNITS } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";

export type PackagingItemOption = { id: string; item_code: string; name: string; unit: string | null };

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
export function PackagingMaterialsEditor({ packagingItems }: { packagingItems: PackagingItemOption[] }) {
  const [lines, setLines] = useState<MaterialLine[]>([{ itemId: "", quantity: "", unit: "" }]);

  function addLine() {
    setLines((ls) => [...ls, { itemId: "", quantity: "", unit: "" }]);
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));
  }
  function updateLine(i: number, patch: Partial<MaterialLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="lineCount" value={lines.length} />
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
                    name={`item_id_${i}`}
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
                    name={`quantity_${i}`}
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
                    name={`unit_${i}`}
                    value={line.unit}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    required={i === 0}
                  >
                    <option value="">Unit…</option>
                    {UNITS.map((u) => (
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
