"use client";

import { useActionState, useState } from "react";
import { disableUserAccount, enableUserAccount, type AdminUserActionState } from "@/lib/actions/admin-users";
import { Button } from "@/components/ui/button";

// Disable (leaver) / re-enable an account. Disable is two-step, like the
// app's delete buttons and Reset password; re-enable is one click because it
// grants nothing by itself — the account comes back with no roles.
export function AccountAccessControl({
  userId,
  displayName,
  disabled,
}: {
  userId: string;
  displayName: string;
  disabled: boolean;
}) {
  const [disableState, disableAction, disabling] = useActionState<AdminUserActionState, FormData>(
    disableUserAccount.bind(null, userId),
    undefined
  );
  const [enableState, enableAction, enabling] = useActionState<AdminUserActionState, FormData>(
    enableUserAccount.bind(null, userId),
    undefined
  );
  const [confirming, setConfirming] = useState(false);
  const [handled, setHandled] = useState<AdminUserActionState>(undefined);

  if (disableState !== handled) {
    setHandled(disableState);
    if (disableState?.success) setConfirming(false);
  }

  const message = (
    <>
      {disableState?.error && <p className="text-xs text-red">{disableState.error}</p>}
      {enableState?.error && <p className="text-xs text-red">{enableState.error}</p>}
      {disabled && disableState?.success && <p className="text-xs text-brand-dark">{disableState.success}</p>}
      {!disabled && enableState?.success && <p className="text-xs text-brand-dark">{enableState.success}</p>}
    </>
  );

  if (disabled) {
    return (
      <form action={enableAction} className="flex flex-col items-start gap-1">
        <Button type="submit" size="sm" variant="secondary" disabled={enabling}>
          {enabling ? "Enabling…" : "Re-enable account"}
        </Button>
        {message}
      </form>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
          Disable account
        </Button>
        {message}
      </div>
    );
  }

  return (
    <form action={disableAction} className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted">
        Disable {displayName}&apos;s account? They are signed out and can no longer sign in, and all
        their roles are removed (the Audit Log keeps a record of them). Their past work stays
        attributed to them. You can re-enable the account later.
      </p>
      {message}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={disabling}>
          {disabling ? "Disabling…" : "Confirm disable"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={disabling}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
