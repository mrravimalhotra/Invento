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
import { MIN_REASON_CHARS, type QcResultLine } from "@/lib/qc-results";
import { ResultsGrid } from "./results-grid";

export function QcReviewerForm({
  id,
  maxRetestDays,
  defaultRetestDays,
  isFinalRetest = false,
  defaultExpiry = "",
  maxExpiry,
  round1Results,
}: {
  id: string;
  // Round 1's results (null on a record decided before results were recorded: typed on the certificate).
  round1Results: QcResultLine[] | null;
  maxRetestDays?: number;
  defaultRetestDays?: number;
  isFinalRetest?: boolean;
  defaultExpiry?: string;
  // SCAN-P4-03: on a retest, the expiry the batch was last approved with (cannot be extended).
  maxExpiry?: string;
}) {
  const boundAction = reviewQcRound2.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"approved" | "rejected" | "">("");
  const [retestPeriodDays, setRetestPeriodDays] = useState(!isFinalRetest && defaultRetestDays ? String(defaultRetestDays) : "");
  const [expiryDate, setExpiryDate] = useState(defaultExpiry);
  const [values, setValues] = useState<string[]>(() => (round1Results ?? []).map((l) => l.result));
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [today] = useState(() => todayIst());
  const nextRetestIso = (() => {
    const days = Number(retestPeriodDays);
    if (!Number.isInteger(days) || days <= 0) return null;
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();
  const nextRetest = nextRetestIso ? formatDate(nextRetestIso) : null;
  // SCAN-P4-04: the retest date can never fall after the expiry date.
  const retestAfterExpiry = !isFinalRetest && !!nextRetestIso && !!expiryDate && nextRetestIso > expiryDate;
  const resultsMissing = !!round1Results && values.some((v) => !v.trim());
  const approveBlocked =
    status === "approved" && (!expiryDate || (!isFinalRetest && !retestPeriodDays) || retestAfterExpiry || resultsMissing);
  const reasonShort = reason.trim().length < MIN_REASON_CHARS;
  const rejecting = status === "rejected";
  const edited = !!round1Results && values.some((v, i) => v.trim() !== round1Results[i].result.trim());

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      {round1Results && (
        <Field
          label="Test results"
          hint="These are the Quality Checker's results. Leave them as they are to keep them; if you change any, your results become final and go on the Certificate of Analysis. Both versions are kept for audit."
        >
          <ResultsGrid
            lines={round1Results.map(({ seq, test, specification }) => ({ seq, test, specification }))}
            values={values}
            onChange={setValues}
            round1={round1Results}
          />
        </Field>
      )}

      <Field label="Decision" required>
        <DecisionChoice
          name="status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setConfirming(false);
          }}
          options={[
            { value: "approved", label: "Approved", tone: "approve" },
            { value: "rejected", label: "Rejected", tone: "reject" },
          ]}
        />
      </Field>

      <Field
        label="Reason"
        htmlFor="review_comments"
        required
        hint={`Required for either decision (at least ${MIN_REASON_CHARS} characters).${edited ? " Say why you changed the results." : ""}`}
      >
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

      <Field label="Expiry date" htmlFor="expiry_date" required={status === "approved"}>
        <Input
          id="expiry_date"
          name="expiry_date"
          type="date"
          min={today}
          max={maxExpiry}
          required={status === "approved"}
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
        />
        {maxExpiry && (
          <p className="mt-1 text-xs text-muted">A retest cannot extend the expiry date: {maxExpiry.split("-").reverse().join("-")} or earlier.</p>
        )}
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
              ? `Set to ${maxRetestDays} days (6 months), the longest allowed; change it if needed.${nextRetest ? ` Next retest date: ${nextRetest}.` : ""}`
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
          {retestAfterExpiry && (
            <p className="mt-1 text-xs text-red">
              The retest date ({nextRetest}) would fall after the expiry date. Enter a shorter retest period.
            </p>
          )}
        </Field>
      )}

      <p className="text-xs text-muted">
        This is the final decision — approving adds the batch to inventory; either choice is final and this
        record can no longer be edited. (A rejection can later be voided by a QC Reviewer or System Admin with a written reason.)
      </p>

      {confirming && rejecting ? (
        <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
          <p className="text-red">Reject this batch? It moves out of stock. A QC Reviewer or System Admin can void the rejection later with a written reason.</p>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Saving…" : "Yes, reject the batch"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : rejecting ? (
        <div>
          <Button type="button" disabled={reasonShort} onClick={() => setConfirming(true)}>
            Save decision
          </Button>
        </div>
      ) : (
        <div>
          <Button type="submit" disabled={pending || !status || approveBlocked || reasonShort}>
            {pending ? "Saving…" : "Save decision"}
          </Button>
        </div>
      )}
    </form>
  );
}
