"use client";

import { formatQty } from "@/lib/utils";
import type { OpeningUploadState } from "@/lib/actions/opening-stock";

// What a check or a load answered, shown the same way under the Excel form and the typed-in form:
// the "file is fine" line, the per-item summary to compare with the old stock sheet, the success
// line and the list of problems. The typed-in form lists row problems inside each row, so it passes
// the ones that did not belong to a row through `rowErrors`.
export function OpeningResult({ shown, rowErrors, noun = "File" }: { shown: OpeningUploadState; rowErrors?: string[]; noun?: "File" | "Rows" }) {
  const ready = shown?.checked;
  const errors = rowErrors ?? shown?.rowErrors;
  return (
    <>
      {ready && (
        <p role="status" className="rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm font-medium text-brand-dark">
          ✓ {noun === "File" ? "File is fine" : "Rows are fine"}: {ready.rows} row{ready.rows === 1 ? "" : "s"} ready to load
          {ready.kind === "raw" ? ` (${ready.approved} Approved, ${ready.pending} Pending QC, ${ready.rejected} Rejected)` : ""}.
          Nothing is loaded until you click Load.
        </p>
      )}
      {ready && ready.summary.length > 0 && (
        <div className="rounded-md border border-border">
          <p className="border-b border-border bg-black/[0.03] px-3 py-1.5 text-xs font-medium text-muted">
            What {noun === "File" ? "this file" : "these rows"} will load — compare with your old stock sheet before you click Load
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-3 py-1.5 font-medium">Item code</th>
                  <th className="px-3 py-1.5 font-medium">Item</th>
                  <th className="px-3 py-1.5 text-right font-medium">Batches</th>
                  <th className="px-3 py-1.5 text-right font-medium">Total quantity</th>
                </tr>
              </thead>
              <tbody>
                {ready.summary.map((s) => (
                  <tr key={s.code} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono text-xs">{s.code}</td>
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.batches}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatQty(s.total)} {s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {shown?.success && (
        <p role="status" className="rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm font-medium text-brand-dark">✓ {shown.success}</p>
      )}
      {shown?.error && (
        <div className="rounded-md border border-red/30 bg-red/5 p-3">
          <p className="text-sm text-red">{shown.error}</p>
          {errors && errors.length > 0 && (
            <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5 text-xs text-red">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
