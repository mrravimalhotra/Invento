"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Reset password</h2>
      {state?.error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{state.error}</p>}
      {state?.success && (
        <p className="rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">{state.success}</p>
      )}
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
