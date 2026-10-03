"use client";

import { useState } from "react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { Button } from "@/components/ui/button";
import { setOpeningStockOpen, undoOpeningLoad, type OpeningSimpleState } from "@/lib/actions/opening-stock";

export function OpenCloseButton({ isOpen }: { isOpen: boolean }) {
  const [state, action, pending] = useFlashActionState<OpeningSimpleState, FormData>(setOpeningStockOpen, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="open" value={isOpen ? "false" : "true"} />
      {state?.error && <span className="text-xs text-red">{state.error}</span>}
      {!isOpen ? (
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Working…" : "Re-open loading"}</Button>
      ) : confirming ? (
        <>
          <span className="text-xs">Close loading for everyone?</span>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Closing…" : "Yes, close"}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)}>Keep open</Button>
        </>
      ) : (
        <Button type="button" size="sm" onClick={() => setConfirming(true)}>Close loading</Button>
      )}
    </form>
  );
}

export function UndoButton({ loadId, loadNo }: { loadId: string; loadNo: string }) {
  const [state, action, pending] = useFlashActionState<OpeningSimpleState, FormData>(undoOpeningLoad, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="load_id" value={loadId} />
      {state?.error && <span className="max-w-xs text-xs text-red">{state.error}</span>}
      {confirming ? (
        <>
          <span className="text-xs">Remove {loadNo}?</span>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Undoing…" : "Yes, undo"}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>Undo</Button>
      )}
    </form>
  );
}
