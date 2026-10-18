"use client";

// The card and per-batch row shared by the three "due for retest" sections on
// the QC page (raw material, production batches, finished product). Each row is
// its own form so one batch's error never affects the others. Shared since
// 18 Oct 2026; each section keeps its own title, wording and action.

import type { ReactNode } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import type { ActionState } from "@/lib/actions/qc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { compatibleUnits } from "@/lib/constants/units";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

export function RetestCard({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <Card className="mb-4 border-amber/40">
      <CardHeader title={title} />
      <CardBody className="flex flex-col gap-3">
        <p className="text-xs text-muted">{intro}</p>
        <div className="flex flex-col gap-2">{children}</div>
      </CardBody>
    </Card>
  );
}

export function RetestRow({
  action,
  heading,
  details,
  batchLabel,
  unit,
  defaultSample,
  canStart,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  heading: ReactNode;
  details: ReactNode;
  batchLabel: string;
  unit: string;
  defaultSample: string;
  canStart: boolean;
}) {
  const [state, formAction, pending] = useFlashActionState<ActionState, FormData>(action, undefined);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber/30 bg-amber-bg/40 px-3 py-2 text-sm"
    >
      <div>
        <p className="font-medium">{heading}</p>
        <p className="text-xs text-muted">{details}</p>
        {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
      </div>
      {canStart && (
        <div className="flex items-center gap-2">
          <Input
            name="sample_qty"
            type="number"
            step="any"
            min="0"
            required
            defaultValue={defaultSample}
            aria-label={`Retest sample quantity for ${batchLabel}`}
            className="w-24"
          />
          <Select name="sample_unit" defaultValue={unit} aria-label="Sample unit" className="w-20">
            {compatibleUnits(unit).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Starting…" : "Start Retest"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** The sample size suggested in the box: the batch's original QC sample, or blank when it had none. */
export function suggestedSample(qty: string | number | null): string {
  return Number(qty ?? 0) > 0 ? String(qty) : "";
}
