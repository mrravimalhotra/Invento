"use client";

import { useActionState } from "react";
import { setUserRoles, type ActionState } from "@/lib/actions/user-roles";
import { Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ROLES, ROLE_LABELS } from "@/lib/constants/roles";
import { formatDate } from "@/lib/utils";
import { ResetPasswordControl } from "./reset-password-control";
import { AccountAccessControl } from "./account-access-control";

export type AccountStatus = {
  email: string | null;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  disabled: boolean;
};

export function UserRoleRow({
  userId,
  displayName,
  isSelf,
  currentRoles,
  account,
}: {
  userId: string;
  displayName: string;
  isSelf: boolean;
  currentRoles: string[];
  // null when sign-in details aren't available (service-role key not set).
  account: AccountStatus | null;
}) {
  const boundAction = setUserRoles.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const disabled = account?.disabled ?? false;

  return (
    <div className={`flex flex-col gap-3 p-4 ${disabled ? "bg-black/[0.02]" : ""}`}>
      {disabled ? (
        <div className="min-w-[200px]">
          <p className="font-medium text-muted">{displayName}</p>
          {account?.email && <p className="text-xs text-muted">{account.email}</p>}
          <span className="mt-1 inline-block rounded bg-red-bg px-1.5 py-0.5 text-xs text-red">
            Disabled — cannot sign in
          </span>
        </div>
      ) : (
        <form
          action={formAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div className="min-w-[200px] shrink-0">
            <p className="font-medium text-foreground">
              {displayName}
              {isSelf && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
            </p>
            {account?.email && <p className="text-xs text-muted">{account.email}</p>}
            {account?.mustChangePassword ? (
              <span className="mt-1 inline-block rounded bg-amber-bg px-1.5 py-0.5 text-xs text-amber">
                Temporary password — not changed yet
              </span>
            ) : (
              account && (
                <p className="text-xs text-muted">
                  {account.lastSignInAt ? `Last sign-in ${formatDate(account.lastSignInAt)}` : "Never signed in"}
                </p>
              )
            )}
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
            {pending ? "Saving…" : "Save roles"}
          </Button>
        </form>
      )}
      {account && !isSelf && (
        <div className="flex flex-wrap items-start gap-2">
          {!disabled && <ResetPasswordControl userId={userId} displayName={displayName} />}
          <AccountAccessControl userId={userId} displayName={displayName} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
