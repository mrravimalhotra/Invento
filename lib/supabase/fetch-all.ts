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
// Requires the underlying query to have a stable, deterministic order —
// and that order must be UNIQUE (ACC-07, 29 Sept 2026): ordering only by
// created_at, which many bulk-inserted rows share, let pages overlap and
// skip rows. Always end with a unique column, e.g. .order("id").
// Original note: requires the underlying query to have a stable, deterministic order
// (a real `.order()` call) — `.range()` pagination across an unordered
// result is not guaranteed consistent between pages by Postgres itself.
//
// Pages within each wave fire concurrently (21 Sept 2026 — first step of
// the pagination/perf work in docs/modules/performance.md's "Reports,
// Items, and Inventory Balance fetch entire tables" follow-up). Before
// this, every page was awaited one at a time — for Reports' Purchase
// Register alone (~92,000 rows today) that's ~92 full sequential network
// round trips before the page could render anything at all. `concurrency`
// pages are now requested at once per wave (default 8, so that same query
// drops to ~12 waves instead of 92 sequential round trips), and a wave
// stops the loop as soon as it contains a short page (the real end of the
// data), same termination rule as before — this only changes how the
// existing pages are fetched, not what's returned: results are reassembled
// in the same page order every time (`Promise.all` preserves the order of
// its input array in its output regardless of which request finishes
// first), so callers see byte-for-byte the same rows in the same order as
// the old sequential version. No UI, query, or ordering change — every
// page.tsx using this function needed zero changes.
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
  concurrency = 8
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const waves: T[][] = [];
  let from = 0;
  let done = false;

  while (!done) {
    const waveStarts = Array.from({ length: concurrency }, (_, i) => from + i * pageSize);
    const results = await Promise.all(waveStarts.map((start) => buildPage(start, start + pageSize - 1)));

    for (const { data, error } of results) {
      if (error) return { data: waves.flat(), error };
      const page = data ?? [];
      waves.push(page);
      if (page.length < pageSize) {
        // Real end of the data. Requests later in this same wave were
        // already fired (harmless — they just return empty pages, already
        // captured above in order), but no further waves are issued.
        done = true;
        break;
      }
    }
    from += concurrency * pageSize;
  }

  return { data: waves.flat(), error: null };
}

// ACC-08 (29 Sept 2026): look up rows for a long list of ids without one
// huge `.in("id", [...])` request. Thousands of ids in one request make a
// URL too long for the API (it fails, or the error is ignored and the page
// silently shows defaults). Splits the ids into chunks, fetches the chunks
// in parallel (each chunk well under the 1,000-row cap), and concatenates.
export async function fetchByIdChunks<T>(
  ids: readonly string[],
  buildChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  chunkSize = 150
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { data: [], error: null };
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));
  const out: T[] = [];
  // At most 8 requests in flight at a time, like fetchAllRows.
  for (let i = 0; i < chunks.length; i += 8) {
    const results = await Promise.all(chunks.slice(i, i + 8).map((c) => buildChunk(c)));
    for (const { data, error } of results) {
      if (error) return { data: out, error };
      out.push(...(data ?? []));
    }
  }
  return { data: out, error: null };
}
