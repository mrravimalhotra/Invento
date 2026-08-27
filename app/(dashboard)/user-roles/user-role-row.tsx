"use client";

import { useActionState } from "react";
import { setUserRoles, type ActionState } from "@/lib/actions/user-roles";
import { Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ROLES, ROLE_LABELS } from "@/lib/constants/roles";

export function UserRoleRow({
  userId,
  displayName,
  isSelf,
  currentRoles,
}: {
  userId: string;
  displayName: string;
  isSelf: boolean;
  currentRoles: string[];
}) {
  const boundAction = setUserRoles.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="min-w-[160px] shrink-0">
        <p className="font-medium text-foreground">
          {displayName}
          {isSelf && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
        </p>
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
        {state?.success && <p className="mt-1 text-xs text-brand-dark">{state.success}</p>}
      </div>
      <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">
        {ROLES.map((role) => (
          <Checkbox
            key={role}
            name="roles"
            value={role}
            label={ROLE_LABELS[role]}
            defaultChecked={currentRoles.includes(role)}
          />
        ))}
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="shrink-0">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
