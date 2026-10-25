"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isReturnTo, loadTableState, saveTableState } from "@/lib/list-memory";
import { termsIn } from "@/lib/glossary";
import { TermHint } from "@/components/ui/term-hint";
import { Input } from "@/components/ui/form";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportTable, type ExportFormat, type TableExport } from "@/lib/table-export";
import { useHideLegacy } from "@/lib/hooks/use-hide-legacy";
import { clampPage } from "@/lib/paging";
import { cn } from "@/lib/utils";

export type Column<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
};

type SortKey = string | number;

// SCAN-P7-18: a column is sortable when it gives a sort value, or at least a search text.
function sortKeyOf<T>(c: Column<T>, row: T): SortKey {
  if (c.sortValue) return c.sortValue(row);
  return c.searchValue?.(row) ?? "";
}

// Empty values go last in either direction; numbers compare as numbers, text with numbers
// inside it in natural order (RM-2 before RM-10), ignoring case.
function isEmptyKey(k: SortKey): boolean {
  return k === "" || (typeof k === "number" && Number.isNaN(k));
}
function compareKeys(a: SortKey, b: SortKey): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// UX-07 part 2: a heading's hover text explains its short terms, then says it sorts.
function headerTitle(header: string): string {
  const terms = termsIn(header);
  return terms.length ? `${terms.map((t) => t.meaning).join(" ")} Click to sort.` : "Click to sort";
}

export function DataTable<T>({
  columns,
  rows,
  emptyLabel = "Nothing here yet.",
  emptyHint,
  searchPlaceholder = "Search…",
  pageSize = 15,
  isLegacy,
  isOpeningStock,
  isInactive,
  exportConfig,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
  // UX-11: one short line under an empty list saying what fills it.
  emptyHint?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  // When provided, rows this returns true for are treated as legacy data
  // migrated from the old app, and a "Hide legacy data" toggle appears.
  isLegacy?: (row: T) => boolean;
  // Opening stock (0100): rows this returns true for came from the old records.
  // A Source filter (All / New / Legacy) appears when there is at least one.
  isOpeningStock?: (row: T) => boolean;
  // SCAN-P8-03: rows this returns true for are retired records. They are hidden
  // unless the "Show inactive" tick is on (off by default); the tick appears only
  // when there is at least one such row.
  isInactive?: (row: T) => boolean;
  // When provided, Excel / PDF buttons appear and export every row that
  // matches the search box and the "Hide legacy data" switch (not just the
  // page on screen). See lib/table-export.ts.
  exportConfig?: TableExport<T>;
}) {
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [page, setPage] = useState(0);
  // Shared app-wide preference (lib/hooks/use-hide-legacy.ts) — also
  // readable/writable from the Dashboard's toggle and from every
  // legacy-aware <Select> combobox, all reading the same localStorage key.
  const [hideLegacy, setHideLegacyPreference] = useHideLegacy();

  function toggleHideLegacy(next: boolean) {
    setHideLegacyPreference(next);
    setPage(0);
  }

  const [source, setSource] = useState<"all" | "new" | "legacy">("all");
  const sourceFiltered = useMemo(() => {
    if (!isOpeningStock || source === "all") return rows;
    return rows.filter((row) => (source === "legacy") === isOpeningStock(row));
  }, [rows, isOpeningStock, source]);
  const openingCount = isOpeningStock ? rows.filter(isOpeningStock).length : 0;

  const [showInactive, setShowInactive] = useState(false);
  const activeFiltered = useMemo(() => {
    if (!isInactive || showInactive) return sourceFiltered;
    return sourceFiltered.filter((row) => !isInactive(row));
  }, [sourceFiltered, isInactive, showInactive]);
  const inactiveCount = isInactive ? rows.filter(isInactive).length : 0;

  const legacyFiltered = useMemo(() => {
    if (!isLegacy || !hideLegacy) return activeFiltered;
    return activeFiltered.filter((row) => !isLegacy(row));
  }, [activeFiltered, isLegacy, hideLegacy]);

  const filtered = useMemo(() => {
    if (!query.trim()) return legacyFiltered;
    const q = query.toLowerCase();
    return legacyFiltered.filter((row) =>
      columns.some((c) => c.searchValue?.(row)?.toLowerCase().includes(q))
    );
  }, [legacyFiltered, query, columns]);

  // SCAN-P7-18: click a heading to sort ascending, again for descending, a third time to
  // go back to the original order. Sorting happens before paging and before export.
  const [sort, setSort] = useState<{ header: string; dir: "asc" | "desc" } | null>(null);
  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.header === sort.header) : undefined;
    if (!sort || !col) return filtered;
    const sign = sort.dir === "asc" ? 1 : -1;
    return filtered
      .map((row, i) => ({ row, i, k: sortKeyOf(col, row) }))
      .sort((a, b) => {
        const ae = isEmptyKey(a.k);
        const be = isEmptyKey(b.k);
        if (ae || be) return ae === be ? a.i - b.i : ae ? 1 : -1; // empty values stay last
        const c = compareKeys(a.k, b.k);
        return c !== 0 ? c * sign : a.i - b.i;
      })
      .map((x) => x.row);
  }, [filtered, columns, sort]);

  // UX-16: remember this table's search, filters, sort and page for this tab; restore
  // them only when the person comes back through a record page's "Back to" link.
  const pathname = usePathname();
  const memoryKey = `${pathname}|${exportConfig?.title ?? searchPlaceholder}`;
  const [memoryReady, setMemoryReady] = useState(false);
  useEffect(() => {
    const saved = isReturnTo(pathname) ? loadTableState(memoryKey) : null;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore after mount; storage is not available while rendering on the server */
    if (saved) {
      setQuery(saved.query ?? "");
      setSource(saved.source ?? "all");
      setShowInactive(!!saved.showInactive);
      setSort(saved.sort ?? null);
      setPage(saved.page ?? 0);
    }
    setMemoryReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pathname, memoryKey]);
  useEffect(() => {
    if (memoryReady) saveTableState(memoryKey, { query, source, showInactive, sort, page });
  }, [memoryReady, memoryKey, query, source, showInactive, sort, page]);

  function toggleSort(header: string) {
    setSort((s) => (!s || s.header !== header ? { header, dir: "asc" } : s.dir === "asc" ? { header, dir: "desc" } : null));
    setPage(0);
  }

  // SCAN-P7-24: show that a wide table continues to the right (shadow and a line of text).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [checkScroll]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // ACC-25: the page is clamped to the last page that exists. A filter outside
  // the table (date range, category…) can shrink the rows while the table is
  // on a later page; without this it showed an empty table and "Page 11 of 2".
  const currentPage = clampPage(page, filtered.length, pageSize);
  const pageRows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const legacyCount = isLegacy ? rows.filter(isLegacy).length : 0;

  async function runExport(format: ExportFormat) {
    if (!exportConfig) return;
    setExporting(format);
    try {
      await exportTable(exportConfig, format, sorted, { search: query, hideLegacy: !!isLegacy && hideLegacy });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        {isOpeningStock && openingCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Source
            <select
              className="rounded-md border border-border bg-white px-2 py-1 text-sm text-foreground"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as "all" | "new" | "legacy");
                setPage(0);
              }}
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="legacy">Legacy</option>
            </select>
          </label>
        )}
        {isInactive && inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(0);
              }}
            />
            Show inactive
            <span className="text-xs text-muted">({inactiveCount} retired)</span>
          </label>
        )}
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
        {exportConfig && (
          <div className="flex items-center gap-2">
            {exportConfig.formats.includes("excel") && (
              <Button size="sm" variant="secondary" disabled={exporting !== null || filtered.length === 0} onClick={() => runExport("excel")}>
                <Download className="h-3.5 w-3.5" />
                {exporting === "excel" ? "Preparing…" : "Excel"}
              </Button>
            )}
            {exportConfig.formats.includes("pdf") && (
              <Button size="sm" variant="secondary" disabled={exporting !== null || filtered.length === 0} onClick={() => runExport("pdf")}>
                <Download className="h-3.5 w-3.5" />
                {exporting === "pdf" ? "Preparing…" : "PDF"}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="relative">
      <div ref={scrollRef} onScroll={checkScroll} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              {columns.map((c, ci) => {
                const canSort = !!(c.sortValue || c.searchValue);
                const dir = sort?.header === c.header ? sort.dir : null;
                return (
                  <th
                    key={c.header}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn("px-4 py-2.5 whitespace-nowrap", ci === 0 && "max-md:sticky max-md:left-0 max-md:bg-[#fafafa]")}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.header)}
                        title={headerTitle(c.header)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground max-md:min-h-11"
                      >
                        <span className={termsIn(c.header).length ? "underline decoration-dotted underline-offset-2" : undefined}>{c.header}</span>
                        {dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : dir === "desc" ? (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                    <TermHint text={c.header} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  {/* SCAN-P7-20: say so when a search or filter removed every row, instead of "none yet". */}
                  {rows.length > 0 ? (
                    <span>
                      {query.trim() ? `No rows match \u201c${query.trim()}\u201d.` : "No rows match."}{" "}
                      {hideLegacy && isLegacy ? "“Hide legacy data” is on. " : ""}
                      <button
                        type="button"
                        className="font-medium text-brand-dark hover:underline max-md:min-h-11"
                        onClick={() => {
                          setQuery("");
                          setSource("all");
                          setPage(0);
                        }}
                      >
                        Clear search and filters
                      </button>
                    </span>
                  ) : (
                    <>
                      {emptyLabel}
                      {emptyHint && <span className="mt-1 block text-xs">{emptyHint}</span>}
                    </>
                  )}
                </td>
              </tr>
            )}
            {pageRows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-black/[0.015]">
                {columns.map((c, ci) => (
                  <td key={c.header} className={cn("px-4 py-2.5 align-top", ci === 0 && "max-md:sticky max-md:left-0 max-md:bg-card")}>
                    {c.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {moreRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/15 to-transparent"
        />
      )}
      </div>
      {moreRight && <p className="px-4 py-1.5 text-xs text-muted md:hidden">Swipe sideways to see more columns →</p>}
      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted">
          <span>
            {pageCount > 1 ? `Page ${currentPage + 1} of ${pageCount} · ` : ""}
            {filtered.length} {filtered.length === 1 ? "row" : "rows"}
            {filtered.length < rows.length ? ` (of ${rows.length})` : ""}
          </span>
          {pageCount > 1 && (
          <div className="flex gap-2">
            <button
              aria-label="Previous page"
              className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40 max-md:min-h-11 max-md:px-4"
              disabled={currentPage === 0}
              onClick={() => setPage(Math.max(0, currentPage - 1))}
            >
              Prev
            </button>
            <button
              aria-label="Next page"
              className="rounded-md border border-border px-2.5 py-1 disabled:opacity-40 max-md:min-h-11 max-md:px-4"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))}
            >
              Next
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
