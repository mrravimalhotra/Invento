"use client";

import { useActionState, useState } from "react";
import { updateMfrLines, type ActionState } from "@/lib/actions/mfr";
import { Button } from "@/components/ui/button";
import { MfrLineEditor, type RawItemOption, type EditableLine } from "../mfr-line-editor";

export function EditRecipeForm({
  mfrId,
  rawItems,
  initialLines,
}: {
  mfrId: string;
  rawItems: RawItemOption[];
  initialLines: EditableLine[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateMfrLines.bind(null, mfrId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit recipe
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-amber/40 bg-amber-bg/40 p-4">
      <p className="text-xs text-muted">
        Saving replaces the recipe shown above. This is only available before this MFR is approved — once approved,
        the recipe is locked.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <MfrLineEditor rawItems={rawItems} initialLines={initialLines} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save recipe"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
