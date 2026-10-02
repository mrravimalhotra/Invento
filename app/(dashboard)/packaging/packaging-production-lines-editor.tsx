"use client";

import { useRef, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { compatibleUnits, convertUnit } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { MAX_PACKAGING_LINES, type PackagingBatchOption } from "./packaging-lines-editor";

// FB-0052 (Production, 2 Oct 2026): a Production issue can carry several
// lines — each its own Finished Product batch, quantity to convert (in the
// product's own unit) and QC / Stability / R&D samples (entered in a sample
// unit) — saved together. Each line becomes its own Raw Material (RM-FP)
// batch with its own QC. Same message pattern as the Store/R&D table:
// plain text under the line, red outline on the box to fix, Add line / Save
// disabled until every line is fine. A batch can be on ONE line only
// (Ravi, 2 Oct 2026). R&D quantity is optional (empty = 0).
const RED = "border-red ring-1 ring-red focus:border-red focus:ring-red";

type Line = { key: number; batchId: string; qty: string; qc: string; stab: string; rnd: string; unit: string };

const blankLine = (key: number): Line => ({ key, batchId: "", qty: "", qc: "", stab: "", rnd: "", unit: "" });

function fmt(n: number) {
  return String(Math.round(n * 1e6) / 1e6);
}

export function ProductionLinesEditor({
  fpBatches,
  lineErrors,
  footerAction,
}: {
  fpBatches: PackagingBatchOption[];
  /** Messages from a refused save, keyed by line number (1-based). */
  lineErrors?: Record<number, string>;
  footerAction: (lineCount: number, blocked: boolean) => ReactNode;
}) {
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([blankLine(0)]);

  const batchOf = (id: string) => fpBatches.find((b) => b.id === id);
  const batchLabel = (b: PackagingBatchOption) => `${b.batch_number}${b.fp_name ? ` · ${b.fp_name}` : ""}`;

  function addLine() {
    setLines((ls) => (ls.length >= MAX_PACKAGING_LINES ? ls : [...ls, blankLine(nextKey.current++)]));
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)));
  }
  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const notes = lines.map((l, i) => {
    const n = i + 1;
    const errors: string[] = [];
    const b = batchOf(l.batchId);
    const qty = Number(l.qty);
    const qtyOk = qty > 0;

    // One batch, one line.
    let duplicate = false;
    if (b) {
      const first = lines.findIndex((x) => x.batchId === l.batchId);
      if (first !== -1 && first < i) {
        duplicate = true;
        errors.push(
          `Line ${n}: Batch ${batchLabel(b)} is already on line ${first + 1}. A batch can be issued to Production only once per issue.`,
        );
      }
    }

    // Stock left in the batch.
    let stockShort = false;
    if (b && qtyOk && b.left_qty !== null && qty > b.left_qty + 1e-7) {
      stockShort = true;
      errors.push(
        `Line ${n}: Not enough stock for batch ${batchLabel(b)}: ${fmt(Math.max(b.left_qty, 0))} ${b.fp_unit} available, ${fmt(qty)} ${b.fp_unit} needed.`,
      );
    }

    // Samples reserved from the quantity.
    let samples: number | null = null;
    let sampleShort = false;
    if (b?.fp_unit && l.unit) {
      const q = convertUnit(Number(l.qc) || 0, l.unit, b.fp_unit);
      const s = convertUnit(Number(l.stab) || 0, l.unit, b.fp_unit);
      const r = convertUnit(Number(l.rnd) || 0, l.unit, b.fp_unit);
      if (q !== null && s !== null && r !== null) {
        samples = q + s + r;
        if (qtyOk && samples > qty + 1e-9) {
          sampleShort = true;
          errors.push(
            `Line ${n}: QC + Stability + R&D (${fmt(samples)} ${b.fp_unit}) can't exceed the quantity to convert (${fmt(qty)} ${b.fp_unit}).`,
          );
        }
      }
    }

    const info =
      errors.length === 0 && b && qtyOk
        ? b.left_qty !== null
          ? `Batch ${b.batch_number}: this line uses ${fmt(qty)} ${b.fp_unit} · ${fmt(b.left_qty - qty)} ${b.fp_unit} left in the batch.`
          : `Batch ${b.batch_number}: this line uses ${fmt(qty)} ${b.fp_unit}.`
        : null;

    return { errors, info, duplicate, stockShort, sampleShort, samples };
  });
  const blocked = notes.some((x) => x.errors.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="pr_count" value={lines.length} />

      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold text-muted">
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2 w-[24%]">
                Finished product batch<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 min-w-[9rem]">
                Quantity to convert<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 min-w-[5.5rem]">
                QC qty<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 min-w-[6.5rem]">
                Stability qty<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 min-w-[5.5rem]">R&amp;D qty</th>
              <th className="px-3 py-2 min-w-[6rem]">
                Sample unit<span className="text-red ml-0.5">*</span>
              </th>
              <th className="px-3 py-2 w-[17%]">Becomes Raw Material (RM-FP)</th>
              <th className="px-3 py-2 w-8" />
            </tr>
          </thead>
          {lines.map((l, i) => {
            const b = batchOf(l.batchId);
            const { errors, info, duplicate, stockShort, sampleShort, samples } = notes[i];
            const savedError = errors.length === 0 ? lineErrors?.[i + 1] : undefined;
            const qty = Number(l.qty);
            const chipBad = stockShort || sampleShort;
            return (
              <tbody key={l.key} className="border-b border-border last:border-0">
                <tr className="align-top">
                  <td className="px-3 py-3 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Select
                      name={`pr_batch_${i}`}
                      required
                      value={l.batchId}
                      aria-label={`Line ${i + 1} finished product batch`}
                      className={duplicate ? RED : undefined}
                      aria-invalid={duplicate || undefined}
                      onChange={(e) => {
                        const nb = batchOf(e.target.value);
                        // Sample unit: keep it if the new product accepts it, else the product's own unit.
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
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-24 shrink-0">
                        <Input
                          name={`pr_qty_${i}`}
                          type="number"
                          step="any"
                          min="0"
                          required
                          aria-label={`Line ${i + 1} quantity to convert`}
                          className={stockShort ? RED : undefined}
                          aria-invalid={stockShort || undefined}
                          value={l.qty}
                          onChange={(e) => update(l.key, { qty: e.target.value })}
                        />
                      </div>
                      <span className="text-xs text-muted">{b?.fp_unit ?? ""}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      name={`pr_qc_${i}`}
                      type="number"
                      step="any"
                      min="0"
                      required
                      aria-label={`Line ${i + 1} QC quantity`}
                      className={sampleShort ? RED : undefined}
                      aria-invalid={sampleShort || undefined}
                      value={l.qc}
                      onChange={(e) => update(l.key, { qc: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      name={`pr_stab_${i}`}
                      type="number"
                      step="any"
                      min="0"
                      required
                      aria-label={`Line ${i + 1} Stability quantity`}
                      className={sampleShort ? RED : undefined}
                      aria-invalid={sampleShort || undefined}
                      value={l.stab}
                      onChange={(e) => update(l.key, { stab: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      name={`pr_rnd_${i}`}
                      type="number"
                      step="any"
                      min="0"
                      aria-label={`Line ${i + 1} R&D quantity`}
                      className={sampleShort ? RED : undefined}
                      aria-invalid={sampleShort || undefined}
                      value={l.rnd}
                      onChange={(e) => update(l.key, { rnd: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      name={`pr_unit_${i}`}
                      required
                      value={l.unit}
                      aria-label={`Line ${i + 1} sample unit`}
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
                  </td>
                  <td className="px-3 py-2">
                    <div
                      aria-live="polite"
                      className={`rounded-md px-3 py-2 text-xs ${
                        chipBad
                          ? "bg-red-bg text-red"
                          : b && qty > 0
                            ? "bg-brand-light text-brand-dark"
                            : "bg-black/[0.04] text-muted"
                      }`}
                    >
                      {b?.fp_unit && qty > 0
                        ? samples && samples > 0
                          ? `${fmt(qty)} ${b.fp_unit} · ${fmt(samples)} ${b.fp_unit} kept for samples`
                          : `${fmt(qty)} ${b.fp_unit}`
                        : b?.fp_unit
                          ? "fills in from quantity"
                          : "select a batch"}
                    </div>
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
                {(errors.length > 0 || savedError || info) && (
                  <tr>
                    <td />
                    <td colSpan={8} className="px-3 pb-2 text-xs" aria-live="polite">
                      {errors.map((e) => (
                        <p key={e} className="text-red">
                          {e}
                        </p>
                      ))}
                      {savedError && <p className="text-red">{savedError}</p>}
                      {errors.length === 0 && !savedError && info && <p className="text-muted">{info}</p>}
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
