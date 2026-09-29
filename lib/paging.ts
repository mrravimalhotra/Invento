// ACC-25 (29 Sept 2026): the page a table shows, kept inside the pages that
// exist. Tables remember a page number; when the rows shrink (a filter outside
// the table) that number can be past the end — an empty table reading
// "Page 11 of 2". Zero-based in, zero-based out.
export function clampPage(page: number, rowCount: number, pageSize: number): number {
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  return Math.max(0, Math.min(page, pageCount - 1));
}
