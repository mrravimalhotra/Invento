"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { createPurchaseOrder, deletePurchaseOrder, submitPurchaseOrder, reopenPurchaseOrder, type ActionState } from "@/lib/actions/purchase";
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

// FB-0018 ("final submit button post which the record should be
// committed"): one-click, no two-step confirm — matches the Approve/
// Deactivate convention elsewhere (MFR's ToggleMfrActiveForm), since
// Reopen below is the built-in undo path rather than a second dialog
// here. Only shown while the PO is still draft and canEditLines (write
// role) is true — see page.tsx.
export function SubmitPurchaseOrderForm({ id }: { id: string }) {
  const boundAction = submitPurchaseOrder.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Final submit"}
      </Button>
    </form>
  );
}

// Reversing already-committed inventory is a bigger action than editing a
// draft line, so — unlike Submit — this keeps a two-step confirm and is
// system_admin-only (reopenPurchaseOrder() enforces the same server-side).
export function ReopenPurchaseOrderForm({ id }: { id: string }) {
  const boundAction = reopenPurchaseOrder.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // One-shot reaction to a successful reopen, not a sync loop — same
    // accepted pattern as purchase-line-form.tsx's post-submit reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state?.success) setConfirming(false);
  }, [state]);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          Reopen for edit
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2 rounded border border-border p-3">
      <p className="text-sm">
        Reopen this purchase order? The inventory it already pushed will be reversed until it&apos;s submitted again.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Reopening…" : "Yes, reopen"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
