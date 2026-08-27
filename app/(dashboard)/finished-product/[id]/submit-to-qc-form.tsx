"use client";

import { useActionState } from "react";
import { submitFinishedProductToQc, type ActionState } from "@/lib/actions/finished-product";
import { Button } from "@/components/ui/button";

export function SubmitToQcForm({ batchId }: { batchId: string }) {
  const boundAction = submitFinishedProductToQc.bind(null, batchId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {state?.error && <p className="max-w-xs text-right text-sm text-red">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit to QC"}
      </Button>
    </form>
  );
}
