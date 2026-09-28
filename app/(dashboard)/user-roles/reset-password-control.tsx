"use client";

import { useActionState, useState } from "react";
import { resetUserPassword, type AdminUserActionState } from "@/lib/actions/admin-users";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/auth";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { generateTemporaryPassword } from "./temp-password";

// Two-step, in-place control (same convention as the app's delete buttons):
// "Reset password" → enter/generate a temporary password → Confirm.
export function ResetPasswordControl({ userId, displayName }: { userId: string; displayName: string }) {
  const boundAction = resetUserPassword.bind(null, userId);
  const [state, formAction, pending] = useActionState<AdminUserActionState, FormData>(boundAction, undefined);
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [handledState, setHandledState] = useState<AdminUserActionState>(undefined);

  if (state !== handledState) {
    setHandledState(state);
    if (state?.success) {
      setIssued(submitted);
      setOpen(false);
      setTempPassword("");
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setIssued(null);
            setOpen(true);
          }}
        >
          Reset password
        </Button>
        {issued && (
          <p className="text-xs text-brand-dark">
            Temporary password for {displayName}: <span className="font-mono font-semibold">{issued}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={() => setSubmitted(tempPassword)}
      className="flex flex-col gap-2 rounded-md border border-border p-3"
    >
      <p className="text-xs text-muted">
        Set a temporary password for {displayName}. They&apos;ll have to change it at next sign-in, and
        any session they have open is sent to the change-password screen.
      </p>
      <div className="flex gap-2">
        <Input
          name="tempPassword"
          aria-label={`Temporary password for ${displayName}`}
          autoComplete="new-password"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={72}
          required
          className="font-mono"
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => setTempPassword(generateTemporaryPassword())}>
          Generate
        </Button>
      </div>
      {state?.error && <p className="text-xs text-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={pending}>
          {pending ? "Resetting…" : "Confirm reset"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
