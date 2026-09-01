"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { createItemType, updateItemType, deleteItemType, type ActionState } from "@/lib/actions/item-types";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

// Lives inline on the /item-types list page (see page.tsx) — no separate
// /new route to navigate to and back from, so there's no "Cancel" link here.
export function NewItemTypeForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItemType, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear the field after a successful add so the person can keep adding
    // item types back-to-back.
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
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

// FB-0004: delete is restricted to system_admin — see deleteItemType() in
// lib/actions/item-types.ts. Rendered only when the caller passes
// isSystemAdmin, itself computed from the signed-in user's roles in
// [id]/page.tsx (canWrite() alone is too permissive for this gate).
export function DeleteItemTypeForm({ id, description }: { id: string; description: string }) {
  const boundAction = deleteItemType.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete item type
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{description}</strong>? This can&apos;t be undone.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
