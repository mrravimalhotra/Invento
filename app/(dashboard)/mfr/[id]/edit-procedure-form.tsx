"use client";

import { useActionState, useState } from "react";
import { updateMfrProcedure, type ActionState } from "@/lib/actions/mfr";
import { Field, Textarea, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MfrProcedureEditor, type EditableStep } from "../mfr-procedure-editor";

export function EditProcedureForm({
  mfrId,
  hasProcedure,
  initialIntro,
  initialTheoreticalYieldPct,
  initialPermissibleYieldPct,
  initialSteps,
}: {
  mfrId: string;
  hasProcedure: boolean;
  initialIntro: string;
  initialTheoreticalYieldPct: string;
  initialPermissibleYieldPct: string;
  initialSteps: EditableStep[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateMfrProcedure.bind(null, mfrId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {hasProcedure ? "Edit procedure" : "Add procedure"}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-amber/40 bg-amber-bg/40 p-4">
      <p className="text-xs text-muted">
        Unlike the recipe, the procedure can be edited at any time, including after this MFR is approved.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      {/* Stays open after a successful save (same "keep editing" pattern
          as the old BMR add-line forms) rather than auto-closing — there's
          no redirect here to reset state the way EditRecipeForm gets for
          free, so closing is left to the explicit Close button below. */}
      {state?.success && <p className="text-sm text-brand-dark">{state.success}</p>}

      <Field
        label="Intro line"
        htmlFor="procedure_intro"
        hint={'Optional — e.g. "Weigh/measure all raw materials at production level. (Batch size 100 Lit)"'}
      >
        <Textarea id="procedure_intro" name="procedure_intro" rows={2} defaultValue={initialIntro} />
      </Field>

      <MfrProcedureEditor initialSteps={initialSteps} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Theoretical yield %" htmlFor="theoretical_yield_pct" hint="Optional, e.g. 100">
          <Input
            id="theoretical_yield_pct"
            name="theoretical_yield_pct"
            type="number"
            step="any"
            min="0"
            defaultValue={initialTheoreticalYieldPct}
          />
        </Field>
        <Field
          label="Permissible yield %"
          htmlFor="permissible_yield_pct"
          hint='Optional — the "not less than" threshold, e.g. 98'
        >
          <Input
            id="permissible_yield_pct"
            name="permissible_yield_pct"
            type="number"
            step="any"
            min="0"
            defaultValue={initialPermissibleYieldPct}
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save procedure"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
