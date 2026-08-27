"use client";

import { useActionState, useState } from "react";
import { updateMfrLines, type ActionState } from "@/lib/actions/mfr";
import { Button } from "@/components/ui/button";
import { MfrLineEditor, type RawItemOption, type EditableLine } from "../mfr-line-editor";

export function EditRecipeForm({
  mfrId,
  currentVersion,
  rawItems,
  initialLines,
}: {
  mfrId: string;
  currentVersion: number;
  rawItems: RawItemOption[];
  initialLines: EditableLine[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateMfrLines.bind(null, mfrId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit recipe (creates version {currentVersion + 1})
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-amber/40 bg-amber-bg/40 p-4">
      <p className="text-xs text-muted">
        Saving replaces the recipe shown above with version {currentVersion + 1}. Version {currentVersion} is kept
        for history but is no longer shown on this screen. Any existing approval is cleared and must be re-granted.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <MfrLineEditor rawItems={rawItems} initialLines={initialLines} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Save as version ${currentVersion + 1}`}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
