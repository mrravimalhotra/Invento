"use client";

import { useActionState } from "react";
import { createDocument, type ActionState } from "@/lib/actions/documents";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export function NewDocumentForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createDocument, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Document type" htmlFor="doc_type" required>
        <Select id="doc_type" name="doc_type" required defaultValue="sop">
          <option value="sop">SOP — Standard Operating Procedure</option>
          <option value="stp">STP — Standard Testing Procedure</option>
        </Select>
      </Field>
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" placeholder="e.g. SOP of Sifter Operation" required autoFocus />
      </Field>
      <Field label="Revision number" htmlFor="revision_number" required>
        <Input id="revision_number" name="revision_number" type="number" step="1" min="0" defaultValue={0} required />
      </Field>
      <Field
        label="File URL"
        htmlFor="file_url"
        required
        hint="Link to the document (e.g. shared drive or storage URL). No file upload in this version — link only."
      >
        <Input id="file_url" name="file_url" type="url" placeholder="https://…" required />
      </Field>
      <Field label="Effective date" htmlFor="effective_date">
        <Input id="effective_date" name="effective_date" type="date" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Create document"}
        </Button>
        <LinkButton href="/documents" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
