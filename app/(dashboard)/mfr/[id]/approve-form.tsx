"use client";

import { useActionState } from "react";
import { approveMfrDefinition, type ActionState } from "@/lib/actions/mfr";
import { Button } from "@/components/ui/button";

export function ApproveForm({ mfrId }: { mfrId: string }) {
  const boundAction = approveMfrDefinition.bind(null, mfrId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {/* Approving is the moment the Finished Product / Packaged FP item
          pair actually gets created now (0041_mfr_deferred_approval.sql) —
          worth surfacing here since it's new information, not just a
          status flip. The page also re-renders with the linked item once
          this revalidates, so this is a one-time confirmation, not the
          only place to see it. */}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Approving…" : "Approve"}
      </Button>
    </form>
  );
}
