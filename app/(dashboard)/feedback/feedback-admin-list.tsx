"use client";

import { useMemo, useState } from "react";
import type { FeedbackRow } from "@/lib/actions/feedback";
import { FEEDBACK_STATUS_LABELS, type FeedbackStatus } from "@/lib/constants/feedback";
import { cn } from "@/lib/utils";
import { FeedbackAdminRow } from "./feedback-row";

const TABS: { key: FeedbackStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: FEEDBACK_STATUS_LABELS.new },
  { key: "awaiting_implementation", label: FEEDBACK_STATUS_LABELS.awaiting_implementation },
  { key: "implemented", label: FEEDBACK_STATUS_LABELS.implemented },
  { key: "rejected", label: FEEDBACK_STATUS_LABELS.rejected },
];

export function FeedbackAdminList({ rows }: { rows: FeedbackRow[] }) {
  const [tab, setTab] = useState<FeedbackStatus | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === t.key ? "bg-brand text-white" : "bg-black/5 text-muted hover:bg-black/10"
            )}
          >
            {t.label} <span className="opacity-70">({counts[t.key] ?? 0})</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-muted">No feedback in this category.</p>
      ) : (
        filtered.map((row) => (
          // Remount on save (updated_at changes) so the uncontrolled
          // category/status selects re-initialize from the saved
          // value instead of keeping whatever was on screen before.
          <FeedbackAdminRow key={`${row.id}:${row.updated_at ?? ""}`} row={row} />
        ))
      )}
    </div>
  );
}
