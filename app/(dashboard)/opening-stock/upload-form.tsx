"use client";

import { useEffect, useState } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { Button } from "@/components/ui/button";
import { submitOpeningStock, type OpeningUploadState } from "@/lib/actions/opening-stock";
import type { OpeningKind } from "@/lib/opening-stock/columns";

// Two steps on one form: "Check file" lists every problem (or says how many rows are
// ready); "Load N rows" then repeats the check and loads, all or nothing.
export function OpeningUploadForm({ kind, templateHref }: { kind: OpeningKind; templateHref: string }) {
  const [state, formAction, pending] = useFlashActionState<OpeningUploadState, FormData>(submitOpeningStock, undefined);
  const [inputKey, setInputKey] = useState(0);
  // Hide the last result the moment another file is picked.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);
    if (state.success) setInputKey((k) => k + 1);
  }, [state]);

  const shown = dismissed ? undefined : state;
  const ready = shown?.checked;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          key={inputKey}
          type="file"
          name="file"
          accept=".xlsx"
          required
          onChange={() => setDismissed(true)}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-brand-dark"
        />
        <Button type="submit" name="intent" value="check" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Working…" : "Check file"}
        </Button>
        {ready && (
          <Button type="submit" name="intent" value="load" size="sm" disabled={pending}>
            Load {ready.rows} row{ready.rows === 1 ? "" : "s"}
          </Button>
        )}
        <a href={templateHref} className="text-sm font-medium text-brand hover:underline">Download template</a>
      </div>

      {ready && (
        <p role="status" className="rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm font-medium text-brand-dark">
          ✓ File is fine: {ready.rows} row{ready.rows === 1 ? "" : "s"} ready to load
          {ready.kind === "raw" ? ` (${ready.approved} Approved, ${ready.pending} Pending QC, ${ready.rejected} Rejected)` : ""}.
          Nothing is loaded until you click Load.
        </p>
      )}
      {shown?.success && (
        <p role="status" className="rounded-md border border-brand/30 bg-brand-light px-3 py-2 text-sm font-medium text-brand-dark">✓ {shown.success}</p>
      )}
      {shown?.error && (
        <div className="rounded-md border border-red/30 bg-red/5 p-3">
          <p className="text-sm text-red">{shown.error}</p>
          {shown.rowErrors && shown.rowErrors.length > 0 && (
            <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5 text-xs text-red">
              {shown.rowErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
