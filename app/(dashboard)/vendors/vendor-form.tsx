"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createVendor, updateVendor, deleteVendor, type ActionState } from "@/lib/actions/vendors";
import { Field, Input } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

type Vendor = {
  id: string;
  vendor_code: string;
  name: string;
  address: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
};

// Lives inline on the /vendors list page (see page.tsx) — no separate /new
// route to navigate to and back from, matching the same "add form and list
// share the page" pattern already used by Item Type Master. `nextVendorCode`
// is a preview only: peek_next_vendor_code() (0012_peek_next_codes.sql)
// reads the sequence without consuming it, so it can go stale if someone
// else creates a vendor in the same moment — the code actually assigned on
// save always comes from get_next_vendor_code() (nextval) inside
// createVendor() itself.
export function NewVendorForm({ nextVendorCode }: { nextVendorCode: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createVendor, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Vendor code" hint="Auto-generated — assigned exactly when you save.">
        <Input value={nextVendorCode} readOnly disabled />
      </Field>
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" required autoFocus />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" />
        </Field>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save vendor"}
      </Button>
    </form>
  );
}

export function EditVendorForm({ vendor }: { vendor: Vendor }) {
  const boundAction = updateVendor.bind(null, vendor.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="Vendor code">
        <Input value={vendor.vendor_code} readOnly disabled />
      </Field>
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={vendor.name} required />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" defaultValue={vendor.address ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" defaultValue={vendor.mobile ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={vendor.phone ?? ""} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={vendor.email ?? ""} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton href="/vendors" variant="secondary">
          Back to list
        </LinkButton>
      </div>
    </form>
  );
}

// Delete is restricted to system_admin — see deleteVendor() in
// lib/actions/vendors.ts. Rendered only when the caller passes
// isSystemAdmin, itself computed from the signed-in user's roles in
// [id]/page.tsx (canWrite() alone is too permissive for this gate). Same
// two-step-confirm pattern as DeleteItemTypeForm / DeleteItemForm.
export function DeleteVendorForm({ id, name }: { id: string; name: string }) {
  const boundAction = deleteVendor.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete vendor
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{name}</strong>? This can&apos;t be undone.
      </p>
      {/* See the matching fix + comment in items/item-form.tsx's
          DeleteItemForm — this branch had the same bug: a blocked delete
          failed silently since state.error was never rendered here. */}
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
