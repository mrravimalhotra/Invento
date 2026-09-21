# Performance

Not a business module — cross-cutting database/query performance work and
findings, spanning multiple modules' tables. See `docs/modules/shell.md` for
the separate "make the wait visible" (loading-state) fix this grew out of.

## Missing indexes on hot foreign-key columns (21 Sept 2026)

Ravi: *"the app is very slow, help optimize it."* Alongside the loading-state
fix (`docs/modules/shell.md`), a quick audit of the schema and the app's own
query patterns turned up the other half of "why slow": across 56 migrations,
almost nothing had an index. Postgres does not automatically index foreign
key columns — that has to be done explicitly, and it never was here. Full
list of what got added, and why each one is real (not speculative — every
column below was confirmed by grepping actual `.eq("<column>", ...)` call
sites in `lib/actions/*.ts` and `app/(dashboard)/**/page.tsx`, and cross-
checking each table's real column names in `supabase/migrations/0001_init.sql`
/ `0048_mfr_procedure.sql` / `0050_production_rm_from_packaging.sql`):

| Table | Column | Why it's hit |
|---|---|---|
| `inventory_ledger` | `item_id` | `stock_balance` view (`0001_init.sql`) is `group by item_id` over the *entire* ledger — queried from the Dashboard, Items list, Item detail, Inventory Balance, Reports, and the Finished Product compose screen. Grows with every purchase/QC/production/packaging transaction. |
| `inventory_ledger` | `purchase_line_id` | Per-batch ledger views/reports. |
| `quality_checks` | `purchase_line_id` | The existing `quality_checks_purchase_line_pending_unique` index (`0025`/`0054`) is a *partial* index scoped to `status='submitted'` — the planner can't use it for an unscoped lookup. General lookups happen in `lib/actions/qc.ts`, and critically inside `purchase_batch_status`'s (`0001_init.sql`) per-row `LEFT JOIN LATERAL`, which runs once per `purchase_lines` row (already ~92k on the live DB) — this view backs the QC list's "Awaiting QC"/"Due for retest" cards (every `/qc` visit) and the Finished Product compose screen's candidate-batch lookup. |
| `quality_checks` | `finished_product_batch_id` | FP batch's own QC record lookups. |
| `quality_checks` | `item_id` | Item-scoped QC history. |
| `purchase_lines` | `item_id` | `purchase_lines_item_batch_unique` (`0013`) is a partial index (excludes `'LEG-%'` rows) with `item_id` as its leading column, but only serves queries that respect that partial predicate — a plain per-item count (e.g. `get_next_batch_number()`'s per-item/year sequence, called on every new purchase line) or the item detail page's purchase-batches table isn't covered by it. |
| `purchase_lines` | `purchase_order_id` | Every Purchase Order detail page (`/purchase/[id]`) loads its lines this way. |
| `finished_product_components` | `finished_product_batch_id` | FP batch detail page. |
| `finished_product_components` | `item_id` | Item-scoped component lookups. |
| `finished_product_components` | `purchase_line_id` | Packaging issue / consumption lookups (`lib/actions/packaging.ts`). |
| `finished_product_components` | `production_batch_id` | Same shape as `purchase_line_id` — a component sources from exactly one of the two (`0050_production_rm_from_packaging.sql`). |
| `mfr_lines` | `mfr_definition_id` | Every MFR detail/report page. |
| `mfr_procedure_steps` | `mfr_definition_id` | Same, for the Manufacturing Procedure section. |
| `finished_product_batches` | `mfr_definition_id` | `get_next_fp_batch_number(p_mfr_definition_id)` (`0055_fp_batch_number_embed_item_code.sql`, shipped earlier the same day) counts rows filtered on this column on every "Create Batch" click. |

Shipped as `supabase/migrations/0056_performance_indexes.sql` — plain
`CREATE INDEX IF NOT EXISTS` statements, no data touched, no existing query
result changes (only how fast Postgres computes it), trivially reversible
with `DROP INDEX` if one is ever not wanted. Matches this project's existing
migration style (no other migration here uses `CREATE INDEX CONCURRENTLY`);
`purchase_lines` at ~92k rows is the largest table touched, and a plain
index build on it is expected to take at most a few seconds, during which
writes to that one table briefly block — acceptable for this app's traffic,
but nothing stops running that one statement on its own during a quiet
moment if extra caution is wanted.

## Known follow-ups, not yet done (flagged 21 Sept 2026)

Found during the same audit, deliberately **not** done in this pass — each
is either a larger architectural change, a behavior change worth Ravi's
explicit go-ahead, or lower urgency than the indexes above:

- **Reports, Items, and Inventory Balance fetch entire tables to the
  browser, then paginate/search client-side.** `app/(dashboard)/reports/
  page.tsx` pages through `purchase_lines` (~92k rows today) via
  `fetchAllRows()` (`lib/supabase/fetch-all.ts`) in 1,000-row windows,
  alongside similar full scans of `items`, `stock_balance`, `quality_checks`,
  and `finished_product_batches` — every single time anyone opens Reports.
  `app/(dashboard)/items/page.tsx` and `app/(dashboard)/inventory/(tabs)/
  balance/page.tsx` do the same against ~2,200+ active items. This is
  likely the single slowest page in the app today (Reports especially), and
  gets linearly worse as more purchases are entered — independent of the
  indexes above, since the query itself asks for every row on purpose. The
  root cause is architectural: `components/ui/data-table.tsx` only ever
  does client-side search/pagination (`useMemo` over the full `rows` prop),
  so no list page in the app currently asks the database for less than
  everything. Fixing this properly means server-side
  search/filter/pagination on these specific pages — a real behavior
  change (URL-driven pagination, debounced server search, etc.), not a
  drop-in fix, and worth scoping as its own task rather than guessing at
  the right UX.
- **Bulk upload does one sequential round trip per row for code
  generation.** `bulkUploadItems`/`bulkUploadVendors`/`bulkUploadEquipment`/
  `bulkUploadDeadStock` (`lib/actions/bulk-upload.ts`) each call
  `get_next_*_code()` once per parsed row before the batched insert — up to
  500 sequential round trips for a full 500-row file. MFR and Purchase bulk
  upload already avoid this via a single RPC per file; worth copying that
  pattern here, but only matters when bulk upload is actually used with a
  large file.
- **`recharts` (the Dashboard's chart library) is bundled unconditionally
  into the highest-traffic page** (`app/(dashboard)/charts.tsx`, rendered
  from `app/(dashboard)/page.tsx` — the post-login landing page everyone
  hits every session), with no code-splitting anywhere in the app
  (`next/dynamic` isn't used at all). Lazy-loading it would shave avoidable
  JS off the very first page most users see.
- **`stock_balance` / `item_position`** (`0001_init.sql` / `0031_stock_
  position.sql`) are plain views, recomputed from scratch on every query
  rather than cached or materialized. The indexes above make each
  computation much cheaper, but the underlying "rescan and re-aggregate the
  whole ledger every time" pattern is still there — a materialized view
  with a refresh trigger would remove it entirely, at the cost of some
  added complexity (staleness window, refresh triggers on every ledger
  write). Only worth it if the indexes alone don't bring these pages down
  to an acceptable speed.

- ~~`proxy.ts` (middleware) and every request's Server Component render each
  do their own independent `supabase.auth.getUser()` call.~~ **Fixed** — see
  "Middleware and page render each independently re-validated the session"
  below.

None of the remaining items were touched in this pass — flagging them here
rather than picking one and diving in unasked, since each involves either a
real UX/behavior decision (server-side pagination shape) or added
complexity (materialized views) that's worth Ravi's explicit go-ahead
first.

## Missing request memoization on `getCurrentUser()` (21 Sept 2026)

Ravi, after the two fixes above: *"page load is still taking a lot of time,
even for pages where no data/less data exists such as deadstock register or
finished product screen."* That phrasing was the key clue — a fixed,
per-page cost that shows up even when a page has almost nothing to fetch
points at something outside the page's own data query, not at the query
itself (the indexes above only help queries that actually run).

**Root cause:** `lib/auth/session.ts`'s `getCurrentUser()` is called from
`app/(dashboard)/layout.tsx` on **every** dashboard request (for the
auth-redirect check and the Sidebar/Topbar's user info) and, separately,
from almost every individual `page.tsx` again (e.g.
`app/(dashboard)/dead-stock/page.tsx` and
`app/(dashboard)/finished-product/page.tsx` both open with
`Promise.all([getCurrentUser(), createClient()])` for their own role check)
— 67 call sites total across the app. `getCurrentUser()` was a plain
`async function`, not memoized, so each of those calls ran its own fresh
`supabase.auth.getUser()` (a real network round trip to Supabase Auth that
re-validates the JWT server-side — not a local decode) plus two more
queries (`user_roles`, `profiles`), in full, every time. A single page load
was paying for that entire auth round trip at least twice — once in the
layout, once again in the page — before the page's own actual data query
even started. On a data-heavy page (Reports) that fixed tax is dwarfed by
the real query cost and easy to miss; on a data-light page (Dead Stock,
Finished Product) it's most of the load time, which is exactly what Ravi
reported.

**Fix:** wrapped `getCurrentUser` in React's `cache()`
(`export const getCurrentUser = cache(async () => {...})`). Confirmed via
this fork's own docs
(`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`,
"Reusing data with React.cache") that `React.cache()` is unchanged in this
Next.js version and is the documented mechanism for exactly this case:
memoization scoped to a single request/render pass, so every call to
`getCurrentUser()` within the same page load now shares one real lookup
instead of repeating it. Safe by construction — the signed-in user can't
change mid-request, so handing the same resolved value to every caller in
that render is correct, not stale; each new request (including a fresh
Server Action submission) still gets its own fresh lookup.

Purely an app-layer change — no database migration, no `lib/actions/*.ts`
changes beyond the one function, no API/behavior change for any caller.
Verified: `tsc --noEmit`, `eslint` (0 errors — same 41 pre-existing
unrelated warnings as before this change), and `next build` all clean,
plus a local `next dev` smoke test confirming `/login` (200) and
unauthenticated requests to `/`, `/dead-stock`, and `/finished-product`
(307 redirects, no 500s) all behave correctly.

## Global Topbar banner was scanning the whole ledger on every page (21 Sept 2026)

Ravi, after applying the `getCurrentUser()` fix above: *"page load is still
taking a lot of time, even for pages where no data/less data exists such as
deadstock register or finished product screen."* Same page load, still slow
— so there was a second fixed, page-independent cost stacked on top of the
first one. Found it in `components/shell/topbar.tsx`.

**Root cause:** `Topbar` (rendered by `app/(dashboard)/layout.tsx`, i.e.
**every** dashboard page, not just Items/Inventory) renders an async
`LowStockBanner` Server Component with no `Suspense` boundary around it.
`LowStockBanner` queried `stock_balance` with no filter —
`supabase.from("stock_balance").select("item_id, on_hand")`. `stock_balance`
(`0001_init.sql`) is a plain view — `select item_id, sum(...) from
inventory_ledger group by item_id` — recomputed from scratch on every query,
already flagged as a known cost center in the "Known follow-ups" section
above, but that note assumed it only mattered on Items/Inventory-type pages.
It doesn't: this banner runs it unfiltered on literally every page in the
app, via the shared layout, and because it isn't wrapped in `Suspense`,
Next.js has to wait for it to resolve before the rest of that page can
render — so every page was paying the cost of a full `inventory_ledger`
scan (a table that only grows, with every purchase/QC/production/packaging
transaction) regardless of what that page's own content actually needed.
This explains the "even light pages" symptom precisely: Dead Stock and
Finished Product have almost no data of their own, but the shared Topbar's
hidden full-ledger scan ran anyway, on every single visit.

**Fix (two parts, same file):**

- **Scoped the query.** Fetch `items` with a `low_stock_threshold` set
  first (as before), then query `stock_balance` filtered to just those
  item IDs via `.in("item_id", itemIds)`, instead of every item in the
  catalog. Verified locally against a 100k-row `inventory_ledger` (matching
  this table's real growth pattern): the unfiltered query took ~27ms (full
  sequential scan + aggregate of every row); the same query scoped to 5
  item IDs via a literal `IN (...)` list (what Supabase's `.in()` compiles
  to — confirmed via `EXPLAIN ANALYZE`) took under 1ms, using the
  `inventory_ledger_item_id_idx` index from `0056_performance_indexes.sql`
  via a Bitmap Index Scan instead of a sequential scan. The gap only grows
  as the ledger does, since the unfiltered version always scans the whole
  table regardless of size.
- **Suspense-wrapped `<LowStockBanner />`** in `Topbar`, with
  `fallback={null}`. Whatever the banner's remaining cost, it no longer
  blocks the rest of the page — same "don't make the user wait on something
  non-critical" principle as the `loading.tsx` fix
  (`docs/modules/shell.md`). The banner now pops in a moment after the rest
  of the page, rather than holding up everything.

No database migration — both changes are queries/JSX in
`components/shell/topbar.tsx`. Verified: `tsc --noEmit`, `eslint` (0
errors), `next build` all clean, plus a local `next dev` smoke test
confirming `/login`, `/`, `/dead-stock`, and `/finished-product` all
respond correctly with no server errors.

## Finished Product list ran a write RPC serially before its own query (21 Sept 2026)

Found in the same pass as the Topbar fix above, specific to
`app/(dashboard)/finished-product/page.tsx`: the page's lazy 30-minute
draft-expiry cleanup (`await supabase.rpc("expire_stale_fp_drafts")`,
`0046_fp_batch_draft_cancel.sql`) was awaited on its own line, strictly
*before* the page's main `finished_product_batches` query started — a full
extra sequential round trip on every single visit to this page, on top of
everything else already happening (auth checks, Topbar). Changed to run
alongside the main select via `Promise.all`, cutting one round trip.
Tradeoff: a batch that crosses the 30-minute mark in the split second
between the two queries starting could show as "draft" for one more page
load before flipping to "cancelled" — acceptable for a lazy background
cleanup that was never meant to be strictly synchronous with page render,
and self-corrects on the next load. No other page in the app has this
serial-RPC-before-query pattern (checked via grep across `app/(dashboard)/**/
page.tsx`).

## Middleware and page render each independently re-validated the session (21 Sept 2026)

Flagged as a known follow-up above; Ravi asked to go ahead with it after
confirming patches `0009`/`0010` were both already applied. This was the one
remaining architectural cost from the original diagnosis: even with
`getCurrentUser()` memoized within a render pass, `proxy.ts` (middleware —
see `lib/supabase/middleware.ts`'s `updateSession()`) runs on nearly every
request (its `matcher` excludes only static assets) and does its own
`supabase.auth.getUser()` call to decide whether to redirect to `/login`.
`React.cache()` can't reach across that boundary — middleware runs as a
separate phase before the React tree exists — so `getCurrentUser()`'s own
`getUser()` call, moments later in the actual page render, was a fully
redundant second network round trip to Supabase Auth, on every request. A
local smoke test measured `proxy.ts` alone at up to ~215ms on a cold
request — a real cost, paid twice.

**Fix:** middleware now forwards the identity it already validated to the
render phase via two request headers (`x-invento-user-id`,
`x-invento-user-email`), using the documented Next.js pattern —
`NextResponse.next({ request: { headers } })` — confirmed against this
fork's own reference (`node_modules/next/dist/docs/01-app/03-api-reference/
03-file-conventions/proxy.md`, "Setting Headers": this form "make[s]
requestHeaders available upstream", as opposed to
`NextResponse.next({ headers })` which would instead be a *response* header
visible to the client — the wrong one for this). `getCurrentUser()`
(`lib/auth/session.ts`) now checks for `x-invento-user-id` first and, when
present, skips its own `supabase.auth.getUser()` call entirely — middleware
already did that exact check for this exact request. Falls back to a real
`getUser()` call when the header is absent, so nothing silently breaks if
this code path is ever reached some other way.

**Why this doesn't weaken auth:** the architecture already fully trusted
middleware's decision here — if middleware had decided "no valid session",
it would have redirected to `/login` before the page ever rendered, so a
page reachable at all already implies middleware validated the user a
moment earlier. Forwarding that result instead of re-deriving it doesn't
extend trust anywhere it didn't already reach. The real risk with this kind
of change is a client spoofing the header to claim someone else's identity,
so the header is never a pass-through of anything client-supplied: every
branch in `updateSession()`'s final return either overwrites both headers
with the value just validated (the `user` branch) or explicitly deletes
them (the no-`user` branch) — there is no path that leaves a client-sent
value untouched. Also checked: the render-phase `getUser()` call being
replaced never actually refreshed the session cookie in the first place —
`lib/supabase/server.ts`'s own `setAll` callback silently no-ops when
called from a Server Component (cookies can only be written from
middleware, Server Actions, or Route Handlers), with a comment already
noting "safe to ignore because middleware.ts refreshes the session on every
request" — so nothing is lost by skipping it here.

**Verified**, since this touches the auth path directly:
- A standalone script exercised the real `next/server` module (same version
  as production, no mocked Next.js internals) with a simulated malicious
  request that set `x-invento-user-id: attacker-spoofed-id` on the incoming
  request — confirmed the header Next.js actually forwards downstream
  (`x-middleware-request-x-invento-user-id`) always carries the *validated*
  user id, never the client-supplied one, in both the authenticated and
  unauthenticated cases; also confirmed a staged session-refresh cookie
  survives being replayed onto the final response.
- `tsc --noEmit`, `eslint` (0 errors), `next build` all clean.
- Local `next dev` smoke test: unauthenticated requests to `/login` (200),
  `/register` (200), and `/`, `/dead-stock`, `/finished-product` (307
  redirects) all behave identically to before this change — including a
  request to `/dead-stock` with a forged `x-invento-user-id` header
  attached, which still correctly redirects to `/login` rather than being
  fooled into treating the request as authenticated.
- Not verified in this pass: a real logged-in request end to end (this
  sandbox has no test Supabase credentials to sign in with). Worth a quick
  manual check after applying — log in and confirm pages still show your
  correct name/roles in the Topbar — before considering this fully closed.

No database migration — `lib/supabase/middleware.ts` and
`lib/auth/session.ts` only.

## Pagination roadmap, step 1: parallelize the full-table-fetch workaround (21 Sept 2026)

Ravi asked to discuss pagination as the next lever, then to start executing
iteratively beginning with easy wins. Step 1 is this one — no design
decisions needed, no UI/behavior change, safe to ship on its own ahead of
the bigger, real server-side-pagination work below.

**The finding that set the priority order:** `lib/supabase/fetch-all.ts`'s
`fetchAllRows()` (used by Reports, Items, and Inventory Balance — see the
"Reports, Items, and Inventory Balance fetch entire tables" follow-up
above) works around Supabase's 1,000-row-per-request server cap by paging
through an entire table in `.range()` windows, but it did so **one page at
a time, fully sequentially** — each page awaited before the next was even
requested. For Reports' Purchase Register specifically, at today's ~92,000
rows, that's roughly 92 full sequential network round trips to Supabase
before the page can render *anything*, every single time anyone opens
Reports. Items (~2,200+ active items) and Inventory Balance pay a smaller
version of the same tax.

**Fix:** `fetchAllRows` now fires `concurrency` (default 8) page requests
per wave instead of one at a time, stopping as soon as a wave contains the
real end-of-data (a short page) — same termination rule as before, just
batched. Every `page.tsx` calling it needed zero changes: same function
signature (with a new optional third parameter), same return shape, same
row order (`Promise.all` preserves the input array's order in its output
regardless of which request finishes first, so results are reassembled
identically to the old sequential version).

**Verified** with a standalone script exercising the real production
function (not a reimplementation) against a fake paginated data source with
simulated per-request latency:
- Correctness: parallel and sequential runs return the exact same rows in
  the exact same order, at both a modest scale (9,250 rows) and Purchase
  Register's real scale (92,000 rows).
- A wave that contains the true last page fires a bounded number of extra
  requests beyond it (up to `concurrency - 1`) that simply return empty
  results — harmless, and accounted for, not a bug.
- An error partway through is still surfaced correctly, with whatever rows
  were successfully fetched before it returned alongside it (same contract
  as before).
- At Purchase Register's real scale (92,000 rows, 93 real pages, 15ms
  simulated round-trip latency): sequential took 1,423ms wall time;
  parallel (concurrency 8) took 190ms — a 7.5x speedup in this simulation.
  Real-world Supabase latency will differ from the simulated figure, but
  the relative improvement from concurrency should be in the same range,
  since it comes purely from overlapping round trips that were previously
  forced to happen one after another.
- `tsc --noEmit`, `eslint` (0 errors), `next build` all clean, plus a local
  `next dev` smoke test confirming `/reports`, `/items`, and
  `/inventory/balance` all still respond correctly (307 redirects when
  unauthenticated, no 500s).

No database migration, no query changes, no UI changes — purely an
implementation-detail change to one shared utility function. This buys real
headroom while the bigger step (real server-side pagination for Reports,
covered in the "let's discuss pagination" conversation) gets designed and
built.

## Pagination roadmap, step 2: trim over-fetched columns (21 Sept 2026)

Audited every one of the five `fetchAllRows` call sites (Reports' five
queries, Items' two, Inventory Balance's two) against what its own table
component actually renders or reads, to find columns fetched but never
used. Being upfront about the result: most were already lean. RM Stock,
Purchase Register, Items, and Stock Position all select exactly what they
display — no waste found there.

Two real misses, both in Reports: the QC Register and FP Register queries
each selected `created_at`, but neither ever renders or reads it — `QcRow`'s
date column is `reviewed_at`, `FpRow`'s is `finish_date` (see
`report-tables.tsx`). Dropped `created_at` from both `.select()` calls and
from the corresponding TypeScript types.

The `.order("created_at", ...)` clause on both queries stays — ordering and
column projection are independent PostgREST query parameters, not coupled
to each other, so a query can sort by a column it doesn't return. This
isn't a new assumption for this codebase: the Inventory Balance page's own
items query already does exactly this today (orders by `created_at`
without selecting it) — live, working production code, not a claim to take
on faith.

Worth being honest about scale here: this is a small, genuinely safe trim
(one timestamp column, off queries that were otherwise already minimal),
not a major win like step 1. Real payload savings depend on how many QC
records and FP batches exist, but it's a legitimate zero-risk cut, not a
guess. `tsc --noEmit`, `eslint`, `next build` all clean, plus a local
`next dev` smoke test confirming `/reports` still responds correctly.
