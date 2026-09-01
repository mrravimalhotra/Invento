"use client";

import { useActionState } from "react";
import { setMfrActive, type ActionState } from "@/lib/actions/mfr";
import { Button } from "@/components/ui/button";

// Deactivate/reactivate — see setMfrActive() in lib/actions/mfr.ts for why
// this is gated at canWrite() level rather than system_admin-only like
// DeleteMfrForm. One button that flips to the opposite of the current
// state; no two-step confirm (unlike delete) since this is reversible —
// same one-click convention as ApproveForm.
export function ToggleMfrActiveForm({ id, active }: { id: string; active: boolean }) {
  const boundAction = setMfrActive.bind(null, id, !active);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Button type="submit" variant={active ? "secondary" : "primary"} size="sm" disabled={pending}>
        {pending ? "Saving…" : active ? "Deactivate MFR" : "Reactivate MFR"}
      </Button>
    </form>
  );
}
