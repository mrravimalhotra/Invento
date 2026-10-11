"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
import { useEffect, useState } from "react";
import {
  deletePurchaseOrder,
  submitPurchaseOrder,
  reopenPurchaseOrder,
  updatePurchaseOrderHeader,
  type ActionState,
} from "@/lib/actions/purchase";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { todayIst } from "@/lib/utils";

// The "new purchase order" header form itself now lives in
// new-purchase-order-form.tsx, not here — it needs to render
// PurchaseOrderView (below) once the header's saved, and PurchaseOrderView
// needs the three forms this file exports, so keeping the header form in
// its own file avoids a circular import between the two.

// FB-0015 ("admin should be able to delete purchase records"): delete is
// restricted to system_admin — see deletePurchaseOrder() in
// lib/actions/purchase.ts. Rendered only when the caller passes
// isSystemAdmin, itself computed from the signed-in user's roles in
// [id]/page.tsx. Same two-step-confirm pattern as DeleteItemForm
// (items/item-form.tsx) and DeleteMfrForm.
export function DeletePurchaseOrderForm({ id, poNumber }: { id: string; poNumber: string }) {
  const boundAction = deletePurchaseOrder.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);

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
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
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


// SCAN-P3-02: fix a typo in the invoice number / date / received-on (and the vendor while the
// order has no lines) without deleting the order. Draft or reopened orders only.
export type VendorChoice = { id: string; vendor_code: string; name: string };

export function EditInvoiceDetailsForm({
  id,
  vendorId,
  vendors,
  invoiceNumber,
  invoiceDate,
  receivedOn,
  loadedAt,
  hasLines,
}: {
  id: string;
  vendorId: string | null;
  vendors: VendorChoice[];
  invoiceNumber: string;
  invoiceDate: string;
  receivedOn: string | null;
  loadedAt?: string | null;
  hasLines: boolean;
}) {
  const boundAction = updatePurchaseOrderHeader.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Edit invoice details
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid w-full gap-4 rounded border border-border p-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      {loadedAt !== undefined && <input type="hidden" name="loaded_at" value={loadedAt ?? ""} />}
      {!hasLines ? (
        <Field label="Vendor" htmlFor="edit_vendor_id" required>
          <Select id="edit_vendor_id" name="vendor_id" defaultValue={vendorId ?? ""} required>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_code} — {v.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-xs text-muted">The vendor can&apos;t be changed once the order has lines.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Invoice number" htmlFor="edit_invoice_number" required>
          <Input id="edit_invoice_number" name="invoice_number" defaultValue={invoiceNumber} required />
        </Field>
        <Field label="Invoice date" htmlFor="edit_invoice_date" required>
          <Input id="edit_invoice_date" name="invoice_date" type="date" max={todayIst()} defaultValue={invoiceDate} required />
        </Field>
        <Field label="Received on" htmlFor="edit_received_on" required hint="Printed as Date of Receipt on the RM label.">
          <Input id="edit_received_on" name="received_on" type="date" max={todayIst()} defaultValue={receivedOn ?? todayIst()} required />
        </Field>
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save invoice details"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Close
        </Button>
      </div>
    </form>
  );
}
