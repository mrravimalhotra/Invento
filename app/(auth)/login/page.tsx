"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, type ActionState } from "@/lib/actions/auth";
import { safeRedirectPath } from "@/lib/constants/auth";
import { Field, Input, PasswordInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, undefined);
  const params = useSearchParams();
  const next = safeRedirectPath(params.get("next"));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Sign in</h2>
      {state?.error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{state.error}</p>}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-brand hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted">
        No account? Ask your System Administrator to create one.
      </p>
    </form>
  );
}
