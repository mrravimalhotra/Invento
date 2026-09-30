"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useRef, useState } from "react";
import { updateProfile, updatePassword, type ActionState } from "@/lib/actions/auth";
import { Field, Input, PasswordInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/auth";

export function ProfileForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(updateProfile, undefined);
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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(updatePassword, undefined);
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
      <Field label="New password" htmlFor="password" hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          ref={passwordRef}
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
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
