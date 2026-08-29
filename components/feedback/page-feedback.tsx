"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, MessageSquarePlus } from "lucide-react";
import { submitFeedback, listPageFeedback, type ActionState, type FeedbackRow } from "@/lib/actions/feedback";
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

export function PageFeedback() {
  const pathname = usePathname();
  const { pagePath, pageLabel } = getPageMeta(pathname);

  // Remount (and so reset collapse state) whenever the page changes.
  return <PageFeedbackInner key={pagePath} pagePath={pagePath} pageLabel={pageLabel} urlPath={pathname} />;
}

function PageFeedbackInner({
  pagePath,
  pageLabel,
  urlPath,
}: {
  pagePath: string;
  pageLabel: string;
  urlPath: string;
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
                <div key={item.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge status={STATUS_BADGE_STYLE[item.status]}>
                        {FEEDBACK_STATUS_LABELS[item.status as keyof typeof FEEDBACK_STATUS_LABELS] ?? item.status}
                      </Badge>
                      {item.category && (
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-muted">
                          {FEEDBACK_CATEGORY_LABELS[item.category as keyof typeof FEEDBACK_CATEGORY_LABELS] ??
                            item.category}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted">
                      {item.submitted_by_name} · {formatDate(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-foreground">{item.observation}</p>
                  {item.claude_notes && (
                    <p className="mt-1.5 rounded-md bg-black/[0.03] px-2.5 py-1.5 text-xs text-muted">
                      <span className="font-medium text-foreground">Response: </span>
                      {item.claude_notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
