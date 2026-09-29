"use client";

// Round 1 — "QC Checker": approve (-> checker_approved, awaiting Round 2)
// or reject (-> rejected, terminal). No retest period here — see
// reviewQcRound1's own comment for why that's collected at Round 2
// instead.
import { useActionState, useState } from "react";
import { reviewQcRound1, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DecisionChoice } from "@/components/ui/decision-choice";

export function QcCheckerForm({ id }: { id: string }) {
  const boundAction = reviewQcRound1.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"checker_approved" | "rejected" | "">("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Decision" required>
        <DecisionChoice
          name="status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "checker_approved", label: "Approved", tone: "approve" },
            { value: "rejected", label: "Rejected", tone: "reject" },
          ]}
        />
      </Field>

      <Field label="Comments" htmlFor="checker_comments">
        <Textarea id="checker_comments" name="checker_comments" rows={3} />
      </Field>

      <p className="text-xs text-muted">
        Approving moves this AR to a QC Reviewer for the final decision. Rejecting is final — the batch is
        rejected and this record can no longer be edited.
      </p>

      <div>
        <Button type="submit" disabled={pending || !status}>
          {pending ? "Saving…" : "Save decision"}
        </Button>
      </div>
    </form>
  );
}
