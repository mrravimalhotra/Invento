"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createItem, updateItem, deleteItem, type ActionState } from "@/lib/actions/items";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";

type ItemTypeOption = { id: string; description: string };

export function NewItemForm({ itemTypes }: { itemTypes: ItemTypeOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItem, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" required autoFocus />
        </Field>
        <Field label="Botanical alias" htmlFor="botanical_alias">
          <Input id="botanical_alias" name="botanical_alias" />
        </Field>
        <Field
          label="Category"
          htmlFor="category"
          required
          hint="Finished products are created from MFR → New MFR, not here."
        >
          <Select id="category" name="category" required defaultValue="raw">
            <option value="raw">Raw material</option>
            <option value="packaging">Packaging</option>
          </Select>
        </Field>
        <Field label="Item type" htmlFor="item_type_id">
          <Select id="item_type_id" name="item_type_id" defaultValue="">
            <option value="">— none —</option>
            {itemTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Select id="unit" name="unit" defaultValue="">
            <option value="">— none —</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Barcode" htmlFor="barcode" hint="Optional, must be unique.">
          <Input id="barcode" name="barcode" />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium text-foreground">Sampling &amp; stock defaults</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Default QC qty" htmlFor="default_qc_qty" hint="Pre-fills Purchase.">
            <Input id="default_qc_qty" name="default_qc_qty" type="number" step="any" min="0" />
          </Field>
          <Field label="Default stability qty" htmlFor="default_stability_qty">
            <Input id="default_stability_qty" name="default_stability_qty" type="number" step="any" min="0" />
          </Field>
          <Field label="Default R&D qty" htmlFor="default_rnd_qty">
            <Input id="default_rnd_qty" name="default_rnd_qty" type="number" step="any" min="0" />
          </Field>
          <Field
            label="Default sample unit"
            htmlFor="default_sample_unit"
            hint="Shared by QC / stability / R&D above, e.g. gm when the item's own unit is kg."
          >
            <Select id="default_sample_unit" name="default_sample_unit" defaultValue="">
              <option value="">— same as item unit —</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Low stock threshold" htmlFor="low_stock_threshold" hint="Powers the topbar low-stock banner.">
            <Input id="low_stock_threshold" name="low_stock_threshold" type="number" step="any" min="0" />
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create item"}
        </Button>
        <LinkButton href="/items" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

export function EditItemForm({
  id,
  itemTypes,
  item,
}: {
  id: string;
  itemTypes: ItemTypeOption[];
  item: {
    name: string;
    botanical_alias: string | null;
    category: string;
    item_type_id: string | null;
    unit: string | null;
    default_qc_qty: string | number | null;
    default_stability_qty: string | number | null;
    default_rnd_qty: string | number | null;
    default_sample_unit: string | null;
    low_stock_threshold: string | number | null;
    barcode: string | null;
    active: boolean;
  };
}) {
  const boundAction = updateItem.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required>
          <Input id="name" name="name" defaultValue={item.name} required autoFocus />
        </Field>
        <Field label="Botanical alias" htmlFor="botanical_alias">
          <Input id="botanical_alias" name="botanical_alias" defaultValue={item.botanical_alias ?? ""} />
        </Field>
        {item.category === "processed" ? (
          <Field
            label="Category"
            htmlFor="category"
            hint="Set once, from MFR, when this Finished Product item was created — locked from here on."
          >
            <Input id="category" value="Finished product" readOnly disabled />
            <input type="hidden" name="category" value="processed" />
          </Field>
        ) : (
          <Field label="Category" htmlFor="category" required>
            <Select id="category" name="category" required defaultValue={item.category}>
              <option value="raw">Raw material</option>
              <option value="packaging">Packaging</option>
            </Select>
          </Field>
        )}
        <Field label="Item type" htmlFor="item_type_id">
          <Select id="item_type_id" name="item_type_id" defaultValue={item.item_type_id ?? ""}>
            <option value="">— none —</option>
            {itemTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Select id="unit" name="unit" defaultValue={item.unit ?? ""}>
            <option value="">— none —</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Barcode" htmlFor="barcode" hint="Optional, must be unique.">
          <Input id="barcode" name="barcode" defaultValue={item.barcode ?? ""} />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium text-foreground">Sampling &amp; stock defaults</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Default QC qty" htmlFor="default_qc_qty" hint="Pre-fills Purchase.">
            <Input
              id="default_qc_qty"
              name="default_qc_qty"
              type="number"
              step="any"
              min="0"
              defaultValue={item.default_qc_qty ?? ""}
            />
          </Field>
          <Field label="Default stability qty" htmlFor="default_stability_qty">
            <Input
              id="default_stability_qty"
              name="default_stability_qty"
              type="number"
              step="any"
              min="0"
              defaultValue={item.default_stability_qty ?? ""}
            />
          </Field>
          <Field label="Default R&D qty" htmlFor="default_rnd_qty">
            <Input
              id="default_rnd_qty"
              name="default_rnd_qty"
              type="number"
              step="any"
              min="0"
              defaultValue={item.default_rnd_qty ?? ""}
            />
          </Field>
          <Field
            label="Default sample unit"
            htmlFor="default_sample_unit"
            hint="Shared by QC / stability / R&D above, e.g. gm when the item's own unit is kg."
          >
            <Select id="default_sample_unit" name="default_sample_unit" defaultValue={item.default_sample_unit ?? ""}>
              <option value="">— same as item unit —</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Low stock threshold" htmlFor="low_stock_threshold" hint="Powers the topbar low-stock banner.">
            <Input
              id="low_stock_threshold"
              name="low_stock_threshold"
              type="number"
              step="any"
              min="0"
              defaultValue={item.low_stock_threshold ?? ""}
            />
          </Field>
        </div>
      </div>

      <Checkbox name="active" label="Active" defaultChecked={item.active} />

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <LinkButton href="/items" variant="secondary">
          Back to list
        </LinkButton>
      </div>
    </form>
  );
}

// Delete is restricted to system_admin — see deleteItem() in
// lib/actions/items.ts. Rendered only when the caller passes isSystemAdmin,
// itself computed from the signed-in user's roles in [id]/page.tsx
// (canWrite() alone is too permissive for this gate). Same two-step-confirm
// pattern as DeleteItemTypeForm in item-types/item-type-form.tsx.
export function DeleteItemForm({ id, name }: { id: string; name: string }) {
  const boundAction = deleteItem.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
          Delete item
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{name}</strong>? This can&apos;t be undone.
      </p>
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
