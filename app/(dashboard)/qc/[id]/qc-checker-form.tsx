"use client";

import { useFlashActionState } from "@/lib/use-flash-action";
// Round 1 — "QC Checker": fills in the result of every test on the COA template, gives a
// written reason, and either approves (-> awaiting the QC Reviewer) or proposes a rejection
// (-> the QC Reviewer confirms it or sends it back). See reviewQcRound1.
import { useState } from "react";
import Link from "next/link";
import { reviewQcRound1, type ActionState } from "@/lib/actions/qc";
import { Field, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DecisionChoice } from "@/components/ui/decision-choice";
import { MIN_REASON_CHARS } from "@/lib/qc-results";
import { ResultsGrid } from "./results-grid";

type Line = { seq: number; test: string; specification: string };

export function QcCheckerForm({
  id,
  needsResults,
  lines,
  addHref,
}: {
  id: string;
  /** Raw material from a vendor and finished product record test results; Production raw material does not. */
  needsResults: boolean;
  lines: Line[];
  addHref: string | null;
}) {
  const boundAction = reviewQcRound1.bind(null, id);
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(boundAction, undefined);
  const [status, setStatus] = useState<"checker_approved" | "checker_rejected" | "">("");
  const [values, setValues] = useState<string[]>(() => lines.map(() => ""));
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const noTemplate = needsResults && lines.length === 0;
  const resultsMissing = needsResults && values.some((v) => !v.trim());
  const reasonShort = reason.trim().length < MIN_REASON_CHARS;
  const approveBlocked = status === "checker_approved" && (noTemplate || resultsMissing);
  const rejecting = status === "checker_rejected";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}

      {needsResults && !noTemplate && (
        <Field label="Test results" required={status === "checker_approved"} hint="Enter the result of every test below. A result may be left blank only when you are rejecting.">
          <ResultsGrid lines={lines} values={values} onChange={setValues} />
        </Field>
      )}

      {noTemplate && (
        <p className="rounded-md border border-amber bg-amber-bg px-3 py-2 text-sm text-amber">
          This item has no COA template yet, so results cannot be entered and the batch cannot be approved.{" "}
          {addHref && (
            <Link href={addHref} prefetch={false} className="font-medium underline">
              Add the COA template
            </Link>
          )}{" "}
          first. You can still reject.
        </p>
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
            { value: "checker_approved", label: "Approved", tone: "approve" },
            { value: "checker_rejected", label: "Rejected", tone: "reject" },
          ]}
        />
      </Field>

      <Field label="Reason" htmlFor="checker_comments" required hint={`Required for either decision (at least ${MIN_REASON_CHARS} characters). It is kept for audit.`}>
        <Textarea
          id="checker_comments"
          name="checker_comments"
          rows={3}
          required
          minLength={MIN_REASON_CHARS}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>

      <p className="text-xs text-muted">
        Approving moves this AR to a QC Reviewer for the final decision. Rejecting only <em>proposes</em> the
        rejection: a QC Reviewer confirms it (the batch is then rejected) or sends it back to you. Until then the
        batch stays on hand.
      </p>

      {confirming && rejecting ? (
        <div className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
          <p className="text-red">Propose rejecting this batch? A QC Reviewer will confirm or send it back.</p>
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Saving…" : "Yes, propose rejection"}
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
