"use client";

import { useActionState } from "react";
import { createItemType, updateItemType, type ActionState } from "@/lib/actions/item-types";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

// Lives inline on the /item-types list page (see page.tsx) — no separate
// /new route to navigate to and back from, so there's no "Cancel" link here.
export function NewItemTypeForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItemType, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Description" htmlFor="description" required>
        <Input id="description" name="description" required autoFocus />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save item type"}
      </Button>
    </form>
  );
}

export function EditItemTypeForm({
  id,
  defaultDescription,
  defaultActive,
}: {
  id: string;
  defaultDescription: string;
  defaultActive: boolean;
}) {
  const boundAction = updateItemType.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Description" htmlFor="description" required>
        <Input id="description" name="description" defaultValue={defaultDescription} required autoFocus />
      </Field>
      <Checkbox name="active" label="Active" defaultChecked={defaultActive} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton href="/item-types" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
