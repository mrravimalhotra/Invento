// UX-16 (Ravi, 25 Oct 2026): "← Back to <list>" returns to a list as it was left.
// Two things are remembered for this browser tab only (sessionStorage):
//   1. the last address of each list page, with its query (the Ledger, Audit Log
//      and other filters live there) — written by ListUrlMemory on every page view;
//   2. each table's search box, filters, sort and page — written by DataTable.
// They are restored only when the person comes back through the back link
// (BackLink marks the return); arriving from the menu still opens the plain list.
// Storage can be missing or blocked: every call is guarded and fails quietly.

const URL_PREFIX = "invento:list-url:";
const TABLE_PREFIX = "invento:table:";
const RETURN_KEY = "invento:return-to";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    const s = store();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // storage full or blocked: nothing to remember
  }
}

export function rememberListUrl(pathname: string, search: string) {
  write(URL_PREFIX + pathname, search ? `${pathname}?${search}` : pathname);
}

/** The address to go back to for a list page: as last seen in this tab, or the plain list. */
export function recallListUrl(listPath: string): string {
  return read(URL_PREFIX + listPath) ?? listPath;
}

/** Called when the back link is clicked: the list it opens should restore its table state. */
export function markReturnTo(listPath: string) {
  write(RETURN_KEY, JSON.stringify({ path: listPath, at: Date.now() }));
}

// The mark is read by every table on the page (there can be several), so it is not
// cleared; it simply expires, so a later visit from the menu starts plain.
const RETURN_WINDOW_MS = 15_000;

/** True when this page was opened by the back link a moment ago. */
export function isReturnTo(pathname: string): boolean {
  const raw = read(RETURN_KEY);
  if (!raw) return false;
  try {
    const m = JSON.parse(raw) as { path: string; at: number };
    return m.path === pathname && Date.now() - m.at < RETURN_WINDOW_MS;
  } catch {
    return false;
  }
}

export type TableMemory = {
  query: string;
  source: "all" | "new" | "legacy";
  showInactive: boolean;
  sort: { header: string; dir: "asc" | "desc" } | null;
  page: number;
};

export function saveTableState(key: string, state: TableMemory) {
  write(TABLE_PREFIX + key, JSON.stringify(state));
}

export function loadTableState(key: string): TableMemory | null {
  const raw = read(TABLE_PREFIX + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TableMemory;
  } catch {
    return null;
  }
}
