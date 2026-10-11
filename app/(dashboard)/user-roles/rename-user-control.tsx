"use client";

import { useState } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { renameUser, type AdminUserActionState } from "@/lib/actions/admin-users";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

// SCAN-P2-12: only the System Administrator changes a display name; it appears on QC decisions,
// certificates and the audit trail.
export function RenameUserControl({ userId, displayName }: { userId: string; displayName: string }) {
  const boundAction = renameUser.bind(null, userId);
  const [state, formAction, pending] = useFlashActionState<AdminUserActionState, FormData>(boundAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Change name
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Input
        name="fullName"
        defaultValue={displayName === "(no name set)" ? "" : displayName}
        maxLength={100}
        required
        aria-label={`Display name of ${displayName}`}
        className="w-64"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save name"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {state?.error && <p className="w-full text-xs text-red">{state.error}</p>}
      {state?.success && <p className="w-full text-xs text-brand-dark">{state.success}</p>}
    </form>
  );
}
