"use client";

import { useState } from "react";
import { useActionState } from "react";
import { deleteMfrDefinition, type ActionState } from "@/lib/actions/mfr";
import { Button } from "@/components/ui/button";

// Delete is restricted to system_admin — see deleteMfrDefinition() in
// lib/actions/mfr.ts. Rendered only when the caller passes isSystemAdmin,
// itself computed from the signed-in user's roles in [id]/page.tsx
// (canWrite() alone is too permissive for this gate). Same two-step-confirm
// pattern as DeleteItemForm/DeleteVendorForm/DeleteItemTypeForm — including
// the state.error fix (1 Sep 2026) so a blocked delete actually explains
// why instead of silently snapping back to "Yes, delete".
export function DeleteMfrForm({ id, code, name }: { id: string; code: string; name: string }) {
  const boundAction = deleteMfrDefinition.bind(null, id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        {state?.error && <p className="text-sm text-red">{state.error}</p>}
        <Button type="button" variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Delete MFR
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded border border-red/30 p-3">
      <p className="text-sm">
        Delete <strong>{code} · {name}</strong>? This removes all recipe versions and can&apos;t be undone. The
        linked Finished Product item is not deleted — it stays in Item Master.
      </p>
      {state?.error && <p className="text-sm text-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
