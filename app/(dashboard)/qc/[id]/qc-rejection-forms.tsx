"use client";

import { useState } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { reviewQcRound2, sendBackQcRejection, voidQcRejection, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MIN_REASON_CHARS } from "@/lib/qc-results";

// The QC Reviewer's two choices on a proposed rejection: confirm it (the batch is rejected) or
// send it back to the Quality Checker. Each needs a written reason.
export function ProposedRejectionForm({ id }: { id: string }) {
  const [choice, setChoice] = useState<"confirm" | "send_back" | "">("");
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="What to do with the proposed rejection" className="flex gap-2">
        {(
          [
            ["confirm", "Confirm the rejection"],
            ["send_back", "Send back to the Quality Checker"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => setChoice(value)}
            className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium ${
              choice === value
                ? value === "confirm"
                  ? "border-red bg-red-bg text-red"
                  : "border-brand bg-brand-light text-brand-dark"
                : "border-border bg-white hover:bg-black/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {choice === "confirm" && <ConfirmRejectionForm id={id} />}
      {choice === "send_back" && <SendBackForm id={id} />}
    </div>
  );
}

function ConfirmRejectionForm({ id }: { id: string }) {
  const action = reviewQcRound2.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(action, undefined);
  const [reason, setReason] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <input type="hidden" name="status" value="rejected" />
      <ReasonField name="review_comments" label="Reason" hint={`At least ${MIN_REASON_CHARS} characters.`} value={reason} onChange={setReason} />
      <ConfirmThenSubmit
        ready={reason.trim().length >= MIN_REASON_CHARS}
        pending={pending}
        startLabel="Confirm rejection"
        question="Reject this batch? It moves out of stock. A QC Reviewer or System Admin can void the rejection later."
        yesLabel="Yes, reject the batch"
      />
    </form>
  );
}

function SendBackForm({ id }: { id: string }) {
  const action = sendBackQcRejection.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(action, undefined);
  const [reason, setReason] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <ReasonField
        name="returned_reason"
        label="Reason"
        hint={`Tell the Quality Checker what to re-check (at least ${MIN_REASON_CHARS} characters).`}
        more="The record returns to Awaiting QC."
        value={reason}
        onChange={setReason}
      />
      <div>
        <Button type="submit" disabled={pending || reason.trim().length < MIN_REASON_CHARS}>
          {pending ? "Saving…" : "Send back"}
        </Button>
      </div>
    </form>
  );
}

// A final rejection can be voided (QC Reviewer or System Admin) with a written reason.
export function VoidRejectionForm({ id }: { id: string }) {
  const action = voidQcRejection.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(action, undefined);
  const [reason, setReason] = useState("");
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <p className="text-sm text-muted">
        Voiding returns this record to Awaiting QC and puts the stock back on hand. It is not possible once wastage has been written off against the batch. The reason is kept for audit.
      </p>
      <ReasonField name="void_reason" label="Reason for voiding" hint={`At least ${MIN_REASON_CHARS} characters.`} value={reason} onChange={setReason} />
      <ConfirmThenSubmit
        ready={reason.trim().length >= MIN_REASON_CHARS}
        pending={pending}
        startLabel="Void rejection"
        question="Void this rejection and send the record back to Awaiting QC?"
        yesLabel="Yes, void the rejection"
      />
    </form>
  );
}

function ReasonField({
  name,
  label,
  hint,
  more,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  more?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} htmlFor={name} required hint={hint} more={more}>
      <Textarea id={name} name={name} rows={3} required minLength={MIN_REASON_CHARS} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

// The two-step submit used by both irreversible-looking actions: a first button
// (enabled once the reason is long enough), then a red Yes / Cancel box.
function ConfirmThenSubmit({
  ready,
  pending,
  startLabel,
  question,
  yesLabel,
}: {
  ready: boolean;
  pending: boolean;
  startLabel: string;
  question: string;
  yesLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <div>
        <Button type="button" disabled={!ready} onClick={() => setConfirming(true)}>
          {startLabel}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
      <p className="text-red">{question}</p>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Saving…" : yesLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
