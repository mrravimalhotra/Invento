"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useState } from "react";
import { createPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { DEPARTMENTS, compatibleUnits } from "@/lib/constants/units";
import { isLegacyCode, todayIst } from "@/lib/utils";
import type { PackagingItemOption } from "./packaging-materials-editor";
import { PackagingLinesEditor, type PackagingBatchOption } from "./packaging-lines-editor";

// Task F (claude/packaged-fp-redesign.md) — department Store/R&D transform
// bulk Finished Product into a Packaged Finished Product and immediately
// issue it out, computed from pack size (qty × unit) × unit count, with
// packaging materials (bottles, caps, …) pulled alongside.
function isStoreOrRnd(d: string) {
  return d === "store" || d === "rnd";
}

export function PackagingForm({
  fpBatches,
  packagingItems,
}: {
  fpBatches: PackagingBatchOption[];
  packagingItems: PackagingItemOption[];
}) {
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(createPackagingIssue, undefined);
  const [department, setDepartment] = useState("");
  const [batchId, setBatchId] = useState("");
  const storeOrRnd = isStoreOrRnd(department);
  const production = department === "production";
  const selectedBatch = fpBatches.find((b) => b.id === batchId);
  // FB-0043: sample unit defaults to the selected batch's own FP unit,
  // same "pre-fill, still editable" convention purchase-line-form.tsx
  // uses — reset whenever the batch selection changes so a stale unit
  // from a previously-selected FP never lingers.
  const [productionSampleUnit, setProductionSampleUnit] = useState("");

  return (
    <form action={formAction} className={`flex flex-col gap-4 ${storeOrRnd ? "max-w-6xl" : "max-w-xl"}`}>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label={storeOrRnd ? "Issue date (all lines)" : "Issue date"}
          htmlFor="issue_date"
          required
          hint="The day this issue was made. Today by default; an earlier day is fine, a future day is not."
        >
          <Input id="issue_date" name="issue_date" type="date" defaultValue={todayIst()} max={todayIst()} required />
        </Field>
        <Field label={storeOrRnd ? "Department (all lines)" : "Department"} htmlFor="department" required>
          <Select
            id="department"
            name="department"
            required
            defaultValue=""
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d === "rnd" ? "R&D" : d.charAt(0).toUpperCase() + d.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        {/* Transaction type removed (Ravi, 29 Sept 2026): every packaging
            issue is a Pack — Repack/Unpack took stock out instead of putting
            it back (accuracy audit ACC-05). */}
      </div>

      {fpBatches.length === 0 && (
        <p className="text-xs text-muted">No Approved finished product batches available yet.</p>
      )}

      {storeOrRnd && (
        <>
          {/* FB-0052 (2 Oct 2026): several lines in one save — each with its own
              batch, pack size, unit count and materials. */}
          <PackagingLinesEditor
            fpBatches={fpBatches}
            packagingItems={packagingItems}
            footerAction={(n) => (
              <div className="flex gap-2">
                <LinkButton href="/packaging" variant="secondary">
                  Cancel
                </LinkButton>
                <Button type="submit" disabled={pending || fpBatches.length === 0}>
                  {pending ? "Saving…" : n === 1 ? "Save 1 issue" : `Save ${n} issues`}
                </Button>
              </div>
            )}
          />

          <p className="text-xs text-muted">
            Each line will pull its computed Finished Product quantity and its packaging materials, create the paired
            Packaged Finished Product, and immediately record it as issued to {department === "rnd" ? "R&D" : "Store"}.
            Every line gets its own packaging issue code. All lines are saved together — if one cannot be saved, none
            are.
          </p>
        </>
      )}

      {production && (
        <>
          <Field
            label="Finished product batch"
            htmlFor="finished_product_batch_id"
            required
            hint="Only Approved batches are listed — packaging follows FP approval, per the corrected legacy flow."
          >
            <Select
              id="finished_product_batch_id"
              name="finished_product_batch_id"
              required
              defaultValue=""
              onChange={(e) => {
                setBatchId(e.target.value);
                const b = fpBatches.find((x) => x.id === e.target.value);
                setProductionSampleUnit(b?.fp_unit ?? "");
              }}
            >
              <option value="" disabled>
                Select…
              </option>
              {fpBatches.map((b) => (
                <option key={b.id} value={b.id} data-legacy={isLegacyCode(b.batch_number) ? "1" : undefined}>
                  {b.fp_name ? `${b.batch_number} — ${b.fp_name}` : b.batch_number}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Quantity to convert"
            htmlFor="production_qty"
            required
            hint={
              selectedBatch?.fp_unit
                ? `How much of this Finished Product, in ${selectedBatch.fp_unit}, is being issued to Production.`
                : "How much of this Finished Product is being issued to Production."
            }
          >
            <Input id="production_qty" name="production_qty" type="number" step="any" min="0" required />
          </Field>

          {/* FB-0043 (28 Sept 2026): "it should be treated as new Raw
              material reserving quantity for stability, R&D and QC" — same
              UX Purchase's line form already has (purchase-line-form.tsx).
              Ravi (29 Sept 2026): "while issuing to Production - Stability,
              R&D, QC and Sample unit should be mandatory" — same rule as
              Purchase: each must be entered (blank is refused), but 0 stays
              a valid, explicitly-typed value for an issue that needs no
              sampling. */}
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="QC quantity"
              htmlFor="production_qc_qty"
              required
              hint="Reserved for QC — goes through the same Awaiting QC / retest cycle as a purchased batch."
            >
              <Input id="production_qc_qty" name="production_qc_qty" type="number" step="any" min="0" required />
            </Field>
            <Field
              label="Sample unit"
              htmlFor="production_sample_unit"
              required
              hint="Converted to this Finished Product's own unit when saved."
            >
              <Select
                id="production_sample_unit"
                name="production_sample_unit"
                required
                value={productionSampleUnit}
                onChange={(e) => setProductionSampleUnit(e.target.value)}
                disabled={!selectedBatch?.fp_unit}
              >
                <option value="">Select…</option>
                {(selectedBatch?.fp_unit ? compatibleUnits(selectedBatch.fp_unit) : []).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Stability quantity" htmlFor="production_stability_qty" required>
              <Input
                id="production_stability_qty"
                name="production_stability_qty"
                type="number"
                step="any"
                min="0"
                required
              />
            </Field>
            <Field label="R&D quantity" htmlFor="production_rnd_qty" required>
              <Input id="production_rnd_qty" name="production_rnd_qty" type="number" step="any" min="0" required />
            </Field>
          </div>

          <p className="text-xs text-muted">
            This will deduct the quantity above from the Finished Product and add it as new Raw Material stock (a Raw
            Material item paired to this Finished Product, created automatically on first use) — available as an
            ingredient for another Finished Product&apos;s recipe, once QC-Approved. No packaging materials are used for
            a Production issue.
          </p>
        </>
      )}

      {department === "" && <p className="text-xs text-muted">Select a department to continue.</p>}

      {!storeOrRnd && (
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || fpBatches.length === 0}>
            {pending ? "Saving…" : "Record issue"}
          </Button>
          <LinkButton href="/packaging" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      )}
    </form>
  );
}
