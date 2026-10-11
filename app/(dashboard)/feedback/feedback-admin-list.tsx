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

export function FeedbackAdminList({ rows, error }: { rows: FeedbackRow[]; error?: string }) {
  const [tab, setTab] = useState<FeedbackStatus | "all">("all");
  // SCAN-P8-11: search and a Page filter, so the list stays usable as tickets grow.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("");
  const pages = useMemo(() => Array.from(new Set(rows.map((r) => r.page_label))).sort((a, b) => a.localeCompare(b)), [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (tab === "all" || r.status === tab) &&
      (!page || r.page_label === page) &&
      (!q ||
        [r.ticket_number, r.page_label, r.observation, r.submitted_by_name, r.claude_notes ?? ""].some((v) => v.toLowerCase().includes(q)))
  );

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
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticket, page, text or name…"
          aria-label="Search feedback"
          className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
        />
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          aria-label="Filter by page"
          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
        >
          <option value="">All pages</option>
          {pages.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="p-4 text-sm text-red">Couldn&apos;t load feedback. {error}</p>}
      {filtered.length === 0 ? (
        !error && <p className="p-6 text-sm text-muted">{rows.length === 0 ? "No feedback in this category." : "No feedback matches this filter."}</p>
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
