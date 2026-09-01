"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import {
  submitFeedback,
  listPageFeedback,
  updateOwnFeedback,
  deleteOwnFeedback,
  type ActionState,
  type FeedbackRow,
} from "@/lib/actions/feedback";
import { getPageMeta, FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from "@/lib/constants/feedback";
import { Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";

const STATUS_BADGE_STYLE: Record<string, string> = {
  new: "pending",
  awaiting_implementation: "submitted",
  implemented: "approved",
  rejected: "rejected",
};

export function PageFeedback({ currentUserId }: { currentUserId: string }) {
  const pathname = usePathname();
  const { pagePath, pageLabel } = getPageMeta(pathname);

  // Remount (and so reset collapse state) whenever the page changes.
  return (
    <PageFeedbackInner
      key={pagePath}
      pagePath={pagePath}
      pageLabel={pageLabel}
      urlPath={pathname}
      currentUserId={currentUserId}
    />
  );
}

function PageFeedbackInner({
  pagePath,
  pageLabel,
  urlPath,
  currentUserId,
}: {
  pagePath: string;
  pageLabel: string;
  urlPath: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitFeedback, undefined);

  function refresh() {
    startTransition(async () => {
      const rows = await listPageFeedback(pagePath);
      setItems(rows);
      setLoaded(true);
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagePath]);

  useEffect(() => {
    if (state?.success) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success]);

  return (
    <div className="mt-8 rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquarePlus className="h-4 w-4 text-brand" />
          Feedback &amp; change log — {pageLabel}
          {loaded && items.length > 0 && (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal text-muted">
              {items.length}
            </span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border p-4">
          <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <input type="hidden" name="pagePath" value={pagePath} />
            <input type="hidden" name="pageLabel" value={pageLabel} />
            <input type="hidden" name="urlPath" value={urlPath} />
            <div className="flex-1">
              <label htmlFor={`feedback-observation-${pagePath}`} className="sr-only">
                Describe your observation
              </label>
              <Textarea
                id={`feedback-observation-${pagePath}`}
                name="observation"
                required
                minLength={5}
                rows={2}
                placeholder="Describe what you observed on this page — a bug, something confusing, or a suggestion…"
              />
              {state?.error && <p className="mt-1 text-xs text-red">{state.error}</p>}
              {state?.success && <p className="mt-1 text-xs text-brand-dark">{state.success}</p>}
            </div>
            <Button type="submit" size="sm" disabled={pending} className="shrink-0">
              {pending ? "Submitting…" : "Submit"}
            </Button>
          </form>

          <div className="mt-4 flex flex-col gap-3">
            {items.length === 0 ? (
              <p className="text-xs text-muted">No feedback recorded for this page yet.</p>
            ) : (
              items.map((item) => (
                <FeedbackItem key={item.id} item={item} currentUserId={currentUserId} onChanged={refresh} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// FB-0012 (1 Sept 2026): edit/delete for a tester's own ticket — only
// while it's still 'new' (not yet triaged by an admin), matching
// 0017_feedback_owner_crud.sql's RLS scope. A ticket that's already been
// categorized/responded to shows read-only, same as any other tester's.
function FeedbackItem({
  item,
  currentUserId,
  onChanged,
}: {
  item: FeedbackRow;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [updateState, updateAction, updatePending] = useActionState<ActionState, FormData>(
    updateOwnFeedback.bind(null, item.id),
    undefined
  );
  const [deleteState, deleteAction, deletePending] = useActionState<ActionState, FormData>(
    deleteOwnFeedback.bind(null, item.id),
    undefined
  );

  useEffect(() => {
    if (updateState?.success) {
      // Bounded, one-shot reaction to a just-completed save — not a
      // synchronization loop (same pattern as purchase-line-form.tsx).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("view");
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateState]);

  useEffect(() => {
    if (deleteState?.success) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteState]);

  const canEditOrDelete = item.status === "new" && item.submitted_by === currentUserId;

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-brand/10 px-2 py-0.5 font-mono text-xs font-semibold text-brand-dark">
            {item.ticket_number}
          </span>
          <Badge status={STATUS_BADGE_STYLE[item.status]}>
            {FEEDBACK_STATUS_LABELS[item.status as keyof typeof FEEDBACK_STATUS_LABELS] ?? item.status}
          </Badge>
          {item.category && (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-muted">
              {FEEDBACK_CATEGORY_LABELS[item.category as keyof typeof FEEDBACK_CATEGORY_LABELS] ?? item.category}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">
          Submitted by {item.submitted_by_name} · {formatDate(item.created_at)}
        </span>
      </div>

      {mode === "edit" ? (
        <form action={updateAction} className="mt-1.5 flex flex-col gap-1.5">
          <Textarea name="observation" required minLength={5} rows={2} defaultValue={item.observation} autoFocus />
          {updateState?.error && <p className="text-xs text-red">{updateState.error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={updatePending}>
              {updatePending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-1.5 text-foreground">{item.observation}</p>
      )}

      {item.claude_notes && (
        <p className="mt-1.5 rounded-md bg-black/[0.03] px-2.5 py-1.5 text-xs text-muted">
          <span className="font-medium text-foreground">Response: </span>
          {item.claude_notes}
        </p>
      )}

      {canEditOrDelete && mode === "view" && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmDelete")}
            className="flex items-center gap-1 text-xs text-muted hover:text-red"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      )}

      {canEditOrDelete && mode === "confirmDelete" && (
        <form action={deleteAction} className="mt-2 flex flex-col gap-1.5">
          {deleteState?.error && <p className="text-xs text-red">{deleteState.error}</p>}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Delete this ticket? This can&apos;t be undone.</span>
            <Button type="submit" size="sm" variant="danger" disabled={deletePending}>
              {deletePending ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
