"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { confirmFinishedProductBatch, cancelFinishedProductBatch, type ActionState } from "@/lib/actions/finished-product";
import { Button } from "@/components/ui/button";

// Ravi (15 Sept 2026): "till 'Create Batch' is clicked batch should be
// in draft status... If batch is in draft state for more than 30 mins,
// it should automatically cancelled... A smaller timer should be
// displayed to remind to create batch."
//
// This 30-minute window is purely a display countdown, computed from the
// batch's own created_at (the moment it was drawn from Step 2/compose,
// same moment its RM was pulled) — it does not itself enforce anything.
// The actual auto-cancel is server-side and lazy (expire_stale_fp_drafts(),
// 0046_fp_batch_draft_cancel.sql — no cron infra exists in this app, and
// Ravi chose lazy-on-page-load over adding it): a stale draft's row still
// literally says "draft" until someone next loads the FP list or this
// detail page. Once the countdown reaches zero here, all this component
// can do is ask Next.js to refetch the page — that's what actually
// triggers the server-side check and, if this batch was the one that
// went stale, flips it to "cancelled" for real.
const DRAFT_TIMEOUT_MS = 30 * 60 * 1000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function DraftActionsPanel({ batchId, createdAt, canEdit }: { batchId: string; createdAt: string; canEdit: boolean }) {
  const router = useRouter();
  const expiresAt = new Date(createdAt).getTime() + DRAFT_TIMEOUT_MS;
  const [remainingMs, setRemainingMs] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const tick = () => setRemainingMs(expiresAt - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expired = remainingMs <= 0;
  useEffect(() => {
    if (!expired) return;
    router.refresh();
    // Intentionally fires once per mount when the countdown first crosses
    // zero — router.refresh() re-runs the Server Component, which re-runs
    // expire_stale_fp_drafts() and re-renders with whatever status this
    // batch actually has afterward (cancelled, in almost every case).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const confirmBound = confirmFinishedProductBatch.bind(null, batchId);
  const [confirmState, confirmAction, confirmPending] = useActionState<ActionState, FormData>(confirmBound, undefined);
  const cancelBound = cancelFinishedProductBatch.bind(null, batchId);
  const [cancelState, cancelAction, cancelPending] = useActionState<ActionState, FormData>(cancelBound, undefined);

  const lowTime = remainingMs < 5 * 60 * 1000;

  return (
    <div className="rounded-md border border-amber/30 bg-amber-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber">Draft — not yet in production</p>
          <p className="mt-1 max-w-xl text-xs text-amber">
            Raw material for this batch has already been reserved from inventory. Click <strong>Create Batch</strong> to
            start production, or <strong>Cancel</strong> to release the reservation. Left as a draft for more than 30
            minutes, it cancels itself automatically and the reserved raw material goes back to inventory.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-amber">Auto-cancels in</p>
          <p className={`font-mono text-lg font-semibold ${lowTime ? "text-red" : "text-amber"}`}>
            {formatRemaining(remainingMs)}
          </p>
        </div>
      </div>

      {canEdit && (
        <>
          {confirmState?.error && <p className="mt-3 text-sm text-red">{confirmState.error}</p>}
          {cancelState?.error && <p className="mt-3 text-sm text-red">{cancelState.error}</p>}
          <div className="mt-3 flex gap-2">
            <form action={confirmAction}>
              <Button type="submit" disabled={confirmPending || cancelPending}>
                {confirmPending ? "Creating…" : "Create Batch"}
              </Button>
            </form>
            <form action={cancelAction}>
              <Button type="submit" variant="danger" disabled={confirmPending || cancelPending}>
                {cancelPending ? "Cancelling…" : "Cancel"}
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
