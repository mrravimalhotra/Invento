"use client";

import { useActionState, useState } from "react";
import { reviewQualityCheck, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QcReviewForm({ id }: { id: string }) {
  const boundAction = reviewQualityCheck.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"approved" | "rejected" | "">("");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      <input type="hidden" name="status" value={status} />
      <Field label="Decision" required>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatus("approved")}
            className={cn(
              "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              status === "approved"
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-border bg-white hover:bg-black/5"
            )}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setStatus("rejected")}
            className={cn(
              "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              status === "rejected"
                ? "border-red bg-red-bg text-red"
                : "border-border bg-white hover:bg-black/5"
            )}
          >
            Rejected
          </button>
        </div>
      </Field>

      <Field label="Review comments" htmlFor="review_comments">
        <Textarea id="review_comments" name="review_comments" rows={3} />
      </Field>

      <Field
        label="Retest period (days)"
        htmlFor="retest_period_days"
        hint="Entered manually per batch — retest interval varies by material and test result, so it is not auto-computed (see DESIGN.md Open Question 1). Retest date is derived from this plus the review date once saved."
      >
        <Input id="retest_period_days" name="retest_period_days" type="number" min={1} step={1} />
      </Field>

      <p className="text-xs text-muted">
        This decision is final — once saved, this record can no longer be edited.
      </p>

      <div>
        <Button type="submit" disabled={pending || !status}>
          {pending ? "Saving…" : "Save decision"}
        </Button>
      </div>
    </form>
  );
}
