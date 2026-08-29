"use client";

import { useActionState } from "react";
import { triageFeedback, type ActionState, type FeedbackRow } from "@/lib/actions/feedback";
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS } from "@/lib/constants/feedback";
import { Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export function FeedbackAdminRow({ row }: { row: FeedbackRow }) {
  const boundAction = triageFeedback.bind(null, row.id);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(boundAction, undefined);

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 border-b border-border p-4 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-semibold text-foreground">{row.page_label}</span>
          <span className="font-mono">{row.url_path}</span>
          <span>·</span>
          <span>{row.submitted_by_name}</span>
          <span>·</span>
          <span>{formatDate(row.created_at)}</span>
        </div>
        <p className="mt-1.5 text-sm text-foreground">{row.observation}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select name="category" defaultValue={row.category ?? ""} className="text-xs">
            <option value="">Not classified</option>
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FEEDBACK_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={row.status} className="text-xs">
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FEEDBACK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          name="claudeNotes"
          defaultValue={row.claude_notes ?? ""}
          rows={2}
          placeholder="Notes shown to the tester (why rejected, what was fixed, etc.)"
          className="text-xs"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {state?.error && <span className="text-xs text-red">{state.error}</span>}
          {state?.success && <span className="text-xs text-brand-dark">{state.success}</span>}
        </div>
      </div>
    </form>
  );
}
