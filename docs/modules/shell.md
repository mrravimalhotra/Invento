# App shell — cross-cutting layout, navigation, and loading behavior

Not a business module — this doc covers `app/(dashboard)/layout.tsx`,
`app/(auth)/layout.tsx`, `components/shell/*`, and other app-wide UI
infrastructure that doesn't belong to any one module's own `docs/modules/*.md`.

## Instant loading state on every navigation (21 Sept 2026)

Ravi: *"the app is very slow, help optimize it, where a click has been
registered but taking time to load there should be some mechanism to let
user know that click has been registered and next page is loading.
Implement this as per standard industry practice."*

**Root cause:** the app had zero `loading.tsx` files anywhere. In the App
Router, that file is what tells Next.js "wrap this route in a `<Suspense>`
boundary and show this fallback the instant navigation starts, then swap in
the real page once its data is ready." Without one, a click on any link
produces *no visual change at all* until the destination page's server-side
data fetching (queries, joins, counts — several of which involve real
Supabase round trips) finishes completely. That gap is exactly what Ravi
described: the click registers, but nothing on screen confirms it.

**Fix:**

- **`components/ui/page-loading.tsx`** (new) — a shared `<PageLoading />`
  component: a centered spinner (`lucide-react`'s `Loader2`, `animate-spin`)
  with a "Loading…" label. Its opacity fades in over 150ms after a 150ms
  delay (`@keyframes page-loading-fade-in`, `app/globals.css`) rather than
  appearing instantly — the same "don't flash a spinner the user barely has
  time to register" principle Next.js's own `useLinkStatus` docs recommend,
  so a fast, already-warm navigation doesn't get an unnecessary flicker.
- **`app/(dashboard)/loading.tsx`** (new) — renders `<PageLoading />`. Placed
  as a sibling to `app/(dashboard)/layout.tsx`, which means it wraps every
  page below it (list pages, detail pages, forms, the nested `inventory/
  (tabs)` layout — everything) in one Suspense boundary, but does **not**
  wrap `layout.tsx` itself. In practice: the Sidebar and Topbar stay
  mounted, visible, and clickable the whole time; only the main content area
  shows the spinner while the destination page loads. One file, every route
  covered.
- **`app/(auth)/loading.tsx`** (new) — same component, for the sign-in /
  register / forgot-password / reset-password screens.

This is the framework's own documented "instant loading state" mechanism
(`loading.js` file convention — unchanged in this app's Next.js 16.3.3 from
how it's worked since Next 13), not a custom-built spinner/router hack, and
requires no new dependency.

**Deliberately not done in this pass, flagged as possible follow-ups:**

- **Per-page skeletons.** One shared generic spinner covers every route in a
  single change; a skeleton that mirrors each destination's actual layout
  (e.g. table-row placeholders on list pages) is more polished but would
  mean a bespoke `loading.tsx` per route (~50 of them) — a much larger,
  separate pass, only worth it if the generic spinner doesn't feel like
  enough once it's live.
- **`useLinkStatus` per-link hints** (e.g. a small spinner on the specific
  button/row that was clicked, before the page-level fallback even paints).
  Next's own docs frame this as a complement to `loading.js` for routes that
  *don't* have one, or where prefetching is off/slow — since every route now
  has a `loading.js` (and Next prefetches that fallback by default), the
  marginal value on top of the fix above is small. Worth adding later only
  if a specific link/button still feels unresponsive in practice.
- **Why pages are slow in the first place** (as opposed to just making the
  wait visible) — see `docs/modules/performance.md`. A quick audit done
  alongside this fix found real causes (missing indexes on almost every
  foreign key, a couple of list pages fetching entire tables to the
  browser). The missing-indexes part shipped the same day (0056_
  performance_indexes.sql); the rest is written up there as flagged,
  not-yet-done follow-ups.

No database migration, no `lib/actions/*` changes — purely additive
app-shell files. Verified: `tsc`/`eslint`/`next build` all clean, plus a
local `next dev` smoke test (unauthenticated requests to `/login`, `/`, and
`/items` all responded correctly with no server errors) to confirm the new
files don't break the app from booting.

## India time everywhere (29 Sept 2026 — ACC-13)

The server and the database ran on UTC, so between 00:00 and 05:30 IST the
app still treated it as yesterday: retest dates came out a day early,
"today" defaults and "due for retest" checks used yesterday, AR/PO/batch
numbers carried the previous day (and on 1 January the previous year), and
date filters ended 5½ hours early.

- **App:** `lib/utils.ts` has `todayIst()`, `toIstDateString()`,
  `istDayStart()` / `istDayEnd()` and IST-aware `formatDate()` /
  `formatDateTime()`. Every "today" default, date filter (audit trail,
  stock ledger, RM report, reports) and export file name uses them.
- **Database (0081):** the database time zone is `Asia/Kolkata`, so
  `current_date`, `now()::date` and generated numbers follow IST. The QC
  retest date is computed from the IST day of approval explicitly.
- Stored timestamps are unchanged (absolute moments); only the day they are
  counted in changed. New connections pick it up; the API recycles its
  connections within about 30 minutes.
- Not in this change: date parsing in bulk upload (ACC-23, group 8).
