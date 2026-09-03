"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createItem, updateItem, deleteItem, type ActionState } from "@/lib/actions/items";
import { Field, Input, Select, Checkbox } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";

type ItemTypeOption = { id: string; description: string };

// Preview-only, e.g. { raw: "RM-00005", packaging: "PKG-00012" } — fetched
// once server-side (peek_next_item_code(), a non-consuming read of the
// sequence) and switched between client-side as Category changes, so
// picking a category never needs a round trip. The code actually assigned
// on save still comes from get_next_item_code() (nextval) inside
// createItem() — this is just what it WILL be if no one else creates an
// item in between.
type NextItemCodes = { raw: string; packaging: string };

export function NewItemForm({ itemTypes, nextCodes }: { itemTypes: ItemTypeOption[]; nextCodes: NextItemCodes }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createItem, undefined);
  const [category, setCategory] = useState<"raw" | "packaging">("raw");
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item code" htmlFor="item_code_preview" hint="Auto-generated — assigned exactly when you save.">
          <Input id="item_code_preview" value={nextCodes[category]} readOnly disabled />
        </Field>
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
          <Select
            id="category"
            name="category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as "raw" | "packaging")}
          >
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
        <Field label="Low stock threshold" htmlFor="low_stock_threshold" hint="Powers the topbar low-stock banner.">
          <Input id="low_stock_threshold" name="low_stock_threshold" type="number" step="any" min="0" />
        </Field>
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
        {item.category === "processed" || item.category === "packaged_fp" ? (
          <Field
            label="Category"
            htmlFor="category"
            hint={
              item.category === "packaged_fp"
                ? "Auto-created alongside its paired Finished Product item — locked from here on."
                : "Set once, from MFR, when this Finished Product item was created — locked from here on."
            }
          >
            <Input id="category" value={item.category === "packaged_fp" ? "Packaged finished product" : "Finished product"} readOnly disabled />
            <input type="hidden" name="category" value={item.category} />
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
      {/* Bug found via live testing (1 Sep 2026): this branch never rendered
          state.error, so a blocked delete (FK violation) failed silently —
          the form just snapped back to "Yes, delete" with no explanation.
          Confirmed live against a Finished Product item linked to an MFR. */}
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
