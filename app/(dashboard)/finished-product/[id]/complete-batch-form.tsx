"use client";

import { useActionState } from "react";
import { completeFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

type Defaults = {
  wt_total_rm: string | number | null;
  wastage: string | number | null;
  total_units: string | number | null;
  net_qty: string | number | null;
  finish_date: string | null;
  expiry_month: string | null;
  qc_sample_qty: string | number | null;
};

export function CompleteBatchForm({ batchId, defaults, unit }: { batchId: string; defaults: Defaults; unit: string }) {
  const boundAction = completeFinishedProductBatch.bind(null, batchId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`Total weight of RM used (${unit})`} htmlFor="wt_total_rm">
          <Input id="wt_total_rm" name="wt_total_rm" type="number" step="any" min="0" defaultValue={defaults.wt_total_rm ?? ""} />
        </Field>
        <Field label={`Wastage (${unit})`} htmlFor="wastage">
          <Input id="wastage" name="wastage" type="number" step="any" min="0" defaultValue={defaults.wastage ?? ""} />
        </Field>
        <Field label="Total units" htmlFor="total_units">
          <Input id="total_units" name="total_units" type="number" step="any" min="0" defaultValue={defaults.total_units ?? ""} />
        </Field>
        <Field label={`Net quantity (${unit})`} htmlFor="net_qty">
          <Input id="net_qty" name="net_qty" type="number" step="any" min="0" defaultValue={defaults.net_qty ?? ""} />
        </Field>
        <Field label="Finish date" htmlFor="finish_date">
          <Input id="finish_date" name="finish_date" type="date" defaultValue={defaults.finish_date ?? ""} />
        </Field>
        <Field label="Expiry month" htmlFor="expiry_month">
          <Input id="expiry_month" name="expiry_month" type="date" defaultValue={defaults.expiry_month ?? ""} />
        </Field>
        <Field label="QC sample quantity" htmlFor="qc_sample_qty">
          <Input id="qc_sample_qty" name="qc_sample_qty" type="number" step="any" min="0" defaultValue={defaults.qc_sample_qty ?? ""} />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save batch details"}
        </Button>
      </div>
    </form>
  );
}
