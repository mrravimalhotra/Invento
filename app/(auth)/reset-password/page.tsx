"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword, type ActionState } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePassword, undefined);
  const router = useRouter();
  const [clientError, setClientError] = useState<string | undefined>();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.success) {
      const t = setTimeout(() => router.push("/"), 1200);
      return () => clearTimeout(t);
    }
  }, [state?.success, router]);

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
      <h2 className="text-lg font-semibold">Set a new password</h2>
      {error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{error}</p>}
      {state?.success && (
        <p className="rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          {state.success} Redirecting…
        </p>
      )}
      <Field label="New password" htmlFor="password" required hint="At least 6 characters.">
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
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
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
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
