"use client";

import { useActionState } from "react";
import { createCoaRecord, type ActionState } from "@/lib/actions/coa";
import { Field, Select, Input } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export type ApprovedQc = {
  id: string;
  ar_number: string;
  items: { item_code: string; name: string } | null;
  purchase_lines: { batch_number: string } | null;
  finished_product_batches: { batch_number: string } | null;
};

export function CoaForm({ approvedChecks }: { approvedChecks: ApprovedQc[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCoaRecord, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Approved quality check" htmlFor="quality_check_id" required>
        <Select id="quality_check_id" name="quality_check_id" required defaultValue="">
          <option value="" disabled>
            Select AR number…
          </option>
          {approvedChecks.map((qc) => {
            const batch = qc.purchase_lines?.batch_number ?? qc.finished_product_batches?.batch_number ?? "—";
            const item = qc.items ? `${qc.items.item_code} — ${qc.items.name}` : "";
            return (
              <option key={qc.id} value={qc.id}>
                {qc.ar_number} · {item} · Batch {batch}
              </option>
            );
          })}
        </Select>
        {approvedChecks.length === 0 && (
          <p className="mt-1 text-xs text-muted">No Approved quality checks are available yet.</p>
        )}
      </Field>

      <Field label="File URL" htmlFor="file_url" hint="Optional — a link to the certificate document. No upload widget in this pass (v1 simplification).">
        <Input id="file_url" name="file_url" type="url" placeholder="https://…" />
      </Field>

      <p className="text-xs text-muted">The COA number is assigned automatically on save.</p>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || approvedChecks.length === 0}>
          {pending ? "Saving…" : "Issue COA"}
        </Button>
        <LinkButton href="/coa" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
