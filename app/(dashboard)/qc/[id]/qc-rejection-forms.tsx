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
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <input type="hidden" name="status" value="rejected" />
      <Field label="Reason" htmlFor="review_comments" required hint={`At least ${MIN_REASON_CHARS} characters.`}>
        <Textarea
          id="review_comments"
          name="review_comments"
          rows={3}
          required
          minLength={MIN_REASON_CHARS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
          <p className="text-red">Reject this batch? It moves out of stock. A QC Reviewer or System Admin can void the rejection later.</p>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Saving…" : "Yes, reject the batch"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" disabled={reason.trim().length < MIN_REASON_CHARS} onClick={() => setConfirming(true)}>
            Confirm rejection
          </Button>
        </div>
      )}
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
      <Field
        label="Reason"
        htmlFor="returned_reason"
        required
        hint={`Tell the Quality Checker what to re-check (at least ${MIN_REASON_CHARS} characters). The record returns to Awaiting QC.`}
      >
        <Textarea
          id="returned_reason"
          name="returned_reason"
          rows={3}
          required
          minLength={MIN_REASON_CHARS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
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
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <p className="text-sm text-muted">
        Voiding returns this record to Awaiting QC and puts the stock back on hand. It is not possible once wastage has been written off against the batch. The reason is kept for audit.
      </p>
      <Field label="Reason for voiding" htmlFor="void_reason" required hint={`At least ${MIN_REASON_CHARS} characters.`}>
        <Textarea
          id="void_reason"
          name="void_reason"
          rows={3}
          required
          minLength={MIN_REASON_CHARS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
          <p className="text-red">Void this rejection and send the record back to Awaiting QC?</p>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Saving…" : "Yes, void the rejection"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" disabled={reason.trim().length < MIN_REASON_CHARS} onClick={() => setConfirming(true)}>
            Void rejection
          </Button>
        </div>
      )}
    </form>
  );
}
