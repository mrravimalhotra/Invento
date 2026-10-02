"use client";

import { useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type PackagingItemOption } from "./packaging-materials-editor";

// FB-0052 (2 Oct 2026): a Store / R&D packaging issue can carry several lines
// — each its own Finished Product batch, pack size (quantity + unit),
// unit count and packaging materials — saved together in one go. The date
// and department above are shared by every line. Each line shows the bulk
// product it uses (pack size × unit count, converted to the product's own
// unit), and the cards below check the lines TOGETHER against what is left
// in each batch (the database enforces the same rule when saving).
export const MAX_PACKAGING_LINES = 30;

export type PackagingBatchOption = {
  id: string;
  batch_number: string;
  fp_unit: string | null;
  fp_name: string | null;
  /** Bulk quantity still free to pack or issue, in the product's unit. null = no yield recorded (database check does not apply). */
  left_qty: number | null;
};

type Line = { key: number; batchId: string; qty: string; unit: string; units: string };

function fmt(n: number) {
  return String(Math.round(n * 1e6) / 1e6);
}

export function PackagingLinesEditor({
  fpBatches,
  packagingItems,
  footerAction,
}: {
  fpBatches: PackagingBatchOption[];
  packagingItems: PackagingItemOption[];
  /** Rendered at the right of the footer row (Cancel / Save), given the current number of lines. */
  footerAction: (lineCount: number) => ReactNode;
}) {
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([{ key: 0, batchId: "", qty: "", unit: "", units: "" }]);

  const batchOf = (id: string) => fpBatches.find((b) => b.id === id);

  function addLine() {
    setLines((ls) => {
      if (ls.length >= MAX_PACKAGING_LINES) return ls;
      // A new line starts on the same batch as the one above it (the usual case: another pack size of the same batch).
      const prev = ls[ls.length - 1];
      return [
        ...ls,
        { key: nextKey.current++, batchId: prev?.batchId ?? "", qty: "", unit: prev?.unit ?? "", units: "" },
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

  // Per batch: each line's use, in line order.
  const usesByBatch = new Map<string, number[]>();
  for (const l of lines) {
    const used = usedBy(l);
    if (used !== null) usesByBatch.set(l.batchId, [...(usesByBatch.get(l.batchId) ?? []), used]);
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="pl_count" value={lines.length} />

      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold text-muted">
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2 w-[23%]">
                Finished product batch<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 w-[17%]">
                Pack size<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 min-w-[6.5rem]">
                Unit count<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 w-[14%]">Bulk product used</th>
              <th className="px-3 py-2">
                Packaging materials<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const b = batchOf(l.batchId);
              const used = usedBy(l);
              const sameAsAbove = i > 0 && l.batchId !== "" && lines[i - 1].batchId === l.batchId;
              return (
                <tr key={l.key} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-3 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Select
                      name={`pl_batch_${i}`}
                      required
                      value={l.batchId}
                      aria-label={`Line ${i + 1} finished product batch`}
                      onChange={(e) => {
                        const nb = batchOf(e.target.value);
                        // Keep the chosen pack size unit if the new product accepts it, otherwise use the product's own unit.
                        const keep = nb?.fp_unit && l.unit && compatibleUnits(nb.fp_unit).includes(l.unit as never);
                        update(l.key, { batchId: e.target.value, unit: keep ? l.unit : (nb?.fp_unit ?? "") });
                      }}
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {fpBatches.map((fb) => (
                        <option key={fb.id} value={fb.id} data-legacy={isLegacyCode(fb.batch_number) ? "1" : undefined}>
                          {fb.fp_name ? `${fb.batch_number} · ${fb.fp_name}` : fb.batch_number}
                          {fb.fp_unit ? ` (${fb.fp_unit})` : ""}
                        </option>
                      ))}
                    </Select>
                    {sameAsAbove && <p className="mt-1 text-xs text-muted">same batch, other pack size</p>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <div className="w-16 shrink-0">
                        <Input
                          name={`pl_size_qty_${i}`}
                          type="number"
                          step="any"
                          min="0"
                          required
                          placeholder="Qty"
                          aria-label={`Line ${i + 1} pack size quantity`}
                          value={l.qty}
                          onChange={(e) => update(l.key, { qty: e.target.value })}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Select
                          name={`pl_size_unit_${i}`}
                          required
                          value={l.unit}
                          aria-label={`Line ${i + 1} pack size unit`}
                          onChange={(e) => update(l.key, { unit: e.target.value })}
                          disabled={!b?.fp_unit}
                        >
                          <option value="" disabled>
                            Unit…
                          </option>
                          {(b?.fp_unit ? compatibleUnits(b.fp_unit) : []).map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      name={`pl_units_${i}`}
                      type="number"
                      step="any"
                      min="0"
                      required
                      aria-label={`Line ${i + 1} unit count`}
                      value={l.units}
                      onChange={(e) => update(l.key, { units: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div
                      aria-live="polite"
                      className={`rounded-md px-3 py-2 text-xs ${
                        used !== null ? "bg-brand-light text-brand-dark" : "bg-black/[0.04] text-muted"
                      }`}
                    >
                      {used !== null && b?.fp_unit ? (
                        <>
                          {l.qty} {l.unit} × {l.units} ={" "}
                          <strong>
                            {fmt(used)} {b.fp_unit}
                          </strong>
                        </>
                      ) : b?.fp_unit ? (
                        `fills in from pack size × unit count`
                      ) : (
                        "select a batch"
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PackagingMaterialsEditor packagingItems={packagingItems} namePrefix={`ln${i}_`} compact />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-muted hover:text-red disabled:opacity-30"
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {usesByBatch.size > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {[...usesByBatch].map(([id, uses]) => {
            const b = batchOf(id);
            const total = uses.reduce((a, c) => a + c, 0);
            const left = b?.left_qty ?? null;
            const over = left !== null && total > left + 1e-7;
            const pct = left && left > 0 ? Math.min(100, (total / left) * 100) : 0;
            return (
              <div
                key={id}
                className={`rounded-md border px-3 py-2 text-sm ${over ? "border-red/40 bg-red/5" : "border-border"}`}
              >
                <p className="font-semibold">
                  {b?.batch_number}
                  {b?.fp_name ? ` · ${b.fp_name}` : ""}
                </p>
                <p className={`text-xs ${over ? "text-red" : "text-muted"}`}>
                  {left !== null ? `Available ${fmt(left)} ${b?.fp_unit} · ` : ""}this save uses{" "}
                  {uses.length > 1 ? `${uses.map(fmt).join(" + ")} = ` : ""}
                  <strong>
                    {fmt(total)} {b?.fp_unit}
                  </strong>
                  {left !== null &&
                    (over ? ` · more than the batch has left` : ` · left ${fmt(left - total)} ${b?.fp_unit}`)}
                </p>
                {left !== null && (
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/[0.08]">
                    <div
                      className={`h-full ${over ? "bg-red" : "bg-brand"}`}
                      style={{ width: `${over ? 100 : pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addLine}
          disabled={lines.length >= MAX_PACKAGING_LINES}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <span className="text-xs text-muted">
          {lines.length} of {MAX_PACKAGING_LINES} lines
        </span>
        {footerAction(lines.length)}
      </div>
    </div>
  );
}
