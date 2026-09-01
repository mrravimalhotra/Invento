"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createBmrRecord,
  addWeighmentLine,
  addObservation,
  markPrepared,
  markChecked,
  markApproved,
  type ActionState,
} from "@/lib/actions/bmr";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { formatDate, isLegacyCode } from "@/lib/utils";

// ---------------------------------------------------------------------------
// New BMR
// ---------------------------------------------------------------------------
export function NewBmrForm({ batches }: { batches: { id: string; batch_number: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createBmrRecord, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Finished product batch" htmlFor="finished_product_batch_id" required>
        <Select id="finished_product_batch_id" name="finished_product_batch_id" required defaultValue="">
          <option value="" disabled>
            Select a batch…
          </option>
          {batches.map((b) => (
            <option key={b.id} value={b.id} data-legacy={isLegacyCode(b.batch_number) ? "1" : undefined}>
              {b.batch_number}
            </option>
          ))}
        </Select>
      </Field>
      {batches.length === 0 && (
        <p className="text-xs text-muted">
          Every finished product batch already has a BMR, or none exist yet.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || batches.length === 0}>
          {pending ? "Creating…" : "Create BMR"}
        </Button>
        <LinkButton href="/bmr" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Weighment line
// ---------------------------------------------------------------------------
type WeighmentBatchOption = { id: string; batch_number: string; expiry_date: string | null };

export function WeighmentLineForm({
  bmrRecordId,
  items,
  batchesByItem,
  defaultBatchByItem,
  standardQtyByItem,
}: {
  bmrRecordId: string;
  items: { id: string; name: string; item_code: string; unit: string | null }[];
  batchesByItem: Record<string, WeighmentBatchOption[]>;
  defaultBatchByItem: Record<string, string>;
  standardQtyByItem: Record<string, number>;
}) {
  const boundAction = addWeighmentLine.bind(null, bmrRecordId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  const batchOptions = batchesByItem[selectedItemId] ?? [];
  const defaultBatch = defaultBatchByItem[selectedItemId] ?? batchOptions[0]?.id ?? "";
  const defaultStandardQty = standardQtyByItem[selectedItemId];

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:items-end"
      key={selectedItemId /* refresh defaultValue-driven children when item changes */}
    >
      {(state?.error || state?.success) && (
        <div className="sm:col-span-5">
          {state?.error && <p className="text-sm text-red">{state.error}</p>}
          {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
        </div>
      )}
      <Field label="Item" htmlFor="item_id" required>
        <Select
          id="item_id"
          name="item_id"
          required
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
        >
          {items.length === 0 && <option value="">No items on this batch&apos;s formula</option>}
          {items.map((it) => (
            <option key={it.id} value={it.id} data-legacy={isLegacyCode(it.item_code) ? "1" : undefined}>
              {it.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Batch (QC-Approved)" htmlFor="purchase_line_id" required>
        <Select id="purchase_line_id" name="purchase_line_id" required defaultValue={defaultBatch}>
          <option value="" disabled>
            Select…
          </option>
          {batchOptions.map((b) => (
            <option key={b.id} value={b.id} data-legacy={isLegacyCode(b.batch_number) ? "1" : undefined}>
              {b.batch_number}
              {b.expiry_date ? ` (exp ${formatDate(b.expiry_date)})` : ""}
            </option>
          ))}
        </Select>
        {batchOptions.length === 0 && (
          <p className="text-xs text-muted">No QC-Approved batch on hand for this item.</p>
        )}
      </Field>
      <Field label="Standard qty" htmlFor="standard_qty" required>
        <Input
          id="standard_qty"
          name="standard_qty"
          type="number"
          step="any"
          required
          defaultValue={defaultStandardQty ?? ""}
        />
      </Field>
      <Field label="Actual qty (weighed)" htmlFor="actual_qty">
        <Input id="actual_qty" name="actual_qty" type="number" step="any" />
      </Field>
      <Button type="submit" disabled={pending || items.length === 0}>
        {pending ? "Adding…" : "Add line"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Observation
// ---------------------------------------------------------------------------
export function ObservationForm({ bmrRecordId }: { bmrRecordId: string }) {
  const boundAction = addObservation.bind(null, bmrRecordId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
      {(state?.error || state?.success) && (
        <div className="sm:col-span-4">
          {state?.error && <p className="text-sm text-red">{state.error}</p>}
          {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}
        </div>
      )}
      <Field label="Step / observation" htmlFor="step_label" required>
        <Input id="step_label" name="step_label" placeholder="e.g. Sifter retention weight" required />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Reading" htmlFor="reading">
          <Textarea id="reading" name="reading" rows={1} />
        </Field>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add observation"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------
type SignOffInfo = { by: string | null; at: string | null };

function SignOffStep({
  label,
  info,
  action,
  enabled,
  bmrRecordId,
}: {
  label: string;
  info: SignOffInfo;
  action: (bmrRecordId: string, prev: ActionState, formData: FormData) => Promise<ActionState>;
  enabled: boolean;
  bmrRecordId: string;
}) {
  const bound = action.bind(null, bmrRecordId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(bound, undefined);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {info.at ? (
        <p className="text-sm text-foreground">
          {info.by ?? "—"}
          <br />
          <span className="text-xs text-muted">{formatDate(info.at)}</span>
        </p>
      ) : enabled ? (
        <form action={formAction}>
          {state?.error && <p className="mb-1.5 text-xs text-red">{state.error}</p>}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : `Mark ${label.toLowerCase()}`}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Not yet</p>
      )}
    </div>
  );
}

export function SignOffPanel({
  bmrRecordId,
  preparedAt,
  preparedBy,
  checkedAt,
  checkedBy,
  approvedAt,
  approvedBy,
}: {
  bmrRecordId: string;
  preparedAt: string | null;
  preparedBy: string | null;
  checkedAt: string | null;
  checkedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <SignOffStep
        label="Prepared"
        info={{ by: preparedBy, at: preparedAt }}
        action={markPrepared}
        enabled={true}
        bmrRecordId={bmrRecordId}
      />
      <SignOffStep
        label="Checked"
        info={{ by: checkedBy, at: checkedAt }}
        action={markChecked}
        enabled={!!preparedAt}
        bmrRecordId={bmrRecordId}
      />
      <SignOffStep
        label="Approved"
        info={{ by: approvedBy, at: approvedAt }}
        action={markApproved}
        enabled={!!checkedAt}
        bmrRecordId={bmrRecordId}
      />
    </div>
  );
}
