"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useState } from "react";
import { createUserAccount, type AdminUserActionState } from "@/lib/actions/admin-users";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants/roles";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants/auth";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { generateTemporaryPassword } from "./temp-password";

type Submitted = { fullName: string; email: string; tempPassword: string };

export function AddUserForm() {
  const [state, formAction, pending] = useFlashActionState<AdminUserActionState, FormData>(
    createUserAccount,
    undefined
  );
  // Controlled fields so a validation error doesn't wipe what was typed
  // (React 19 resets uncontrolled fields after every form action).
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [created, setCreated] = useState<Submitted | null>(null);
  const [handledState, setHandledState] = useState<AdminUserActionState>(undefined);

  // Render-time adjustment (not an effect): when a new success result
  // arrives, remember what was created — so the admin can still copy the
  // temporary password — and clear the form for the next user.
  if (state !== handledState) {
    setHandledState(state);
    if (state?.success && submitted) {
      setCreated(submitted);
      setFullName("");
      setEmail("");
      setTempPassword("");
      setRoles([]);
    }
  }

  function toggleRole(role: Role, checked: boolean) {
    setRoles((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  }

  return (
    <form
      action={formAction}
      onSubmit={() => {
        setCreated(null);
        setSubmitted({ fullName: fullName.trim(), email: email.trim().toLowerCase(), tempPassword });
      }}
      className="flex flex-col gap-4 p-4"
    >
      {state?.error && <p className="rounded-md bg-red-bg px-3 py-2 text-sm text-red">{state.error}</p>}
      {state?.success && created && (
        <div className="rounded-md bg-brand-light px-3 py-2 text-sm text-brand-dark">
          <p>{state.success}</p>
          <p className="mt-1">
            Sign-in email: <span className="font-mono">{created.email}</span> · Temporary password:{" "}
            <span className="font-mono font-semibold">{created.tempPassword}</span>
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="new-user-name" required>
          <Input
            id="new-user-name"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field label="Email (used to sign in)" htmlFor="new-user-email" required>
          <Input
            id="new-user-email"
            name="email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      </div>

      <Field
        label="Temporary password"
        htmlFor="new-user-password"
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. The user must change it at first sign-in.`}
      >
        <div className="flex gap-2">
          <Input
            id="new-user-password"
            name="tempPassword"
            autoComplete="new-password"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={72}
            required
            className="font-mono"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setTempPassword(generateTemporaryPassword())}
          >
            Generate
          </Button>
        </div>
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-foreground">
          Roles<span className="ml-0.5 text-red">*</span>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ROLES.map((role) => (
            <Checkbox
              key={role}
              name="roles"
              value={role}
              label={ROLE_LABELS[role]}
              checked={roles.includes(role)}
              onChange={(e) => toggleRole(role, e.target.checked)}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending || roles.length === 0}>
          {pending ? "Creating…" : "Create user"}
        </Button>
        {roles.length === 0 && <span className="ml-3 text-xs text-muted">Select at least one role.</span>}
      </div>
    </form>
  );
}
