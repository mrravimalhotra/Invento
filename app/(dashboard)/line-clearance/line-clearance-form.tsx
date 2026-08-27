"use client";

import { useActionState } from "react";
import { createLineClearanceCheck, type ActionState } from "@/lib/actions/line-clearance";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export function NewLineClearanceForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createLineClearanceCheck,
    undefined
  );
  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Area" htmlFor="area" required>
        <Input id="area" name="area" placeholder="e.g. Granulation Room 1" required autoFocus />
      </Field>
      <Field label="Batch reference" htmlFor="batch_reference" hint="Optional — e.g. the batch number this clearance is for.">
        <Input id="batch_reference" name="batch_reference" placeholder="e.g. FP-0012" />
      </Field>
      <Field label="Status" htmlFor="status" required>
        <Select id="status" name="status" required defaultValue="clear">
          <option value="clear">Clear</option>
          <option value="not_clear">Not clear</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record check"}
        </Button>
        <LinkButton href="/line-clearance" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
