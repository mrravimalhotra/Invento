"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useState } from "react";
import { setIdleTimeout, type AdminUserActionState } from "@/lib/actions/admin-users";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

// SCAN-P1-02: sign people out after a period without activity. Default 60
// minutes; the tick switches it off. A System Admin is never signed out.
export function IdleTimeoutForm({ minutes }: { minutes: number }) {
  const [state, formAction, pending] = useFlashActionState<AdminUserActionState, FormData>(setIdleTimeout, undefined);
  const [enabled, setEnabled] = useState(minutes > 0);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Checkbox
        name="enabled"
        label="Sign people out automatically after a period of inactivity"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
      <Field label="Minutes of inactivity" htmlFor="minutes" hint="From 5 to 480. A warning shows 2 minutes before the sign-out.">
        <Input
          id="minutes"
          name="minutes"
          type="number"
          min={5}
          max={480}
          step={1}
          defaultValue={minutes > 0 ? minutes : 60}
          disabled={!enabled}
          className="max-w-32"
        />
      </Field>
      <p className="text-xs text-muted">
        Applies to every role except System Admin, who is never signed out by this. It counts key presses, clicks and
        mouse movement in any open Invento tab.
      </p>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
