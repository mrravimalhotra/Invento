"use client";

import { useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type MaterialLine, type PackagingItemOption } from "./packaging-materials-editor";

// FB-0052 (2 Oct 2026): a Store / R&D packaging issue can carry several lines
// — each its own Finished Product batch, pack size (quantity + unit),
// unit count and packaging materials — saved together in one go. The date
// and department above are shared by every line.
//
// Messages (Ravi, 2 Oct 2026): plain text directly under the line they belong
// to. A valid line shows what it uses and what is left; a line that is short
// on stock shows ONLY the "Not enough stock" sentence(s), and Add line / Save
// stay disabled until every line is fine. Lines drawing on the same batch or
// the same material are added together. The database checks again when saving.
export const MAX_PACKAGING_LINES = 30;

export type PackagingBatchOption = {
  id: string;
  batch_number: string;
  /** Opening stock (0101): batch came from the old records. */
  is_legacy?: boolean | null;
  fp_unit: string | null;
  fp_name: string | null;
  /** Bulk quantity still free to pack or issue, in the product's unit. null = no yield recorded (database check does not apply). */
  left_qty: number | null;
};

type Line = { key: number; batchId: string; qty: string; unit: string; units: string; mats: MaterialLine[] };

const blankMat = (): MaterialLine => ({ itemId: "", quantity: "", unit: "" });

function fmt(n: number) {
  return String(Math.round(n * 1e6) / 1e6);
}

function joinNumbers(ns: number[]) {
  return ns.length <= 1 ? String(ns[0] ?? "") : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

export function PackagingLinesEditor({
  fpBatches,
  packagingItems,
  lineErrors,
  footerAction,
}: {
  fpBatches: PackagingBatchOption[];
  packagingItems: PackagingItemOption[];
  /** Messages from a refused save, keyed by line number (1-based). */
  lineErrors?: Record<number, string>;
  /** Rendered at the right of the footer row (Cancel / Save), given the number of lines and whether stock blocks saving. */
  footerAction: (lineCount: number, blocked: boolean) => ReactNode;
}) {
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([
    { key: 0, batchId: "", qty: "", unit: "", units: "", mats: [blankMat()] },
  ]);

  const batchOf = (id: string) => fpBatches.find((b) => b.id === id);
  const itemOf = (id: string) => packagingItems.find((i) => i.id === id);

  function addLine() {
    setLines((ls) => {
      if (ls.length >= MAX_PACKAGING_LINES) return ls;
      // A new line starts on the same batch as the one above it (the usual case: another pack size of the same batch).
      const prev = ls[ls.length - 1];
      return [
        ...ls,
        {
          key: nextKey.current++,
          batchId: prev?.batchId ?? "",
          qty: "",
          unit: prev?.unit ?? "",
          units: "",
          mats: [blankMat()],
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

  // Per line: the "Not enough stock" sentences, or else the figures (used / left).
  // Earlier lines count first, so lines on the same batch or material are added together.
  const batchUsedBefore = new Map<string, { total: number; lines: number[] }>();
  const itemUsedBefore = new Map<string, number>();
  const notes = lines.map((l, i) => {
    const n = i + 1;
    const errors: string[] = [];
    const infos: string[] = [];
    let fpShort = false;
    const matShort: boolean[] = l.mats.map(() => false);

    const b = batchOf(l.batchId);
    const used = usedBy(l);
    if (b && used !== null) {
      const before = batchUsedBefore.get(b.id) ?? { total: 0, lines: [] };
      batchUsedBefore.set(b.id, { total: before.total + used, lines: [...before.lines, n] });
      const label = `${b.batch_number}${b.is_legacy ? " (Legacy)" : ""}${b.fp_name ? ` · ${b.fp_name}` : ""}`;
      if (b.left_qty !== null) {
        const available = b.left_qty - before.total;
        if (used > available + 1e-7) {
          fpShort = true;
          errors.push(
            `Line ${n}: Not enough stock for batch ${label}: ${fmt(Math.max(available, 0))} ${b.fp_unit} available, ${fmt(used)} ${b.fp_unit} needed.`,
          );
        } else {
          const after = before.lines.length > 0 ? ` (after lines ${joinNumbers([...before.lines, n])})` : "";
          infos.push(
            `Batch ${b.batch_number}: this line uses ${fmt(used)} ${b.fp_unit} · ${fmt(available - used)} ${b.fp_unit} left in the batch${after}`,
          );
        }
      } else {
        infos.push(`Batch ${b.batch_number}: this line uses ${fmt(used)} ${b.fp_unit}`);
      }
    }

    for (const [mi, m] of l.mats.entries()) {
      const item = itemOf(m.itemId);
      const q = Number(m.quantity);
      if (!item || !(q > 0) || !m.unit) continue;
      const need = item.unit ? convertUnit(q, m.unit, item.unit) : q;
      if (need === null) continue;
      const unit = item.unit ?? m.unit;
      const before = itemUsedBefore.get(item.id) ?? 0;
      itemUsedBefore.set(item.id, before + need);
      if (item.on_hand === undefined) continue;
      const available = item.on_hand - before;
      if (need > available + 1e-7) {
        matShort[mi] = true;
        errors.push(
          `Line ${n}: Not enough stock for ${item.item_code} · ${item.name}: ${fmt(Math.max(available, 0))} ${unit} available, ${fmt(need)} ${unit} needed.`,
        );
      } else {
        infos.push(`${item.item_code}: ${fmt(need)} ${unit} used · ${fmt(available - need)} ${unit} left`);
      }
    }

    return { errors, infos, fpShort, matShort };
  });
  const blocked = notes.some((x) => x.errors.length > 0);

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
          {lines.map((l, i) => {
            const b = batchOf(l.batchId);
            const used = usedBy(l);
            const sameAsAbove = i > 0 && l.batchId !== "" && lines[i - 1].batchId === l.batchId;
            const { errors, infos, fpShort, matShort } = notes[i];
            const savedError = errors.length === 0 ? lineErrors?.[i + 1] : undefined;
            return (
              <tbody key={l.key} className="border-b border-border last:border-0">
                <tr className="align-top">
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
                          {`${fb.batch_number}${fb.is_legacy ? " (Legacy)" : ""}${fb.fp_name ? ` · ${fb.fp_name}` : ""}`}
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
                      className={fpShort ? "border-red ring-1 ring-red focus:border-red focus:ring-red" : undefined}
                      aria-invalid={fpShort || undefined}
                      value={l.units}
                      onChange={(e) => update(l.key, { units: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div
                      aria-live="polite"
                      className={`rounded-md px-3 py-2 text-xs ${
                        fpShort
                          ? "bg-red-bg text-red"
                          : used !== null
                            ? "bg-brand-light text-brand-dark"
                            : "bg-black/[0.04] text-muted"
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
                    <PackagingMaterialsEditor
                      packagingItems={packagingItems}
                      namePrefix={`ln${i}_`}
                      compact
                      onLinesChange={(mats) => update(l.key, { mats })}
                      shortItems={matShort}
                    />
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
                {(errors.length > 0 || savedError || infos.length > 0) && (
                  <tr>
                    <td />
                    <td colSpan={6} className="px-3 pb-2 text-xs" aria-live="polite">
                      {errors.map((e) => (
                        <p key={e} className="text-red">
                          {e}
                        </p>
                      ))}
                      {savedError && <p className="text-red">{savedError}</p>}
                      {errors.length === 0 && !savedError && <p className="text-muted">{infos.join(". ")}.</p>}
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addLine}
          disabled={blocked || lines.length >= MAX_PACKAGING_LINES}
        >
          <Plus className="h-4 w-4" /> Add line
        </Button>
        <span className="text-xs text-muted">
          {lines.length} of {MAX_PACKAGING_LINES} lines
        </span>
        {footerAction(lines.length, blocked)}
      </div>
    </div>
  );
}
