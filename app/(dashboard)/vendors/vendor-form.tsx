"use client";

import { useActionState } from "react";
import { createVendor, updateVendor, type ActionState } from "@/lib/actions/vendors";
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

export function VendorForm({ vendor }: { vendor?: Vendor }) {
  const action = vendor ? updateVendor.bind(null, vendor.id) : createVendor;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      {vendor && (
        <Field label="Vendor code">
          <Input value={vendor.vendor_code} readOnly disabled />
        </Field>
      )}
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={vendor?.name} required />
      </Field>
      <Field label="Address" htmlFor="address">
        <Input id="address" name="address" defaultValue={vendor?.address ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" htmlFor="mobile">
          <Input id="mobile" name="mobile" defaultValue={vendor?.mobile ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={vendor?.phone ?? ""} />
        </Field>
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={vendor?.email ?? ""} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : vendor ? "Save changes" : "Create vendor"}
        </Button>
        <LinkButton href="/vendors" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
