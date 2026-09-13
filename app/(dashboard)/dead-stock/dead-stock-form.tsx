"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  createDeadStockItem,
  updateDeadStockItem,
  deleteDeadStockItem,
  type ActionState,
} from "@/lib/actions/dead-stock";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

type DeadStockItem = {
  id: string;
  asset_code: string;
  article_name: string;
  date_of_purchase: string | null;
  quantity: number;
  purchase_price: number | null;
  depreciation_pct: number;
  depreciated_unit_value: number | null;
  resolution_date: string | null;
  rejected_qty: number;
  rejected_value: number;
  balance_qty: number | null;
  balance_value: number | null;
  remark: string | null;
  active: boolean;
};

// Lives inline on the /dead-stock list page (see page.tsx) — same
// "add form and list share the page" pattern as every other master-data
// screen. Balance qty/value are plain editable fields, not auto-computed —
// see the note in 0035_dead_stock_register.sql for why.
export function NewDeadStockForm({ nextAssetCode }: { nextAssetCode: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDeadStockItem, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Asset code" hint="Auto-generated — assigned exactly when you save.">
        <Input value={nextAssetCode} readOnly disabled />
      </Field>
      <Field label="Name of the article" htmlFor="article_name" required>
        <Input id="article_name" name="article_name" required autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of purchase" htmlFor="date_of_purchase">
          <Input id="date_of_purchase" name="date_of_purchase" type="date" />
        </Field>
        <Field label="Quantity" htmlFor="quantity">
          <Input id="quantity" name="quantity" type="number" step="1" min="1" defaultValue={1} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Purchase price" htmlFor="purchase_price" hint="Per unit, not a line total.">
          <Input id="purchase_price" name="purchase_price" type="number" step="0.01" min="0" />
        </Field>
        <Field label="Depreciation %" htmlFor="depreciation_pct">
          <Input id="depreciation_pct" name="depreciation_pct" type="number" step="0.01" min="0" max="100" defaultValue={25} />
        </Field>
      </div>
      <Field label="Resolution date" htmlFor="resolution_date">
        <Input id="resolution_date" name="resolution_date" type="date" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rejected qty" htmlFor="rejected_qty">
          <Input id="rejected_qty" name="rejected_qty" type="number" step="1" min="0" defaultValue={0} />
        </Field>
        <Field label="Rejected value" htmlFor="rejected_value">
          <Input id="rejected_value" name="rejected_value" type="number" step="0.01" min="0" defaultValue={0} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Balance qty" htmlFor="balance_qty" hint="Entered by hand, not computed.">
          <Input id="balance_qty" name="balance_qty" type="number" step="1" min="0" />
        </Field>
        <Field label="Balance value" htmlFor="balance_value" hint="Entered by hand, not computed.">
          <Input id="balance_value" name="balance_value" type="number" step="0.01" min="0" />
        </Field>
      </div>
      <Field label="Remark" htmlFor="remark">
        <Input id="remark" name="remark" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save asset"}
      </Button>
    </form>
  );
}

export function EditDeadStockForm({ item }: { item: DeadStockItem }) {
  const boundAction = updateDeadStockItem.bind(null, item.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <Field label="Asset code">
        <Input value={item.asset_code} readOnly disabled />
      </Field>
      <Field label="Name of the article" htmlFor="article_name" required>
        <Input id="article_name" name="article_name" defaultValue={item.article_name} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date of purchase" htmlFor="date_of_purchase">
          <Input id="date_of_purchase" name="date_of_purchase" type="date" defaultValue={item.date_of_purchase ?? ""} />
        </Field>
        <Field label="Quantity" htmlFor="quantity">
          <Input id="quantity" name="quantity" type="number" step="1" min="1" defaultValue={item.quantity} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Purchase price" htmlFor="purchase_price" hint="Per unit, not a line total.">
          <Input
            id="purchase_price"
            name="purchase_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.purchase_price ?? ""}
          />
        </Field>
        <Field label="Depreciation %" htmlFor="depreciation_pct">
          <Input
            id="depreciation_pct"
            name="depreciation_pct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={item.depreciation_pct}
          />
        </Field>
      </div>
      <Field label="Depreciated value / unit" hint="Computed: purchase price × (100 − depreciation %).">
        <Input value={item.depreciated_unit_value ?? "—"} readOnly disabled />
      </Field>
      <Field label="Resolution date" htmlFor="resolution_date">
        <Input id="resolution_date" name="resolution_date" type="date" defaultValue={item.resolution_date ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rejected qty" htmlFor="rejected_qty">
          <Input id="rejected_qty" name="rejected_qty" type="number" step="1" min="0" defaultValue={item.rejected_qty} />
        </Field>
        <Field label="Rejected value" htmlFor="rejected_value">
          <Input
            id="rejected_value"
            name="rejected_value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.rejected_value}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Balance qty" htmlFor="balance_qty" hint="Entered by hand, not computed.">
          <Input id="balance_qty" name="balance_qty" type="number" step="1" min="0" defaultValue={item.balance_qty ?? ""} />
        </Field>
        <Field label="Balance value" htmlFor="balance_value" hint="Entered by hand, not computed.">
          <Input
            id="balance_value"
            name="balance_value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.balance_value ?? ""}
          />
        </Field>
      </div>
      <Field label="Remark" htmlFor="remark">
        <Input id="remark" name="remark" defaultValue={item.remark ?? ""} />
      </Field>
      <Checkbox label="Active" name="active" defaultChecked={item.active} />
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton href="/dead-stock" variant="secondary">
          Back to list
        </LinkButton>
      </div>
    </form>
  );
}

// Delete is restricted to system_admin — see deleteDeadStockItem() in
// lib/actions/dead-stock.ts. Same two-step-confirm pattern used everywhere
// else in the app.
export function DeleteDeadStockForm({ id, name }: { id: string; name: string }) {
  const boundAction = deleteDeadStockItem.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete asset
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{name}</strong>? This can&apos;t be undone.
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
