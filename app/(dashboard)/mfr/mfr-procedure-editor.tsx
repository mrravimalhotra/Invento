"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";

export type EditableStep = { stage: string; operation: string };

/**
 * Renders `stepCount` + stage_i/operation_i inputs so the bound Server
 * Action (lib/actions/mfr.ts: parseProcedureSteps) can reconstruct the
 * procedure. Same client-side add/remove-only pattern as MfrLineEditor —
 * degrades to a working (if static) form without JS. Sr.No isn't a field
 * here: it's just each row's position, assigned server-side as step_no in
 * update_mfr_procedure().
 */
export function MfrProcedureEditor({ initialSteps }: { initialSteps?: EditableStep[] }) {
  const [steps, setSteps] = useState<EditableStep[]>(
    initialSteps && initialSteps.length > 0 ? initialSteps : [{ stage: "", operation: "" }]
  );

  function addStep() {
    setSteps((ss) => [...ss, { stage: "", operation: "" }]);
  }
  function removeStep(i: number) {
    setSteps((ss) => (ss.length === 1 ? ss : ss.filter((_, idx) => idx !== i)));
  }
  function updateStep(i: number, patch: Partial<EditableStep>) {
    setSteps((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="stepCount" value={steps.length} />
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2 w-10">#</th>
              <th className="px-3 py-2 w-48">Stage</th>
              <th className="px-3 py-2">Operation</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {steps.map((step, i) => (
              <tr key={i} className="border-b border-border last:border-0 align-top">
                <td className="px-3 py-2.5 text-muted">{i + 1}.</td>
                <td className="px-3 py-2">
                  <Textarea
                    name={`stage_${i}`}
                    rows={2}
                    value={step.stage}
                    onChange={(e) => updateStep(i, { stage: e.target.value })}
                    placeholder="e.g. Pulverisation"
                    required={i === 0}
                  />
                </td>
                <td className="px-3 py-2">
                  <Textarea
                    name={`operation_${i}`}
                    rows={2}
                    value={step.operation}
                    onChange={(e) => updateStep(i, { operation: e.target.value })}
                    placeholder="e.g. Pass the cleaned raw material through disintegrator."
                    required={i === 0}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeStep(i)}
                    className="text-muted hover:text-red disabled:opacity-30"
                    disabled={steps.length === 1}
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addStep}>
          <Plus className="h-4 w-4" /> Add step
        </Button>
      </div>
    </div>
  );
}
