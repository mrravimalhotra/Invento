"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useState } from "react";
import { createPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/constants/units";
import { todayIst } from "@/lib/utils";
import type { PackagingItemOption } from "./packaging-materials-editor";
import { PackagingLinesEditor, type PackagingBatchOption } from "./packaging-lines-editor";
import { ProductionLinesEditor } from "./packaging-production-lines-editor";

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
  const storeOrRnd = isStoreOrRnd(department);
  const production = department === "production";
  const multiLine = storeOrRnd || production;

  return (
    <form action={formAction} className={`flex flex-col gap-4 ${multiLine ? "max-w-6xl" : "max-w-xl"}`}>
      {/* A message tied to one line of the Store/R&D table is shown under that line (and as the short pop-up) —
          never repeated here at the top. */}
      {state?.error && !state.lineErrors && <p className="text-sm text-red">{state.error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label={multiLine ? "Issue date (all lines)" : "Issue date"}
          htmlFor="issue_date"
          required
          hint="The day this issue was made. Today by default; an earlier day is fine, a future day is not, and not before the batch was approved by QC."
        >
          <Input id="issue_date" name="issue_date" type="date" defaultValue={todayIst()} max={todayIst()} required />
        </Field>
        <Field label={multiLine ? "Department (all lines)" : "Department"} htmlFor="department" required>
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
            lineErrors={state?.lineErrors}
            footerAction={(n, blocked) => (
              <div className="flex gap-2">
                <LinkButton href="/packaging" variant="secondary">
                  Cancel
                </LinkButton>
                <Button type="submit" disabled={pending || blocked || fpBatches.length === 0}>
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
          {/* FB-0052 (Production, 2 Oct 2026): several lines in one save — each its own Finished Product batch
              (a batch on ONE line only), quantity to convert and QC / Stability / R&D samples. */}
          <ProductionLinesEditor
            fpBatches={fpBatches}
            lineErrors={state?.lineErrors}
            footerAction={(n, blocked) => (
              <div className="flex gap-2">
                <LinkButton href="/packaging" variant="secondary">
                  Cancel
                </LinkButton>
                <Button type="submit" disabled={pending || blocked || fpBatches.length === 0}>
                  {pending ? "Saving…" : n === 1 ? "Save 1 issue" : `Save ${n} issues`}
                </Button>
              </div>
            )}
          />

          <p className="text-xs text-muted">
            Each line deducts its quantity from the Finished Product batch and adds it as new Raw Material stock (a Raw
            Material item paired to this Finished Product, created automatically on first use) with its own QC —
            available as an ingredient for another Finished Product&apos;s recipe, once QC-Approved. Every line gets its
            own packaging issue code. All lines are saved together — if one cannot be saved, none are. No packaging
            materials are used for a Production issue.
          </p>
        </>
      )}

      {department === "" && <p className="text-xs text-muted">Select a department to continue.</p>}
    </form>
  );
}
