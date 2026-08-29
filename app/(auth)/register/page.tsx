"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUp, undefined);
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
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Create account</h2>
      <p className="text-xs text-muted">
        Registering creates a sign-in only — it grants no roles. An existing System Admin assigns
        roles afterward on the User Roles &amp; Access screen.
      </p>
      {error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{error}</p>}
      <Field label="Full name" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" required />
      </Field>
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" required hint="At least 6 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          ref={passwordRef}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          ref={confirmRef}
        />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
