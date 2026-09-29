"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { DEPARTMENTS, UNITS, compatibleUnits } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type PackagingItemOption } from "./packaging-materials-editor";

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
  fpBatches: { id: string; batch_number: string; fp_unit: string | null; fp_name: string | null }[];
  packagingItems: PackagingItemOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPackagingIssue, undefined);
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
    <form action={formAction} className="flex flex-col gap-4 max-w-xl">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

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
      {fpBatches.length === 0 && (
        <p className="text-xs text-muted">No Approved finished product batches available yet.</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Department" htmlFor="department" required>
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

      {storeOrRnd && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Pack size quantity"
              htmlFor="pack_size_qty"
              required
              hint={
                selectedBatch?.fp_unit
                  ? `Bulk Finished Product per packaged unit, in a unit compatible with ${selectedBatch.fp_unit}.`
                  : "Bulk Finished Product consumed per packaged unit."
              }
            >
              <Input id="pack_size_qty" name="pack_size_qty" type="number" step="any" min="0" required />
            </Field>
            <Field label="Pack size unit" htmlFor="pack_size_unit" required>
              <Select id="pack_size_unit" name="pack_size_unit" required defaultValue={selectedBatch?.fp_unit ?? ""}>
                <option value="" disabled>
                  Select…
                </option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Unit count" htmlFor="unit_count" required hint="Number of packaged units produced (bottles, packs, …) — this is also what gets issued out.">
            <Input id="unit_count" name="unit_count" type="number" step="any" min="0" required />
          </Field>

          <Field label="Packaging materials" required hint="Item Master rows with category = packaging — add one line per material (bottles, caps, labels, …), each with its own quantity and unit.">
            <PackagingMaterialsEditor packagingItems={packagingItems} />
          </Field>

          <p className="text-xs text-muted">
            This will pull the computed Finished Product quantity and the packaging materials above, create the
            paired Packaged Finished Product, and immediately record it as issued to{" "}
            {department === "rnd" ? "R&D" : "Store"}.
          </p>
        </>
      )}

      {production && (
        <>
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
              UX Purchase's line form already has (purchase-line-form.tsx),
              not mandatory here (0 is a legitimate, honest choice for a
              Production issue that needs no sampling). */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="QC quantity" htmlFor="production_qc_qty" hint="Reserved for QC — goes through the same Awaiting QC / retest cycle as a purchased batch.">
              <Input id="production_qc_qty" name="production_qc_qty" type="number" step="any" min="0" defaultValue="0" />
            </Field>
            <Field label="Sample unit" htmlFor="production_sample_unit" hint="Converted to this Finished Product's own unit when saved.">
              <Select
                id="production_sample_unit"
                name="production_sample_unit"
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
            <Field label="Stability quantity" htmlFor="production_stability_qty">
              <Input id="production_stability_qty" name="production_stability_qty" type="number" step="any" min="0" defaultValue="0" />
            </Field>
            <Field label="R&D quantity" htmlFor="production_rnd_qty">
              <Input id="production_rnd_qty" name="production_rnd_qty" type="number" step="any" min="0" defaultValue="0" />
            </Field>
          </div>

          <p className="text-xs text-muted">
            This will deduct the quantity above from the Finished Product and add it as new Raw Material stock (a
            Raw Material item paired to this Finished Product, created automatically on first use) — available as an
            ingredient for another Finished Product&apos;s recipe, once QC-Approved. No packaging materials are used
            for a Production issue.
          </p>
        </>
      )}

      {department === "" && <p className="text-xs text-muted">Select a department to continue.</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || fpBatches.length === 0}>
          {pending ? "Saving…" : "Record issue"}
        </Button>
        <LinkButton href="/packaging" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
