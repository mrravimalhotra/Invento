"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { UNITS } from "@/lib/constants/units";
import { isLegacyCode } from "@/lib/utils";

type MfrOption = {
  id: string;
  code: string;
  name: string;
  version: number;
  batch_size_qty: string | number;
  batch_size_unit: string;
};

// This step never writes to the database — it's a plain GET form that hands the
// chosen MFR (with its *current* version, locked in right now) and target quantity
// on to /finished-product/new/compose via the query string, so no Server Action or
// useActionState is needed here.
export function Step1Form({ mfrDefinitions }: { mfrDefinitions: MfrOption[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [unit, setUnit] = useState("");
  const selected = mfrDefinitions.find((m) => m.id === selectedId);
  // Same "today" convention used elsewhere in this app (e.g. rm-report's
  // todayIso(), compose/page.tsx) — defaults the field to today but stays
  // a plain editable date input, same as every other date field here.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  return (
    <form action="/finished-product/new/compose" method="get" className="flex flex-col gap-4 max-w-lg">
      <Field label="MFR" htmlFor="mfr_definition_id" required>
        <Select
          id="mfr_definition_id"
          name="mfr_definition_id"
          required
          value={selectedId}
          onChange={(e) => {
            setSelectedId(e.target.value);
            const m = mfrDefinitions.find((opt) => opt.id === e.target.value);
            if (m) setUnit(m.batch_size_unit);
          }}
        >
          <option value="">Select MFR…</option>
          {mfrDefinitions.map((m) => (
            <option key={m.id} value={m.id} data-legacy={isLegacyCode(m.code) ? "1" : undefined}>
              {m.code} · {m.name} (v{m.version})
            </option>
          ))}
        </Select>
      </Field>

      {selected && (
        <>
          <input type="hidden" name="mfr_version" value={selected.version} />
          <div className="rounded-md border border-border bg-black/[0.02] p-3 text-sm">
            <p>
              <span className="text-muted">Product:</span> {selected.name}
            </p>
            <p>
              <span className="text-muted">Recipe version locked in:</span> v{selected.version}
            </p>
            <p>
              <span className="text-muted">Standard batch size:</span> {selected.batch_size_qty} {selected.batch_size_unit}
            </p>
          </div>
        </>
      )}

      <Field label="Target quantity" htmlFor="target_qty" required>
        <Input id="target_qty" name="target_qty" type="number" step="any" min="0" required />
      </Field>
      <Field label="Unit" htmlFor="unit" required>
        <Select id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} required>
          <option value="">Select unit…</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>
      {/* Ravi (15 Sept 2026): a batch's expiry can only be known once it's
          actually finished — this screen used to collect it up front,
          before a single day of processing had happened. Expiry date now
          lives solely on the Complete Batch screen (mandatory there); this
          screen instead records when the production run itself started. */}
      <Field label="Batch start date" htmlFor="batch_start_date" required hint="When this batch's production run started.">
        <Input id="batch_start_date" name="batch_start_date" type="date" defaultValue={today} required />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={!selectedId}>
          Calculate composition
        </Button>
        <LinkButton href="/finished-product" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
