import type { PostgrestError } from "@supabase/supabase-js";

// known-issues.md ("Row-cap truncation") — Supabase/PostgREST enforces a
// server-side max-rows cap (this project's is 1,000) that a client-side
// `.limit()`/`.range()` call CANNOT exceed: asking for more rows than the
// server's configured max still only returns the server's max, silently,
// with no error. Found the hard way while fixing Stock Position
// (0031_stock_position.sql's item_position view) — `.limit(5000)` looked
// like a fix and passed every local check, but the deployed page still
// silently truncated at exactly 1,000 rows, because the cap is enforced
// server-side regardless of what the client asks for.
//
// The only way to get more than the server's max-rows in one logical
// fetch is genuine pagination: repeat the request with `.range()` windows
// no wider than the server max, concatenating pages until a short page
// (fewer rows than requested) signals the end. `pageSize` here matches
// this project's actual configured cap (1,000) — pass a smaller value
// only if a specific table's row shape is large enough to hit a response
// size limit before the row-count cap.
//
// Requires the underlying query to have a stable, deterministic order
// (a real `.order()` call) — `.range()` pagination across an unordered
// result is not guaranteed consistent between pages by Postgres itself.
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) return { data: all, error };
    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}
