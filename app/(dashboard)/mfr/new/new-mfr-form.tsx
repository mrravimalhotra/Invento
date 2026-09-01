"use client";

import { useActionState } from "react";
import { createMfrDefinition, type ActionState } from "@/lib/actions/mfr";
import { Field, Input, Select, ErrorText } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";
import { MfrLineEditor, type RawItemOption } from "../mfr-line-editor";

export function NewMfrForm({
  itemTypes,
  rawItems,
}: {
  itemTypes: { id: string; description: string }[];
  rawItems: RawItemOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createMfrDefinition, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <div className="rounded-md border border-border bg-black/[0.02] p-3 text-sm text-muted">
        Creating this MFR also creates its Finished Product master entry (an
        auto-numbered <code>FP-</code> item, same as this recipe&apos;s Name) —
        Item Master no longer has its own way to add a Finished Product
        directly.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" required hint="Also becomes the Finished Product item's name.">
          <Input id="name" name="name" required autoFocus />
        </Field>
        <Field label="Item type" htmlFor="item_type_id" hint="Set on the Finished Product item.">
          <Select id="item_type_id" name="item_type_id" defaultValue="">
            <option value="">—</option>
            {itemTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch size quantity" htmlFor="batch_size_qty" required>
          <Input id="batch_size_qty" name="batch_size_qty" type="number" step="any" min="0" required />
        </Field>
        <Field
          label="Batch size unit"
          htmlFor="batch_size_unit"
          required
          hint="Also becomes the Finished Product item's stocking unit."
        >
          <Select id="batch_size_unit" name="batch_size_unit" defaultValue="" required>
            <option value="">Select unit…</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Recipe (version 1)</h3>
        {rawItems.length === 0 ? (
          <ErrorText>No raw-material items exist yet — add one on the Item Master screen first.</ErrorText>
        ) : (
          <MfrLineEditor rawItems={rawItems} />
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || rawItems.length === 0}>
          {pending ? "Creating…" : "Create MFR"}
        </Button>
        <LinkButton href="/mfr" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
