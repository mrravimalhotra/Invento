"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
// Round 2 — "QC Reviewer": the final decision. Approve (-> approved, the
// batch is added to inventory) or reject (-> rejected, terminal). Retest
// period is mandatory on approve, same rule the old single-step review
// form had.
import { useState } from "react";
import { reviewQcRound2, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DecisionChoice } from "@/components/ui/decision-choice";

export function QcReviewerForm({ id, maxRetestDays }: { id: string; maxRetestDays?: number }) {
  const boundAction = reviewQcRound2.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"approved" | "rejected" | "">("");
  const [retestPeriodDays, setRetestPeriodDays] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <Field label="Decision" required>
        <DecisionChoice
          name="status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "approved", label: "Approved", tone: "approve" },
            { value: "rejected", label: "Rejected", tone: "reject" },
          ]}
        />
      </Field>

      <Field label="Comments" htmlFor="review_comments">
        <Textarea id="review_comments" name="review_comments" rows={3} />
      </Field>

      <Field
        label="Retest period (days)"
        htmlFor="retest_period_days"
        required={status === "approved"}
        hint="Entered manually per batch — retest interval varies by material and test result, so it is not auto-computed (see DESIGN.md Open Question 1). Retest date is derived from this plus today's date once saved. Required to approve a batch; not required to reject one, since a rejected batch is never retested. Raw material: at most 180 days."
      >
        <Input
          id="retest_period_days"
          name="retest_period_days"
          type="number"
          min={1}
          max={maxRetestDays}
          step={1}
          required={status === "approved"}
          value={retestPeriodDays}
          onChange={(e) => setRetestPeriodDays(e.target.value)}
        />
      </Field>

      <p className="text-xs text-muted">
        This is the final decision — approving adds the batch to inventory; either choice is final and this
        record can no longer be edited.
      </p>

      <div>
        <Button type="submit" disabled={pending || !status || (status === "approved" && !retestPeriodDays)}>
          {pending ? "Saving…" : "Save decision"}
        </Button>
      </div>
    </form>
  );
}
