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
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Approving…" : "Approve"}
      </Button>
    </form>
  );
}
