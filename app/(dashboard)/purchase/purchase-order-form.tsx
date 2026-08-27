"use client";

import { useActionState } from "react";
import { createPurchaseOrder, type ActionState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

type VendorOption = { id: string; vendor_code: string; name: string };

export function PurchaseOrderForm({ vendors }: { vendors: VendorOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPurchaseOrder, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Vendor" htmlFor="vendor_id" required>
        <Select id="vendor_id" name="vendor_id" required defaultValue="">
          <option value="" disabled>
            Select vendor…
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.vendor_code} — {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Invoice number" htmlFor="invoice_number" required>
          <Input id="invoice_number" name="invoice_number" required />
        </Field>
        <Field label="Invoice date" htmlFor="invoice_date" required>
          <Input id="invoice_date" name="invoice_date" type="date" required />
        </Field>
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create purchase order"}
        </Button>
        <LinkButton href="/purchase" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
