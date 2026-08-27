"use client";

import { useActionState } from "react";
import { createEnvironmentalReading, type ActionState } from "@/lib/actions/environmental-control";
import { Field, Input } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";

export function NewEnvironmentalReadingForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createEnvironmentalReading,
    undefined
  );
  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-md">
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label="Area" htmlFor="area" required>
        <Input id="area" name="area" placeholder="e.g. Raw Material Store" required autoFocus />
      </Field>
      <Field label="Temperature (°C)" htmlFor="temperature">
        <Input id="temperature" name="temperature" type="number" step="0.1" inputMode="decimal" />
      </Field>
      <Field label="Humidity (%RH)" htmlFor="humidity">
        <Input id="humidity" name="humidity" type="number" step="0.1" inputMode="decimal" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record reading"}
        </Button>
        <LinkButton href="/environmental-control" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
