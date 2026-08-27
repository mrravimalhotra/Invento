"use client";

import { useActionState } from "react";
import { updateProfile, updatePassword, type ActionState } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function ProfileForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateProfile, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="Full name" htmlFor="fullName">
        <Input id="fullName" name="fullName" defaultValue={defaultName} required />
      </Field>
      <div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePassword, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="New password" htmlFor="password" hint="At least 6 characters.">
        <Input id="password" name="password" type="password" minLength={6} required />
      </Field>
      <div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
