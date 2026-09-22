"use client";

import { Field, Select } from "@/components/ui/form";

export type BatchOption = { qualityCheckId: string; label: string; legacy: boolean };

// Same server-side "GET form, submit on change" pattern as LedgerFilters
// (app/(dashboard)/inventory/(tabs)/ledger-filters.tsx) and the Reports
// category filter — Subject Type and Batch both live in the URL
// (?subject=&quality_check_id=) so page.tsx can server-render the right
// header fields/template for whatever's selected, rather than fetching
// client-side.
export function SubjectBatchPicker({
  subject,
  qualityCheckId,
  batches,
}: {
  subject: string;
  qualityCheckId: string;
  batches: BatchOption[];
}) {
  return (
    <form action="/coa/new" className="flex flex-wrap items-end gap-3">
      <Field label="Raw/Finished" htmlFor="subject">
        <Select id="subject" name="subject" defaultValue={subject} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="" disabled>
            Select…
          </option>
          <option value="raw_material">Raw Material</option>
          <option value="finished_product">Finished Product</option>
        </Select>
      </Field>
      {subject && (
        <Field label="Batch (Approved QC only)" htmlFor="quality_check_id">
          <Select
            id="quality_check_id"
            name="quality_check_id"
            defaultValue={qualityCheckId}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="" disabled>
              Select batch…
            </option>
            {batches.map((b) => (
              <option key={b.qualityCheckId} value={b.qualityCheckId} data-legacy={b.legacy ? "1" : undefined}>
                {b.label}
              </option>
            ))}
          </Select>
          {batches.length === 0 && (
            <p className="mt-1 text-xs text-muted">
              No {subject === "raw_material" ? "Raw Material" : "Finished Product"} batches have cleared QC yet.
            </p>
          )}
        </Field>
      )}
      {/* Degrades to a working (if JS-less) form: a submit button covers the
          no-JS case the same way MfrProcedureEditor's client-side add/remove
          still posts a valid form without JS. */}
      <noscript>
        <button type="submit" className="text-sm text-brand hover:underline">
          Go
        </button>
      </noscript>
    </form>
  );
}
