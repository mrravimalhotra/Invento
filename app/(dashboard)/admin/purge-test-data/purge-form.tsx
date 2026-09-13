"use client";

import { useActionState, useState } from "react";
import { purgeTestData, type PurgeResult } from "@/lib/actions/admin";
import { PURGE_CONFIRM_PHRASE } from "@/lib/constants/admin";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export function PurgeTestDataForm() {
  const [state, formAction, pending] = useActionState<PurgeResult, FormData>(purgeTestData, undefined);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (state?.summary) {
    const purged = state.summary.filter((r) => r.rows > 0).sort((a, b) => b.rows - a.rows);
    const totalRows = state.summary.reduce((sum, r) => sum + r.rows, 0);
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-brand/25 bg-brand-light/40 p-4 text-sm">
        <p className="font-medium text-brand-dark">
          Purge complete — {totalRows.toLocaleString()} row{totalRows === 1 ? "" : "s"} removed
          across {purged.length} table{purged.length === 1 ? "" : "s"}.
        </p>
        {purged.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded border border-border bg-white">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border">
                {purged.map((r) => (
                  <tr key={r.table}>
                    <td className="px-3 py-1.5 font-mono">{r.table}</td>
                    <td className="px-3 py-1.5 text-right">{r.rows.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted">
          Item, vendor, purchase order, AR, MFR, equipment, and dead-stock code numbering has been
          reset — the next record created of each type starts at *-0001 again. Your account, every
          user role, and all Tester Feedback tickets were left untouched.
        </p>
      </div>
    );
  }

  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Purge test data…
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-red/30 bg-red-bg p-4"
      onSubmit={(e) => {
        if (typed !== PURGE_CONFIRM_PHRASE) e.preventDefault();
      }}
    >
      <p className="text-sm font-medium text-red">
        This permanently deletes every item, vendor, item type, MFR recipe, purchase order,
        quality check, finished product batch, BMR record, packaging issue, equipment and
        dead-stock entry, and inventory ledger row in the app — including all legacy (LEG-) data.
        This cannot be undone from inside the app.
      </p>
      <p className="text-sm">
        Your account, every user role, and all Tester Feedback tickets are kept. Make sure a
        backup has been taken first if there&apos;s anything here you might still need.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <Field label={`Type "${PURGE_CONFIRM_PHRASE}" to confirm`} htmlFor="confirm_text">
        <Input
          id="confirm_text"
          name="confirm_text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          placeholder={PURGE_CONFIRM_PHRASE}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending || typed !== PURGE_CONFIRM_PHRASE}>
          {pending ? "Purging…" : "Purge everything"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setConfirming(false);
            setTyped("");
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
