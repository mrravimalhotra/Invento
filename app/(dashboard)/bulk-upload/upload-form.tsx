"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BulkUploadState } from "@/lib/actions/bulk-upload";

type Action = (prev: BulkUploadState, formData: FormData) => Promise<BulkUploadState>;

// One instance per module card on /bulk-upload. The file input is keyed
// so a successful import clears the picked filename — otherwise the
// browser keeps showing the just-imported file's name, which reads as
// "did this upload again?" the next time someone glances at the card.
export function BulkUploadForm({ action, templateHref }: { action: Action; templateHref: string }) {
  const [state, formAction, pending] = useActionState<BulkUploadState, FormData>(action, undefined);
  const [inputKey, setInputKey] = useState(0);
  // `state` only changes when the form is actually submitted — picking a
  // different file never touches it, so the previous result (error/
  // rowErrors, or success) would otherwise keep showing until the next
  // Upload click, reading like it still applies to the newly chosen file.
  // Ravi (14 Sept 2026): "immediately when a new file is loaded, old error
  // message should disappear." `dismissed` hides whatever's currently
  // shown the instant a new file is picked; it's un-set the moment a real
  // submit produces a fresh result, so that result is never hidden.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);
    // Clearing the picked filename after a successful submit — bounded,
    // one-shot, not a synchronization loop. Same pattern as
    // purchase-line-form.tsx's post-submit reset.
    if (state.success) {
      setInputKey((k) => k + 1);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
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
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Uploading…" : "Upload"}
        </Button>
        <a href={templateHref} className="text-sm font-medium text-brand hover:underline">
          Download template
        </a>
      </div>

      {!dismissed && state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      {!dismissed && state?.error && (
        <div className="rounded-md border border-red/30 bg-red/5 p-3">
          <p className="text-sm text-red">{state.error}</p>
          {state.rowErrors && state.rowErrors.length > 0 && (
            <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5 text-xs text-red">
              {state.rowErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
