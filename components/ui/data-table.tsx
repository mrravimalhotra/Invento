"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/form";
import { Search } from "lucide-react";

export type Column<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
};

// FB-0003: a single "Hide legacy data" toggle, shared across every table
// that opts in via `isLegacy`, so the choice made on one list page (e.g.
// Item Master) carries over to the others (Vendors, Purchase, MFR,
// Finished Product) instead of resetting per page.
const HIDE_LEGACY_STORAGE_KEY = "invento_hide_legacy_data";

export function DataTable<T>({
  columns,
  rows,
  emptyLabel = "Nothing here yet.",
  searchPlaceholder = "Search…",
  pageSize = 15,
  isLegacy,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  // When provided, rows this returns true for are treated as legacy data
  // migrated from the old app, and a "Hide legacy data" toggle appears.
  isLegacy?: (row: T) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [hideLegacy, setHideLegacy] = useState(false);

  useEffect(() => {
    if (!isLegacy) return;
    try {
      // One-shot read of a per-viewer preference on mount, not a
      // synchronization loop — matches the pattern already used in
      // purchase-line-form.tsx.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHideLegacy(window.localStorage.getItem(HIDE_LEGACY_STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable (private browsing, etc.) — default stays off.
    }
    // Only read on mount; isLegacy identity changes every render (inline arrow fns).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleHideLegacy(next: boolean) {
    setHideLegacy(next);
    setPage(0);
    try {
      window.localStorage.setItem(HIDE_LEGACY_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Best-effort persistence only.
    }
  }

  const legacyFiltered = useMemo(() => {
    if (!isLegacy || !hideLegacy) return rows;
    return rows.filter((row) => !isLegacy(row));
  }, [rows, isLegacy, hideLegacy]);

  const filtered = useMemo(() => {
    if (!query.trim()) return legacyFiltered;
    const q = query.toLowerCase();
    return legacyFiltered.filter((row) =>
      columns.some((c) => c.searchValue?.(row)?.toLowerCase().includes(q))
    );
  }, [legacyFiltered, query, columns]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const legacyCount = isLegacy ? rows.filter(isLegacy).length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {isLegacy && legacyCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={hideLegacy}
              onChange={(e) => toggleHideLegacy(e.target.checked)}
            />
            Hide legacy data
            <span className="text-xs text-muted">({legacyCount} migrated from old app)</span>
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.header} className="px-4 py-2.5 whitespace-nowrap">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  {emptyLabel}
                </td>
              </tr>
            )}
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-black/[0.015]">
                {columns.map((c) => (
                  <td key={c.header} className="px-4 py-2.5 align-top">
                    {c.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted">
          <span>
            Page {page + 1} of {pageCount} · {filtered.length} rows
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
