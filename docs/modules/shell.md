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

## Dashboard agrees with its lists (29 Sept 2026, ACC-26)

The Dashboard (`app/(dashboard)/page.tsx`, drawn by `dashboard-view.tsx`)
now counts the same rows as the list each card opens, and follows the
"Hide legacy data" switch.

- **Cards.** Raw materials = active raw materials; Vendors = active
  vendors; MFR definitions = every MFR (the MFR list shows inactive ones
  too); Finished batches = active batches; POs (30d) = active purchase
  orders in the last 30 days; Pending QC = submitted + awaiting review.
- **Purchase value chart** includes GST (quantity x unit price x (1 + GST%),
  the rule the Purchase list uses) and counts only submitted, undeleted
  lines. Draft orders are not purchases yet.
- **Charts** cover the last 30 India-time calendar days in date order; a day
  with no activity shows 0 instead of being skipped.
- **Hide legacy data.** The switch lives in the browser, so the server sends
  each count twice (all / not legacy) and each chart row with a legacy flag,
  and the page picks. Legacy = a `LEG-` code, the same test as the lists. QC
  counts come from `dashboard_qc_counts()` (migration 0084) because a QC
  record's legacy status depends on four tables. The Movement chart tests
  the item and the raw-material batch a ledger event moved (not the finished
  product batch). **Reports are not affected** — they stay complete registers.

## One company identity on every printed output (29 Sept 2026, export group decision b)

**Changed 4 Oct 2026 (FB-0046 / B32, migration 0102).** The name, address and licence are now
saved settings, not fixed text. The default licence is **"PD/AYU/111"** (slash form; it replaces the
29 Sept "PD/AYU-111"). The System Administrator edits them at **Admin -> Company Details**
(`/company`, table `company_settings`, one row; everyone can read, `set_company_settings()` is
System Administrator only and is in the Audit Log). Fields: company name, address, licence label
(default "Mfg. Lic. No.") and licence number.

How outputs read them: `lib/company.ts` holds a small runtime store (`getCompany()`, plus
`licenceLine()`, `addressAndLicenceLine()`, `companyNameAndAddress()`). The dashboard layout reads the
saved row and `CompanySetter` hands it to the store, so generators that run on a button click (slips,
Word, labels, register PDFs, Excel "About" sheet) read the current values. Server pages (the MFR print
preview, Company Details) call `fetchCompany()` (`lib/company-server.ts`). A change applies to the next
document; files already downloaded are not changed.

Layout: **logo on top, the company name directly below it, then address and licence number, centred**
(`drawCompanyHeading()` in `lib/pdf-company-heading.ts` for register PDFs and both intimation slips; same
stack in the COA, the MFR and BMR Word documents and the MFR print preview). Labels keep their own fixed
label layout and read the same values.

Earlier text of this section (29 Sept 2026):

- **Register PDFs** (Reports x4, RM Report, Packing Register, MFR report):
  `lib/pdf.ts` letterhead now carries the logo. Every page has a footer with
  "Generated dd-mm-yyyy hh:mm by <name>" and "Page X of Y" (`addPageFooters`;
  the name comes from `lib/pdf-user.ts`, set by `PdfUserSetter` in the
  dashboard layout). Reports PDFs also print the date filter used and the row
  count under the title.
- **Slips (RM, FP, production RM), BMR and MFR Word documents, COA:** the
  three spellings of the name and three of the licence number are replaced
  by the shared values. The slips keep the address after the name
  ("Atharva Nature Healthcare Pvt. Ltd., Wagholi, Pune"); the MFR document and
  COA no longer print the name in capitals.
- **Not changed:** layouts, the COA's own logo file, the e-mail/web line on the
  MFR document, and the label sheets (which already used the shared values).

## Excel / PDF export from lists (29 Sept 2026, export decision (c))

A list's table can offer **Excel** and/or **PDF** buttons in its toolbar by
passing `exportConfig` to `DataTable` (`lib/table-export.ts`). The export holds
every row that matches the search box and "Hide legacy data" — not only the
page on screen — with raw numbers (so Excel can total them) and real Excel
dates. An Excel file has the data on the first sheet (header row, frozen,
filterable) and an "About this export" sheet (company, list, generated on/by,
row count, filter used). PDFs use the shared letterhead.

| Screen | Export |
|---|---|
| Item Master, Vendor Master, Instrument / Equipment Master, Dead Stock Register, Purchase (orders list), Inventory Ledger, Stock Position, Audit Log | Excel |
| RM Report | Excel (added beside the existing Export PDF, unchanged) |
| Quality Control list, Finished Product list | Excel and PDF |
| MFR list, Certificate of Analysis list | PDF |
| Reports page (four registers) | Excel added beside Download PDF; the PDFs are unchanged |
| Packaging | unchanged (already has PDF) |

No action, by decision: SOP / STP Documents, Item Type Master, Tester
Feedback, User Roles, and everything marked Deprecated.

Notes: the Audit Log export is available only to those who can open the Audit
Log (System Admin and Super Auditor). The Ledger export holds the events loaded
on the page (the most recent 1,000 unless the date / item / reason filters narrow
it); the "About this export" sheet says so when the cap is hit. The Excel
library loads only when a button is clicked.

## Every operation gives a message (30 Sept 2026)

Every save, delete, upload, approval and other action ends with a notice at the top of the screen (`components/ui/flash-host.tsx`, mounted once in the dashboard layout). Success notices fade after 8 seconds; failure notices stay until closed. They sit at the top of the window, so they are seen however far the page is scrolled.

- Actions that stay on the same form (`{ success }` / `{ error }`): the form uses `useFlashActionState` (`lib/use-flash-action.ts`) instead of `useActionState`. The notice appears the moment the server replies.
- Actions that move to another page (create, delete, decisions): redirect to `?saved=<key>`; the wording lives in `lib/saved-messages.ts`. The notice shows once and the address is tidied.
- Adding a new action: use `useFlashActionState` in its form, or add a key to `SAVED_MESSAGES` and redirect with it. Not covered on purpose: sign-in / sign-out and the deprecated BMR screens.

## Phone-friendly menu (30 Sept 2026)
Under 768 px the fixed sidebar is hidden, so the top bar now carries a ☰ button (`components/shell/mobile-nav.tsx`)
that slides the same menu in over the page. Tapping a link, the dark backdrop, the ✕ button or Esc closes it.
- The menu list lives in one place, `components/shell/nav-list.tsx`, used by both the desktop `Sidebar` and `MobileNav`.
- Top bar on phones: ☰, logo, "N low" stock pill, Profile, sign-out. The name/role block shows from 640 px up.
- 768 px and wider: nothing changes. The "Awaiting access" screen has no menu button (`Topbar showMenu={false}`).
- `app/layout.tsx` exports an explicit `viewport` (device-width, scale 1); the page padding is 16 px on phones, 24 px from 768 px.
- Navigation only: no data, action or database change.

## Install on the home screen (30 Sept 2026)
`app/manifest.ts` (served at `/manifest.webmanifest`) plus icons in `public/` (`icon-192.png`, `icon-512.png`,
`icon-maskable-512.png`, `apple-touch-icon.png`) let a phone or desktop browser offer "Install app" / "Add to Home screen".
The app then opens in its own window without the browser bar. Theme colour is the brand green (#1f6f4e).
- **Not offline**: there is no service worker; every page still comes from the server. Deliberate — a stock system must never show stale quantities.
- The icons are the Atharva wordmark centred on white (generated from `public/atharva-logo.svg`). To use a proper square icon, replace those four PNGs with the same names and sizes (192, 512, 512 maskable with ~20% margin, 180).
- `proxy.ts` matcher skips `manifest.webmanifest` so the browser can read it before sign-in.

## Browser-tab titles (30 Sept 2026)
Each screen has its own tab title ("Purchase · Invento"): the root layout sets the `" · Invento"` template and every module folder has a tiny `layout.tsx` that sets its `metadata.title` (Dashboard sets it in `page.tsx`). Sign-in pages keep the default title. The three deprecated screens (Batch Mfg. Record, Line Clearance, Environmental Control) were deliberately left alone.

## Forms keep what you typed when a save fails (FB-0045, 1 Oct 2026)
React 19 clears a `<form action={…}>` after every attempt, which wiped every field when a save was refused ("Item type is required"). `lib/use-flash-action.ts` (used by 44 forms) now cancels that one clearing when the action returns an error: it remembers which form was submitted and cancels its `reset` event. On a success the form clears as before. The mark expires after 5 seconds and is cleared by the next submit, so it cannot affect another form or a later success. Sign-in, forgot/reset/change password (plain `useActionState`) still clear on purpose.
Check: leave a required field empty on any form, save, and see the refusal message with everything else still filled in; fix the field, save, and the form clears (or redirects) as usual.


## Date entry rules (3 Oct 2026, FB-0055 widened)

Ravi asked for date entry to be blocked by function ("Date validation review", project doc `claude/date-validation-review.md`). App-level only: the date box limits the choice and the server action repeats the rule on save; no database check. Helpers are in `lib/date-rules.ts` (India date, plain text comparison of `YYYY-MM-DD`). New saves only; existing records are not changed.

| Screen | Field | Rule |
|---|---|---|
| New purchase order, Bulk upload | Invoice date | Not later than today |
| New finished product batch | Batch start date | Not later than today; not before the MFR approval date |
| Complete batch | Finish date | Not before the start date; not later than today |
| Complete batch | Expiry date | After the finish date |
| New packaging issue | Issue date | Not later than today; not before the QC approval date of the batch |
| QC Reviewer decision, Start retest | Retest period | Raw material: at most 180 days; at most 3 retests per batch (`lib/constants/qc-rules.ts`) |
| New COA | Analysis, Reporting, Mfg. date, Best before | Read-only on the form (they come from the QC record and batch) |
| Equipment, Bulk upload | Last calibration date; Next calibration due | Last: not later than today. Next: after Last (a past due date is allowed, it means overdue) |
| Dead stock, Bulk upload | Date of purchase; Resolution date | Neither later than today; resolution not before purchase |
| Audit Log, Inventory Ledger, Reports | From, To | From not after To; To not later than today |
| RM Report | As on date | Not later than today |

Left as before: SOP/STP effective date (a future date is allowed) and every system-set time stamp. Not built: the raw-material expiry date on Purchase (B42, waiting for a decision).

## Dashboard alerts and sign-in links (11 Oct 2026)

- Expiry / retest alerts for raw material now also list items that are **already overdue** (red, "expired / retest was due N days ago"); the "more" link opens Expiry and Retest Ageing on the matching bucket.
- Password reset links open `/auth/confirm` first; an old or used link shows "This reset link can't be used" with a link to request a new one. Supabase dashboard settings are in `docs/SUPABASE_SETUP.md`.
- Feedback: the first resolved time is kept; load errors are shown; the admin list has search and a Page filter.
