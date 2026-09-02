"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPurchaseOrder, deletePurchaseOrder, type ActionState } from "@/lib/actions/purchase";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { isLegacyCode } from "@/lib/utils";

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
            <option key={v.id} value={v.id} data-legacy={isLegacyCode(v.vendor_code) ? "1" : undefined}>
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

// FB-0015 ("admin should be able to delete purchase records"): delete is
// restricted to system_admin — see deletePurchaseOrder() in
// lib/actions/purchase.ts. Rendered only when the caller passes
// isSystemAdmin, itself computed from the signed-in user's roles in
// [id]/page.tsx. Same two-step-confirm pattern as DeleteItemForm
// (items/item-form.tsx) and DeleteMfrForm.
export function DeletePurchaseOrderForm({ id, poNumber }: { id: string; poNumber: string }) {
  const boundAction = deletePurchaseOrder.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete purchase order
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{poNumber}</strong> and all its lines? This can&apos;t be undone.
      </p>
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
