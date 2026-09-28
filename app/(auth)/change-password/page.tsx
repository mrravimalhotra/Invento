"use client";

import { useActionState, useRef, useState } from "react";
import { completePasswordChange, type AdminUserActionState } from "@/lib/actions/admin-users";
import { signOut } from "@/lib/actions/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/auth";
import { Field, PasswordInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

// First sign-in / after an admin reset: proxy.ts sends every request here
// until the user replaces the temporary password a System Admin gave them.
export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState<AdminUserActionState, FormData>(
    completePasswordChange,
    undefined
  );
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
    <div className="flex flex-col gap-4">
      <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Set your new password</h2>
        <p className="text-sm text-muted">
          You&apos;re signed in with a temporary password from your System Admin. Choose your own
          password to continue.
        </p>
        {error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{error}</p>}
        <Field
          label="New password"
          htmlFor="password"
          required
          hint={`At least ${PASSWORD_MIN_LENGTH} characters, different from the temporary password.`}
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={72}
            required
            ref={passwordRef}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={72}
            required
            ref={confirmRef}
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save and continue"}
        </Button>
      </form>
      <form action={signOut} className="text-center">
        <button type="submit" className="text-sm text-muted hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
