"use client";

import { useActionState } from "react";
import { createPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";
import { PackagingMaterialsEditor, type PackagingItemOption } from "./packaging-materials-editor";

export function PackagingForm({
  fpBatches,
  packagingItems,
}: {
  fpBatches: { id: string; batch_number: string }[];
  packagingItems: PackagingItemOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPackagingIssue, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-xl">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field
        label="Finished product batch"
        htmlFor="finished_product_batch_id"
        required
        hint="Only Approved batches are listed — packaging follows FP approval, per the corrected legacy flow."
      >
        <Select id="finished_product_batch_id" name="finished_product_batch_id" required defaultValue="">
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
        <Field label="Pack size" htmlFor="pack_size" required hint='Free text, e.g. "100ml bottle".'>
          <Input id="pack_size" name="pack_size" required />
        </Field>
        <Field label="Unit count" htmlFor="unit_count" required>
          <Input id="unit_count" name="unit_count" type="number" step="any" min="0" required />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Department" htmlFor="department" required>
          <Select id="department" name="department" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
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

      <Field label="Packaging materials" required hint="Item Master rows with category = packaging — add one line per material (bottles, caps, labels, …), each with its own quantity and unit.">
        <PackagingMaterialsEditor packagingItems={packagingItems} />
      </Field>

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
