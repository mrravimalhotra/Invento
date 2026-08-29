"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile, updatePassword, type ActionState } from "@/lib/actions/auth";
import { Field, Input, PasswordInput } from "@/components/ui/form";
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
  const [clientError, setClientError] = useState<string | undefined>();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (passwordRef.current?.value !== confirmRef.current?.value) {
      e.preventDefault();
      setClientError("Passwords do not match.");
      return;
    }
    setClientError(undefined);
  }

  const error = clientError ?? state?.error;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <p className="text-sm text-red">{error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="New password" htmlFor="password" hint="At least 6 characters.">
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={6}
          required
          ref={passwordRef}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={6}
          required
          ref={confirmRef}
        />
      </Field>
      <div>
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Saving…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
