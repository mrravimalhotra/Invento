"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
// Round 2 — "QC Reviewer": the final decision. Approve (-> approved, the
// batch is added to inventory) or reject (-> rejected, terminal). Expiry date
// and retest period are mandatory on approve (FB-0058, FB-0061); the last
// retest of a raw material takes the Expiry date only.
import { useState } from "react";
import { reviewQcRound2, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DecisionChoice } from "@/components/ui/decision-choice";
import { formatDate, todayIst } from "@/lib/utils";

export function QcReviewerForm({
  id,
  maxRetestDays,
  defaultRetestDays,
  isFinalRetest = false,
  defaultExpiry = "",
}: {
  id: string;
  maxRetestDays?: number;
  defaultRetestDays?: number;
  isFinalRetest?: boolean;
  defaultExpiry?: string;
}) {
  const boundAction = reviewQcRound2.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"approved" | "rejected" | "">("");
  const [retestPeriodDays, setRetestPeriodDays] = useState(!isFinalRetest && defaultRetestDays ? String(defaultRetestDays) : "");
  const [expiryDate, setExpiryDate] = useState(defaultExpiry);
  const [today] = useState(() => todayIst());
  const nextRetest = (() => {
    const days = Number(retestPeriodDays);
    if (!Number.isInteger(days) || days <= 0) return null;
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return formatDate(d.toISOString().slice(0, 10));
  })();
  const approveBlocked = status === "approved" && (!expiryDate || (!isFinalRetest && !retestPeriodDays));

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

      <Field label="Expiry date" htmlFor="expiry_date" required={status === "approved"}>
        <Input
          id="expiry_date"
          name="expiry_date"
          type="date"
          min={today}
          required={status === "approved"}
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
      </Field>

      {isFinalRetest ? (
        <p className="text-sm text-muted">
          This is the last retest allowed. Set only the Expiry date: the material can be used until then and is not
          retested again.
        </p>
      ) : (
        <Field
          label="Retest period (days)"
          htmlFor="retest_period_days"
          required={status === "approved"}
          hint={
            maxRetestDays
              ? `Set to ${maxRetestDays} days (6 months), the longest allowed for a raw material; change it if needed.${nextRetest ? ` Next retest date: ${nextRetest}.` : ""}`
              : nextRetest
                ? `Next retest date: ${nextRetest}.`
                : undefined
          }
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
      )}

      <p className="text-xs text-muted">
        This is the final decision — approving adds the batch to inventory; either choice is final and this
        record can no longer be edited.
      </p>

      <div>
        <Button type="submit" disabled={pending || !status || approveBlocked}>
          {pending ? "Saving…" : "Save decision"}
        </Button>
      </div>
    </form>
  );
}
