"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { DEPARTMENTS, UNITS } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type PackagingItemOption } from "./packaging-materials-editor";

// Task F (claude/packaged-fp-redesign.md) — department Store/R&D transform
// bulk Finished Product into a Packaged Finished Product and immediately
// issue it out, computed from pack size (qty × unit) × unit count.
// Production keeps this screen's original free-text-only pack size and is
// otherwise untouched.
function isTransformDepartment(d: string) {
  return d === "store" || d === "rnd";
}

export function PackagingForm({
  fpBatches,
  packagingItems,
}: {
  fpBatches: { id: string; batch_number: string; fp_unit: string | null }[];
  packagingItems: PackagingItemOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPackagingIssue, undefined);
  const [department, setDepartment] = useState("");
  const [batchId, setBatchId] = useState("");
  const transform = isTransformDepartment(department);
  const selectedBatch = fpBatches.find((b) => b.id === batchId);

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
          onChange={(e) => setBatchId(e.target.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {fpBatches.map((b) => (
            <option key={b.id} value={b.id} data-legacy={isLegacyCode(b.batch_number) ? "1" : undefined}>
              {b.batch_number}
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
        <Field label="Transaction type" htmlFor="transaction_type" required>
          <Select id="transaction_type" name="transaction_type" defaultValue="pack" required>
            <option value="pack">Pack</option>
            <option value="repack">Repack</option>
            <option value="unpack">Unpack</option>
          </Select>
        </Field>
      </div>

      {transform ? (
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
      ) : (
        <Field label="Pack size" htmlFor="pack_size" required hint='Free text, e.g. "100ml bottle".'>
          <Input id="pack_size" name="pack_size" required />
        </Field>
      )}

      <Field label="Unit count" htmlFor="unit_count" required hint={transform ? "Number of packaged units produced (bottles, packs, …) — this is also what gets issued out." : undefined}>
        <Input id="unit_count" name="unit_count" type="number" step="any" min="0" required />
      </Field>

      <Field label="Packaging materials" required hint="Item Master rows with category = packaging — add one line per material (bottles, caps, labels, …), each with its own quantity and unit.">
        <PackagingMaterialsEditor packagingItems={packagingItems} />
      </Field>

      {transform && (
        <p className="text-xs text-muted">
          This will pull the computed Finished Product quantity and the packaging materials above, create the paired
          Packaged Finished Product, and immediately record it as issued to {department === "rnd" ? "R&D" : "Store"}.
        </p>
      )}

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
