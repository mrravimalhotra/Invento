"use client";

import { useEffect, useId } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { voidPackagingIssue, type ActionState } from "@/lib/actions/packaging";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { MIN_REASON_CHARS } from "@/lib/qc-results";

// P6-01: the red box under a packaging issue (mockup approved 1 Nov 2026). It says what goes
// back, asks for a reason and voids on "Yes, void" (void_packaging_issue, 0126).
export function VoidIssueBox({
  id,
  code,
  goesBack,
  onClose,
}: {
  id: string;
  code: string;
  goesBack: string[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(
    voidPackagingIssue.bind(null, id),
    undefined
  );
  const fieldId = useId();
  useEffect(() => {
    // One-shot reaction to a successful void: the list reloads with the row marked Void.
    if (state?.success) onClose();
  }, [state, onClose]);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-red bg-red-bg px-3 py-3 text-sm">
      <div className="text-red">
        <p>Void {code}? It stays on the list marked Void. Nothing is deleted; new ledger rows put back:</p>
        <ul className="mt-1 list-disc pl-5">
          {goesBack.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      <Field
        label="Reason"
        htmlFor={fieldId}
        required
        hint={`At least ${MIN_REASON_CHARS} characters, for example "Wrong pack size entered; repacked as another issue".`}
      >
        <Textarea id={fieldId} name="void_reason" rows={2} required minLength={MIN_REASON_CHARS} autoComplete="off" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Voiding…" : "Yes, void"}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
