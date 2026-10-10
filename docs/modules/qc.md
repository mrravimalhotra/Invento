# Module 6 — Quality Control (QC)

DESIGN.md cross-reference: §4.5 (schema), §7.1 (sampling deduction),
§7.2 (QC-gates-consumption).

## Why this module matters

This module, together with `trg_fp_component_qc_gate` (and its twin on
`bmr_weighment_lines`) in `supabase/migrations/0001_init.sql`, closes
spec.md's headline rule: **no material moves without quality clearance.**

- This module is where the Assign Record (AR) number and the
  Approved/Rejected decision actually get *written* — `quality_checks.status`
  is the single source of truth the rest of the system reads.
- The gate itself lives in the database, on a different table
  (`finished_product_components`, owned by the Finished Product module):
  `check_batch_qc_approved()` raises an exception on any insert that
  references a `purchase_line_id` whose `purchase_batch_status.qc_status`
  is not `'approved'`. It is not possible for any screen, in any module, to
  insert a consumption row against an unapproved batch — this is a database
  constraint, not a UI convention.

Together: this module produces the clearance, the trigger enforces it. Two
different tables, one rule, structurally impossible to bypass from the app
layer.

## Screens

### List — `/qc`
- `DataTable` of every `quality_checks` row, newest first.
- Columns: AR number (links to `/qc/[id]`), status (`Badge`, uses the
  existing approved/submitted/rejected color mapping), item, batch, sample
  qty + unit, retest date.
- Batch column resolves from `purchase_lines.batch_number` for RM batches or
  `finished_product_batches.batch_number` for FP batches (the table supports
  both subjects via `quality_checks.qc_one_subject`, see DESIGN.md §4.5) —
  only the RM ("maker") assign flow is built in this module; FP QC
  submission, if any, is the Finished Product module's concern and will show
  up here read-only once that module writes to this same table.
- "New AR" button gated by `canWrite(user.roles, "qc_assign")`.

### Assign ("maker" step) — `/qc/new`
- Role: `qc_assign` (`system_admin`, `inventory_manager`, `quality_checker`,
  `qc_reviewer` — see Role note below).
- Fetches every `purchase_lines` row whose `purchase_batch_status.qc_status
  = 'not_submitted'`, joined to `items` for display, so the Item dropdown
  only ever offers items that actually have an open batch.
- Item → Batch is a cascading pair of dropdowns (client-side filter over the
  same fetched list — no re-fetch per selection).
- Selecting a batch pre-fills Sample Quantity (from that purchase line's
  `qc_qty`), Sample Unit, and Expiry Date (from the purchase line) — all
  three remain editable.
- AR number: assigned server-side via `get_next_ar_number()` inside the
  Server Action, never generated client-side.
- On submit: inserts `purchase_line_id` + `item_id` (item_id is re-derived
  server-side from the chosen batch, not trusted from a hidden field),
  `finished_product_batch_id` left `null`, `status` defaults `'submitted'`.
  Saving does not move stock (ACC-38, 29 Sept 2026): the QC sample is set
  aside when the purchase order is submitted (0028 retired
  `trg_qc_sample_pull`), and the page text now says so. This action never
  touches `inventory_ledger`.
- Guards against double-submission: re-checks `purchase_batch_status` at
  submit time and rejects if the batch is no longer `not_submitted`.

### Review — `/qc/[id]` (two-round, see "Two-round QC review" below)
- Round 1 role: `qc_review_round1` (`system_admin`, `quality_checker`).
  Round 2 role: `qc_review_round2` (`system_admin`, `qc_reviewer`).
- Shows the assign record read-only (AR number, item, batch, sample qty,
  expiry) always.
- While `status = 'submitted'`: shows the Round 1 (QC Checker) form —
  Approved/Rejected toggle buttons and comments (textarea). No retest
  period here — see below.
- On Round 1 approve, `status` moves to `checker_approved` ("Approved -
  Awaiting Review" — `qcRecordStatusLabel()`, `lib/batch-qc-status.ts`) and
  the Round 1 decision (who, when, comments) renders read-only above the
  Round 2 form. Round 1's decision is shown read-only for every later
  state (`checker_approved`, `approved`, `rejected`) — it's never re-hidden.
- While `status = 'checker_approved'`: shows the Round 2 (QC Reviewer) form
  — Approved/Rejected toggle buttons, review comments (textarea), and
  **Retest Period (days)**, a plain numeric input, required on approve.
  - This field is *deliberately* manual, not auto-computed from a fixed
    interval — DESIGN.md's Open Question 1: retest interval genuinely
    varies by material and by what the test found, and the physical
    Approved-label's Retest Period field is filled in by hand for the same
    reason. The form carries a one-line hint saying so, next to the field.
  - `retest_date` is a DB-generated column
    (`reviewed_at::date + retest_period_days`) — the UI never sets it
    directly; it appears automatically once the record is saved and
    re-rendered.
- Once `status` is `approved` or `rejected`, the record is final: the page
  renders both rounds' decisions read-only (Round 1: decided by/at,
  comments; Round 2: decision, decided by/at, retest period + date,
  comments) and neither form is shown — there is no re-edit path at either
  round, matching the existing baseline behavior, kept as-is per the
  module brief.
- Both Server Actions (`reviewQcRound1`, `reviewQcRound2`) re-check the
  row is still in the expected state (`submitted` / `checker_approved`)
  before writing, so this is enforced server-side too, not just by hiding
  the form — and the DB trigger (`trg_fn_qc_enforce_review_stages`,
  `0054_qc_two_round_review.sql`) is the real backstop underneath both.

## Role note (flag for reconciliation)

The module brief asked me to check whether `qc_assign` exists as a key in
`lib/constants/roles.ts` → `MODULE_WRITE_ROLES`, since it wasn't expected to
be there. **It already exists**:

```
qc_assign: ["system_admin", "inventory_manager", "quality_checker", "qc_reviewer"],
```

Matches the role set specified in this module's brief exactly, so no
inline-array workaround was needed. Only noting this so whoever reconciles
the roles file knows the key was already present (added by another agent
before this module was built) and doesn't need to be re-added.

The single shared `qc_review` key this section originally documented was
retired 20 Sept 2026 — see "Two-round QC review" below for its two
replacements, `qc_review_round1` and `qc_review_round2`.

## Integrity fixes (1 Sept 2026)

From a full-app audit (`claude/known-issues.md`):

- **Duplicate-submission race backstop.** `createQualityCheck()` checked
  `purchase_batch_status` and only inserted if still `not_submitted` — two
  concurrent submissions against the same batch could both pass that check.
  `0015_qc_duplicate_backstop.sql` adds `unique (purchase_line_id)` on
  `quality_checks` (NULLs — i.e. finished-product-side rows — are
  unaffected); the action now translates the resulting `23505` into "This
  batch already has a QC record submitted against it" instead of a raw
  Postgres error.
- **Unbounded list query.** `/qc` fetched every `quality_checks` row with
  no limit, unlike the Inventory Ledger tab. Now capped at 1,000 (`QC_LIMIT`
  in `page.tsx`), same pattern as `LEDGER_LIMIT`.

## Files

- `lib/actions/qc.ts` — `createQualityCheck`, `reviewQcRound1`,
  `reviewQcRound2` (the old single-decision `reviewQualityCheck` was
  retired 20 Sept 2026 — see "Two-round QC review" below).
- `app/(dashboard)/qc/page.tsx` — list.
- `app/(dashboard)/qc/new/page.tsx` + `qc-assign-form.tsx` — assign step.
- `app/(dashboard)/qc/[id]/page.tsx` + `qc-checker-form.tsx` (Round 1) +
  `qc-reviewer-form.tsx` (Round 2) — review steps / read-only view.

## Searchable, legacy-aware item/batch pickers (1 Sept 2026)

`qc-assign-form.tsx`'s Item and Batch selects are searchable comboboxes
app-wide now (DESIGN.md §8); both mark `data-legacy` (item from
`items.item_code`, batch from `purchase_lines.batch_number`), so "Hide
legacy data" hides legacy raw materials/batches from these two dropdowns —
both already selected the codes needed, no query changes.

## "Hide legacy data" now applies to the QC list itself (2 Sept 2026)

Reported by Ravi from a screenshot of `/qc` with clearly legacy-sourced
rows (`LEG-RM-...` items, `LEG-PR-...` batches) still showing after
toggling "Hide legacy data" on. The list page had never wired the toggle
in at all — every other table in the app derives `isLegacy` from the
row's own code (`isLegacyCode(item_code)`/`isLegacyCode(batch_number)`),
but `quality_checks.ar_number` is always freshly generated
(`get_next_ar_number()` never produces a `LEG-` prefix — confirmed in
`claude/data-gap-analysis.md`, no legacy QC data was ever migrated), so
there was no per-row code to key the existing convention off, and the
toggle was silently skipped for this table (`docs/modules/purchase.md`'s
Medium-severity fix explicitly called this a deliberate omission at the
time — correct given only the AR number itself was considered, but it
missed that the *referenced* batch/item can still be legacy). Fixed:
`QcTable` now derives `isLegacy` from whichever of `items.item_code`,
`purchase_lines.batch_number`, or `finished_product_batches.batch_number`
the row has — a QC record counts as legacy if what it was raised against
does, regardless of its own (always-current) AR number. No query changes
needed — all three fields were already selected by `qc/page.tsx`.

## FB-0021: sample qty/unit auto-populated from item defaults (2 Sept 2026)

"in QC, sample quantity and Sample unit should be auto populated from
defaulsgive [defaults given] at the time of raw material creation." The
picker already pre-filled Sample quantity from the purchase line's own
`qc_qty` on batch pick (that's still the authoritative recorded amount for
this specific batch — already converted at purchase time into the line's
`unit`, FB-0017) but Sample unit was always set to that same (often
larger, e.g. `kg`) line unit, losing the item's own smaller
`default_sample_unit` context entirely. `handleBatchChange()` in
`qc-assign-form.tsx` now re-expresses the sample quantity in the item's
`default_sample_unit` when it's compatible with the line's unit (same
`compatibleUnits()`/"validDefault" convention as Purchase's Add-line
form), converting via `convertUnit()` — falls back to the line's own unit,
unconverted, when the item has no default or it isn't compatible.
`qc/new/page.tsx`'s query widened to select `items(..., default_sample_unit)`
alongside the existing item fields.

## FB-0018 (Purchase): batch picker filtered to submitted purchase orders

`qc/new/page.tsx`'s pending-batches query now also requires
`purchase_orders.status = 'submitted'` — a batch on a still-draft PO was
never pushed to `inventory_ledger` in the first place (FB-0018,
`docs/modules/purchase.md`), so offering it here would let a QC sample be
"pulled" from stock that never existed.

## Batch picker filtered to raw material only (2 Sept 2026)

Purchase gained a Packaging Item purchase path this pass, deliberately
without QC/Stability/R&D capture (`docs/modules/purchase.md`, "Packaging
items are now purchasable"). Without a filter here, every packaging
purchase line would have shown up as "awaiting QC" forever, since nothing
ever creates a `quality_checks` row for one. `qc/new/page.tsx`'s query now
embeds `items!inner(..., category)` and adds `.eq("items.category",
"raw")`, so only raw-material batches are ever offered for QC assignment —
this was always the implicit intent (QC has never applied to packaging),
just never enforced because packaging had no purchase path to test it
against before now.

## Retest workflow (2 Sept 2026, Eighth pass Part B)

"Once Re-Test date has come, Item should go through QC again using the
stability sample already available." Full scoping writeup (including the
mid-build discovery of which "retest" field this keys off) is in
`claude/known-issues.md`, Eighth pass. Summary of what's here:

- **Trigger**: `quality_checks.retest_date` — the pre-existing
  QC-computed column (`trg_fn_qc_compute_retest_date`, `reviewed_at +
  retest_period_days`), not `purchase_lines.expiry_date`. Confirmed with
  Ravi before building, since the app already had this second, separate
  mechanism and building against the wrong one would have meant two
  competing "retest" concepts.
- **`0025_qc_retest_workflow.sql`**: replaces
  `quality_checks_purchase_line_unique` (full unique constraint — at most
  one QC record ever per batch) with a partial unique index scoped to
  `status = 'submitted'`, so the check-then-insert race backstop from
  `0015_qc_duplicate_backstop.sql` still holds while a dated history of
  reviewed QC records (original + retests) can now accumulate per
  `purchase_line_id`. Also adds `is_retest boolean not null default
  false`. No changes needed to `purchase_batch_status` (its lateral join
  already returns the latest row per line) or `trg_fn_qc_sample_pull`
  (already logs a `pull` ledger event for any insert with `sample_qty` >
  0, RM or retest alike).
- **`startRetestQualityCheck(purchaseLineId)`** (`lib/actions/qc.ts`) —
  one-click action, no form. Re-derives everything server-side: confirms
  the latest QC record for the line is `approved` with `retest_date <=`
  today, pulls `sample_qty = purchase_lines.stability_qty` (the sample
  already reserved at Purchase time — this is what "reusing the
  already-reserved stability sample rather than a fresh pull" means; the
  reserved quantity is not decremented per retest, same as the original
  `qc_qty` reserve is never decremented by the initial assign), sets
  `is_retest = true`, and gets a new AR number the normal way. (Originally
  also carried forward the previous record's `expiry_date` — removed 3
  Sept 2026, see "Expiry date manual entry removed" below.)
- **`/qc` "Due for retest" card** — sits above the AR table, populated by
  a two-step query mirroring `qc/new/page.tsx`'s pattern:
  `purchase_batch_status` for `qc_status = 'approved'` and `retest_date <=
  today`, then `purchase_lines` filtered to `items.category = 'raw'` and
  `stability_qty > 0`. Each row shows item/batch/available stability
  quantity and a "Start Retest" button, gated on `qc_assign` — satisfies
  decision (1) from the original scoping (both a passive indicator and an
  active one-click action, same place).
- **`is_retest` indicator** — a small "Retest" badge next to the AR
  number on the list page and next to the status badge on the detail
  page, so a retest AR is visually distinguishable from an original
  assign without having to infer it from timing.
- **Live-verified end-to-end 3 Sept 2026**: full writeup, including a real
  finding about `retest_date` and its recompute trigger, in
  `claude/known-issues.md`, Eighth pass Part B.

## "Awaiting QC" card (3 Sept 2026)

Ravi: "when new purchase is done, there should be a functionality in QC
page that new batches awaiting QC should prominently show there and
prompt user to do QC." Before this, a batch that had just been received
(PO Final Submitted) sat invisible until someone thought to open `/qc/new`
and search for it in that form's own item/batch pickers — nothing
surfaced it proactively. This is a different gap from the Dashboard's
"Pending QC" stat card, which counts `quality_checks` rows already
`submitted` (i.e. an AR that exists but hasn't been reviewed yet) — a
batch that has no AR at all yet was never counted there either.

- **`/qc` "Awaiting QC" card** — sits above the "Due for retest" card
  (new batches needing their first QC take priority over already-approved
  batches becoming due for a repeat one), same green/`brand`-tinted
  styling as the rest of the app's "next step, not a warning" affordances
  (as opposed to "Due for retest"'s amber, which is a genuine
  attention/overdue signal). Populated by the exact same "open for QC"
  query `qc/new/page.tsx` already used to build its own Item/Batch
  pickers — `purchase_batch_status.qc_status = 'not_submitted'`, then
  `purchase_lines` filtered to `active`, `purchase_orders.status =
  'submitted'` (a draft PO's lines were never pushed to inventory,
  FB-0018), and `items.category = 'raw'` (packaging has never gone
  through QC in this app) — so "awaiting QC" here means exactly what
  `/qc/new`'s own pickers would have shown, just surfaced proactively
  instead of requiring a visit there first. Capped at 8 rows shown, with
  a "+N more — open New AR" link beyond that (same cap convention as the
  Dashboard's Low stock/Retest due soon cards).
- Each row is a **"Start QC" link**, not a one-click action like "Start
  Retest" — assigning QC still needs real input (sample qty/unit), so it
  can't be a single button press. The link goes to
  `/qc/new?line=<purchase_line_id>`, and `QcAssignForm` now accepts an
  optional `initialLineId` prop that pre-selects the item and batch (and
  derives sample qty/unit the same way picking it by hand would, via a
  `computeBatchDisplay()` helper shared with `handleBatchChange` so the
  two paths can never compute different values for the same batch). This
  only saves the "search for it in the picker" step — `createQualityCheck()`
  still validates the batch server-side regardless of how it was selected,
  so a stale or hand-edited `?line=` value just leaves the form
  unselected rather than being trusted. (Sample qty/unit only —
  `computeBatchDisplay()` no longer touches expiry, see "Expiry date
  manual entry removed" below.)

## Files (Awaiting QC)

- `app/(dashboard)/qc/awaiting-qc.tsx` — the card's row list
- `app/(dashboard)/qc/page.tsx` — `getAwaitingQcLines()` query
- `app/(dashboard)/qc/new/page.tsx` — reads `?line=` from `searchParams`
- `app/(dashboard)/qc/new/qc-assign-form.tsx` — `initialLineId` prop,
  `computeBatchDisplay()` helper

## "Awaiting QC" / "Due for retest" now respect "Hide legacy data" (3 Sept 2026)

Reported live: a legacy-sourced batch still showed in the "Awaiting QC"
card with "Hide legacy data" on. Root cause: unlike `qc-table.tsx` (the
"Hide legacy data now applies to the QC list itself" fix above), both
`awaiting-qc.tsx` and `due-for-retest.tsx` (Eighth/Tenth pass) were built
without ever reading the shared `useHideLegacy()` preference — they had
no `isLegacy` concept at all.

Fixed the same silent way the legacy-aware `<Select>` comboboxes handle
it (`components/ui/combobox.tsx`): both cards now call `useHideLegacy()`
directly and filter client-side (a batch counts as legacy if its item
code or its own batch number is `LEG-`-prefixed — same OR rule
`qc-table.tsx`'s `isLegacyQcRow` uses), with no card-local checkbox of
their own — the Dashboard toggle is still the one place the preference is
set. The `Card` wrapper for each moved from `qc/page.tsx` into the
component itself, so the whole card can now render `null` and disappear
once filtering leaves nothing to show — gating on `qc/page.tsx`'s
server-computed (unfiltered) row count, as the previous structure did,
could otherwise leave an empty card on screen when every awaiting/due
batch happened to be legacy.

## Expiry date manual entry removed (3 Sept 2026)

Direct request from Ravi: "As now we are using retest period at while
doing QC — Lets remove Expiry Date from QC screen and Related re-test
date from Purchase screen. Retest Date should be calculated by adding
retest period (days) into today's date as already being done in app.
Should not be manually selected." See `docs/modules/purchase.md`'s
matching entry for the Purchase-screen half.

The "Expiry date" field on the New Assign Record form
(`quality_checks.expiry_date`, pre-filled from the purchase line but
independently editable, required at AR-creation time) is retired
entirely — it was never what actually drives the retest workflow above;
`quality_checks.retest_date`, computed automatically by
`trg_qc_compute_retest_date` from Retest period (days) + the review date
at approval time, already does that. Removing the redundant manual field
doesn't change how retesting works at all, it just stops asking for a
date nothing downstream needed.

- **`qc-assign-form.tsx`**: the "Expiry date" `<Field>`/`<Input>` and its
  `expiryDate` state are gone; the form's footer note now says retest
  date is set automatically at review time instead.
- **`lib/actions/qc.ts`**: `createQualityCheck()` no longer reads,
  requires, or inserts `expiry_date` (the "Expiry date is required."
  error is gone — the column is already nullable, so new rows just leave
  it `null`). `startRetestQualityCheck()` no longer selects or carries
  forward the previous record's `expiry_date` either, since there's
  nothing meaningful left to carry forward.
- **`qc/new/page.tsx`**: `expiry_date` dropped from the pending-lines
  query and the `PendingLine` type — it was only ever fetched to feed the
  now-removed field.
- **No migration, no display removed elsewhere**: `quality_checks.
  expiry_date` stays in the schema and existing AR records keep whatever
  value they already have; the read-only "Expiry date" field on the
  QC detail page (`/qc/[id]`) is untouched and still shows it — it'll
  just read "—" for every AR created after this change, the same
  graceful-with-null pattern used for `purchase_lines.expiry_date`'s
  downstream displays (see `docs/modules/purchase.md`).

Verification: `npx tsc --noEmit`, `npx eslint`, and `npx next build` (all
42 routes) all clean.

## Approving a Finished Product batch now has ledger/status side effects (Inventory Ledger redesign, Phase 3 — 3 Sept 2026)

`reviewQualityCheck()` itself is unchanged, but for an AR record whose
`finished_product_batch_id` is set, setting its status to
`approved`/`rejected` now fires a new DB trigger
(`trg_qc_review_finished_product`, `0030_finished_product_ledger.sql`):
it syncs `finished_product_batches.status` to match (closing a
previously-flagged read-time-only gap — see `docs/modules/finished-
product.md`), and on approval also pushes the batch's `batch_yield` and
pulls its three sample quantities onto `inventory_ledger`, the same way
`0002_transactions.sql`'s existing triggers already do for RM QC records.
This is DB-level, `SECURITY DEFINER` — a `quality_checker`/`qc_reviewer`
approving a batch does not need any Finished Product write role for it
to take effect. Full writeup in `docs/modules/inventory.md`'s Phase 3
section.

## Maker/checker segregation of duties (17 Sept 2026) — superseded 20 Sept 2026

**Superseded** by "Two-round QC review" below: the single Assign/Review
maker≠checker rule described in this section was retired and replaced
with two independent, explicitly-named review rounds. Kept here as
historical record of the earlier design and the reasoning behind it, since
some of it (identity capture, the trigger-as-real-backstop posture)
carried forward unchanged into the new design. Do not implement against
this section — see below for what's actually live.

Ravi: "Every QC (Raw material or Finished Product) done should go through
maker/checker check — that means should be approved by two people. The Id
of both should be captured from the app and the login credentials they
have used." Design presented and confirmed via `AskUserQuestion` before
building: one maker + one independent checker (the existing Assign/Review
two-step, not a second checker), System Admin exempt from the maker ≠
checker rule, no re-authentication ("e-signature") step — the existing
logged-in session is enough.

**What was actually missing.** The Assign ("maker") / Review ("checker")
two-step already existed, and `quality_checks.created_by` already existed
in the schema since `0001_init.sql` — but nothing ever wrote to it (RM
assign, FP submit-to-QC, and retest all skipped it), and nothing stopped
the same person from being both the AR's maker and its checker, since
`qc_assign`/`qc_review` deliberately share role members
(`quality_checker`, `qc_reviewer`, `system_admin`). A single Quality
Checker could submit their own sample and then approve their own result.

**What changed:**

- **`created_by` is now actually written** — `createQualityCheck()`
  (`lib/actions/qc.ts`), `submitFinishedProductToQc()`
  (`lib/actions/finished-product.ts`), and `startRetestQualityCheck()`
  (`lib/actions/qc.ts`) all now stamp `created_by: user.id` on insert,
  taken from the verified server-side session, never a form field.
- **`0049_qc_maker_checker.sql`** adds `trg_qc_enforce_maker_checker`, a
  `before update` trigger on `quality_checks`: when a review decision is
  being recorded (`status` moving to `approved`/`rejected`) and the acting
  user (`auth.uid()`) is the same as the AR's `created_by`, the update is
  rejected — unless the acting user holds `system_admin`. This is the real
  backstop, structurally impossible to bypass from the app layer, same
  posture as this module's existing QC-gates-consumption trigger. A record
  with no `created_by` on file (every AR created before this shipped) has
  nothing to compare against and is let through unchanged — no retroactive
  identity was invented for existing data.
- **`reviewQualityCheck()`** re-checks the same condition first and
  returns a clean message ("You assigned this AR — a different Quality
  Checker/Reviewer must review it.") instead of surfacing the trigger's
  raw Postgres error.
- **`/qc/[id]`** now shows "Assigned by (maker)" on the Assign record card
  and "Reviewed by (checker)" on the Review decision card, resolved via
  `profiles.full_name` (two separate lookups, not an embedded join, since
  `quality_checks` has two different foreign keys into `auth.users` — same
  pattern MFR's `approved_by` → `profiles.full_name` lookup already uses).
  If the signed-in user is the AR's own maker, the review form is replaced
  with an explanatory note instead of just being hidden.

**Verification.** Full local Postgres replay of all 49 migrations, then
four scenarios exercised directly against `trg_qc_enforce_maker_checker`
via `SET request.jwt.claim.sub`: maker reviewing their own AR (correctly
rejected), a different checker reviewing it (correctly allowed), a
System Admin who is also the maker reviewing their own AR (correctly
allowed — the exemption), and a legacy row with `created_by` left `null`
reviewed by anyone (correctly allowed — nothing to compare). `npx tsc
--noEmit`, `npx eslint`, and `npx next build` all clean.

**Operational note, not something code can enforce**: this control is
only meaningful if each Quality Checker/Reviewer signs in with their own
account — a shared login would defeat the identity capture above no
matter what the database says.

## Two-round QC review (20 Sept 2026)

Ravi: "In QC, the first round of approval will be given by Quality
Checker, He will put his comments and will hit on approve or reject
button. If rejected, Raw Material Batch will be Rejected. If approved, it
will show as approved - Awaiting Review and will be moved from QC
Checker's queue to QC Reviewer's queue. It will go through same cycle and
One QC Reviewer approves it, the batch will be shown as Fully QC approved
and will be added to Inventory." Follow-up clarification, after an
`AskUserQuestion` round about assignee/self-review rules: "there is no
need for the assignee role, 2 roles suffice Reviewer 1- Maker or QC
Checker (dont call it maker), Reviewer 2- Checker or QC Reviewer(dont call
it checker)" — i.e. retire the maker/checker (assigner ≠ reviewer) rule
above entirely; replace it with exactly two named review stages, and the
only distinctness rule left is Round 1 actor ≠ Round 2 actor. Confirmed to
proceed ("go ahead") on two defaults: applies to both RM and FP QC, and
Retest ARs go through the same two-round cycle (they already start at
`status = 'submitted'`, so this needed no extra code — see Retest workflow
above).

**What changed:**

- **`quality_checks.status`** now has four values: `submitted` →
  `checker_approved` → `approved`/`rejected` (Round 1 can also go straight
  to `rejected`, which is terminal — see below). The old two-value
  approved/rejected terminal set is now reached only after Round 2.
- **Round 1 columns** — `checker_by`, `checker_at`, `checker_comments` —
  added alongside the pre-existing `reviewed_by`/`reviewed_at`/
  `review_comments`/`retest_period_days`/`retest_date`, which are kept
  as-is and now mean specifically the Round 2 (final) decision.
- **`0054_qc_two_round_review.sql`**: widens the status check constraint;
  adds the Round 1 columns; widens the "at most one active AR per batch"
  partial unique index to `status in ('submitted', 'checker_approved')`
  (previously just `'submitted'`); drops `trg_qc_enforce_maker_checker`
  and its function; adds `trg_fn_qc_enforce_review_stages` (`before
  update`) — `submitted → checker_approved/rejected` requires
  `quality_checker` or `system_admin`; `checker_approved →
  approved/rejected` requires `qc_reviewer` or `system_admin`, and blocks
  the Round 1 actor from also being the Round 2 actor (System Admin
  exempt, same posture the old maker/checker trigger had). Also widens
  `trg_qc_review_finished_product`'s `WHEN` clause so it still fires on
  the *final* decision regardless of whether `old.status` was `submitted`
  or `checker_approved` — the function body itself (FP batch status sync,
  ledger push/pull on approval) is unchanged.
- **Deliberately untouched**: `check_batch_qc_approved()` (the
  QC-gates-consumption trigger — 'approved' still means the same thing,
  unblocking consumption only after Round 2), `purchase_batch_status`
  (reads the latest row per line regardless of how many states there
  now are), `trg_fn_qc_compute_retest_date`, `trg_qc_sample_pull`,
  `computeBatchQcState()` (`checker_approved` correctly falls into its
  existing `qc_pending` catch-all bucket — no batch anywhere in the app
  is usable until the *final* approval either way), and
  `finished_product_batches.status`'s own check constraint — the FP
  batch's own status column does **not** get a distinct "Awaiting Review"
  value of its own; it stays whatever it already was through Round 1 and
  only moves on the Round 2 verdict. The two-round distinction is visible
  on the QC AR record itself (`/qc`, `/qc/[id]`), not mirrored onto the FP
  batch's own status everywhere it's displayed — a deliberate scope
  simplification, flagged to Ravi at delivery.
- **`lib/actions/qc.ts`**: `reviewQualityCheck()` replaced by
  `reviewQcRound1()` (`submitted → checker_approved/rejected`, no retest
  period field) and `reviewQcRound2()` (`checker_approved →
  approved/rejected`, retest period required on approve) — same
  "re-check current state + re-check role + re-check distinctness
  server-side before the DB trigger backstop" posture the old single
  action had.
- **`lib/constants/roles.ts`**: `qc_review` replaced by
  `qc_review_round1` (`system_admin`, `quality_checker`) and
  `qc_review_round2` (`system_admin`, `qc_reviewer`).
- **UI**: `/qc/[id]` (`app/(dashboard)/qc/[id]/page.tsx`) branches on all
  four states, rendering `qc-checker-form.tsx` (Round 1) or
  `qc-reviewer-form.tsx` (Round 2) as appropriate, plus read-only cards
  for whichever round(s) have already decided — see "Review" above.
  `qcRecordStatusLabel()` (`lib/batch-qc-status.ts`) renders
  `checker_approved` as "Approved - Awaiting Review" everywhere a QC
  status is shown as text (`/qc` list, QC Register report); the `Badge`
  component gets a matching `checker_approved` color (same amber as
  `submitted`/`complete_awaiting_qc`/`draft` — the "needs a next action"
  convention). Dashboard's "Pending QC" stat now counts both
  `submitted` and `checker_approved`; its QC-by-status pie chart gets a
  4th "Awaiting Review" slice (distinct blue, `#2563eb`) alongside the
  existing Submitted/Approved/Rejected three.

**Verification.** Migration applied and tested against the local Postgres
replica: six scenarios directly against `trg_fn_qc_enforce_review_stages`
via `SET request.jwt.claim.sub` (wrong role at Round 1; correct-role
Round 1 approve; duplicate AR insert blocked while `checker_approved`;
wrong role at Round 2; same person attempting both rounds, correctly
blocked; different correctly-roled person completing Round 2, correctly
succeeded with both rounds' fields preserved and `retest_date` correctly
computed), plus a separate Round-1-reject scenario confirming Round 2's
fields stay `null` when Round 1 terminates the record. Confirmed via
`pg_get_triggerdef` that the FP-side trigger's widened `WHEN` clause is
exactly as intended. `npx tsc --noEmit`, `npx eslint`, and `npx next
build` all clean on the full app-layer change set.

**Live-DB drift risk (flag for delivery)**: an earlier migration in this
project (`0053_bulk_upload_mfr_procedure.sql`) hit "cannot change return
type of existing function" against Ravi's live Supabase because its
on-file function signature had drifted from what was actually deployed.
`0054` does its own `create or replace function` /
drop-and-recreate-trigger work (`trg_fn_qc_enforce_review_stages`,
`trg_qc_review_finished_product`) — the same class of drift is possible
here too, not yet confirmed against the live DB. If Postgres complains on
apply, prepend `drop function if exists ...;` / `drop trigger if exists
...;` for the specific object it names, the same fix used for 0053.

## "Finished Product Awaiting QC" notification card (21 Sept 2026)

Ravi: *"FIISHED PRODUCT ONCE CREATED SHOULD ALSO APPEAR IN NOTIFICTCATION
AS 'aWAITING qc'."*

**Existing gap:** a Finished Product batch reaches `complete_awaiting_qc`
status once `completeFinishedProductBatch` runs (batch yield, finish date,
QC/stability/R&D sample quantities all entered — see
`lib/actions/finished-product.ts` and `fpStatusLabel()`'s exact
"Complete - Awaiting QC" label in `lib/finished-product-status.ts`). From
there, nothing prompted anyone to actually submit it to QC — it just sat
there until someone happened to open that specific batch's own detail page
and noticed the "Submit to QC" card. This is the exact same gap the
existing "Awaiting QC" card (`awaiting-qc.tsx`) already closes for raw
material — a purchase line that's arrived but has no QC record yet, shown
right on the `/qc` list page so it's impossible to miss.

**Fix:** new `AwaitingFpQc` card (`app/(dashboard)/qc/awaiting-fp-qc.tsx`),
rendered on `/qc` alongside the existing RM "Awaiting QC" and "Due for
retest" cards. Queries `finished_product_batches` directly for
`status = 'complete_awaiting_qc'` (`getAwaitingFpQcLines()` in
`qc/page.tsx`) — no view indirection needed here, unlike RM's query,
since `finished_product_batches.status` is already the authoritative field
for this (see the "application-level status sync" comment at the top of
`lib/finished-product-status.ts`).

Each row submits **directly**, not just a link-through: it reuses
`submitFinishedProductToQc` — the exact same Server Action the batch's own
detail page's "Submit to QC" button already calls
(`app/(dashboard)/finished-product/[id]/submit-to-qc-form.tsx`) — bound per
row, with its own independent pending/error state, same pattern as
`due-for-retest.tsx`'s per-row retest forms. This is a genuine one-click
resolution rather than RM's card (which links to `/qc/new` because a real
AR form still needs filling in there) — for Finished Product, everything
`submitFinishedProductToQc` needs (QC sample qty, unit, expiry) was already
entered during Complete Batch, so there's nothing left to ask for.

Gated on `canWrite(user.roles, "finished_product")` — the exact same
authorization `submitFinishedProductToQc` itself enforces server-side, not
`qc_assign` (RM's card uses `qc_assign` because starting an AR is a QC
action; submitting an FP batch to QC is a Finished Product action, same
distinction the rest of this module already draws). Respects the app-wide
"Hide legacy data" preference the same way every other card on this page
does.

No database migration — `finished_product_batches.status` and
`complete_awaiting_qc` already existed (`0047_fp_batch_complete_awaiting_qc.sql`);
this only adds a query and a card that surface batches already sitting in
that state. Verified: `tsc --noEmit`, `eslint`, `next build` all clean,
plus a local `next dev` smoke test confirming `/qc` still responds
correctly.

## Retests draw a real sample; every due batch can be retested (29 Sept 2026, migration 0080 — accuracy audit ACC-10/16/39)

**Starting a retest.** "Start Retest" on the Due-for-retest cards (purchase and
production batches) now asks for the retest sample quantity and unit. The
quantity defaults to the batch's QC sample size. `start_retest()` then does
everything in one transaction:

1. Checks that the batch is approved and its retest date has passed.
2. Takes the sample from the batch's **stability reserve first**. The reserve
   left over from Final Submit is already out of stock, so this moves no stock.
3. Takes any remainder from the batch's **remaining stock**, as a
   `qc_sample` stock movement that decrements the batch.
4. Records how much came from each on the QC record (`stability_reserve_used`,
   `stock_sample_used`).

**What was wrong before:**
- **Reserve never used up (ACC-16).** Every retest recorded the full stability
  reserve as its sample, and the reserve never went down.
- **Batches stuck (ACC-10).** A batch with no stability reserve was blocked from
  production once due, but it wasn't listed and couldn't be retested.
- **Empty batches listed (ACC-39).** Batches with nothing left appeared as due.

**Now:**
- **Every due batch that still has stock is listed**, with or without a reserve.
  The card shows how much reserve and how much stock is left.
- **Clear refusals.** A retest needing more than reserve plus stock is refused
  with the amounts left.

## Each round shows its own result (29 Sept 2026 — ACC-24)

The QC detail page read Round 1 from the record's final status. So a record
the QC Checker approved and the QC Reviewer then rejected showed Round 1 as
"Rejected", and a Round 1 rejection showed a Round 2 card as if the reviewer
had decided it.

`lib/qc-rounds.ts` now derives each round from its own fields:

- **Round 1** comes from `checker_at`. Records from before two-round review
  show "Not recorded".
- **Round 2** comes from `reviewed_at`.
- **A Round 1 rejection** shows "Rejected at Round 1 — no QC Reviewer decision
  was needed".

## Dashboard: retest and expiry alerts, next 90 days (30 Sept 2026, B15)

The Dashboard has two alert cards next to Low stock. **Retest due in the next 90 days** covers raw materials (purchased batches still in stock, and raw material made from finished product issued to Production) and finished products; **Finished product expiring in the next 90 days** covers approved, active finished-product batches by their expiry date. Each line shows the item, batch, AR number (retest), a Raw material / Finished product tag, the date and days left. Up to 8 lines per card, with a "+ N more" link. The retest rule is the same as the QC page's Due for retest (latest QC of each batch, approved). "Hide legacy data" applies. Not checked: stock remaining for a finished-product batch (no per-batch remaining figure exists). Code: `app/(dashboard)/dashboard-alerts.ts`. No database change.

## "Analytical Report No." on screen (FB-0047, 1 Oct 2026)
The tester asked for the full form of "AR No". On-screen text now says **Analytical Report No.** (QC list column and search, QC record, Assign form and its messages, COA list column and search, COA page subtitle, Finished Product page, Reports screen column, Label Printing status line, the "Decision saved" message). Ravi: app screens only, nothing printable or downloadable changes, so these keep the short wording: Excel/PDF exports of the QC and COA lists and of Reports (Reports columns have an optional `exportHeader` for this), the BMR Word document, and the COA header field "AR No" (it is saved into the printed Certificate of Analysis). The AR numbers (AR-017-28092026) and their format are unchanged.


## Expiry date and last retest (0098, 3 Oct 2026, FB-0058 / FB-0061)

- The QC Reviewer enters an **Expiry date** with every approval (required; not before today),
  for raw material and finished product. It is stored on `quality_checks.expiry_date`; a retest
  starts from the previous expiry date and the Reviewer can change it.
- Raw material **Retest period** is pre-filled with 180 days (the longest allowed) and can be edited;
  the screen shows the resulting next retest date. At most 3 retests (so up to 18 months).
- On the **3rd retest** the Reviewer sets only the Expiry date. No retest date is stored, so the batch
  is not due again and stays usable until its Expiry date; no 4th retest can be started.
- After its Expiry date a batch is refused by the database (`check_batch_qc_approved`), no longer
  counts as older stock in the FIFO check, is not offered in Compose, shows "Expired" on the item
  page and RM Report, and is not offered on the Approved RM label.
- Shown on: QC page, QC list and Reports QC register (Excel/PDF), Approved RM label ("Expiry Date"),
  FP label ("Best Before"), and the Dashboard "Expiring in the next 90 days" card (raw and finished).
- Not enforced: expiry before the retest date; finished product has no retest limit.

## Analytical Report No. format (0099, 3 Oct 2026, FB-0059)

- Raw material: `ARRM-0001/26`. Finished product: `ARFP-0001/26`. Prefix, 4-digit running number, `/`, 2-digit year (India time).
- Each type has its own counter, and each counter starts again at 0001 every year.
- After 9999 the number keeps counting as `ARRM-10000/26` (never cut short or repeated).
- Numbers already issued (`AR-001-DDMMYYYY`) are not changed.
- `get_next_ar_number()` (raw material, used by purchase QC, production QC and retest) and `get_next_fp_ar_number()` (finished product, used by `submit_fp_batch_to_qc`). Counters are sequences named `ar_rm_26_seq` and `ar_fp_26_seq`, created when first needed.

## Opening stock (0100, 3 Oct 2026)
Batches loaded as opening stock carry a Legacy tag; their old AR number is kept as typed. A legacy Approved
batch can be retested; `legacy_retests_done` counts toward the 3-retest limit. A Pending QC legacy batch
starts the Reviewer's Expiry date from the manufacturer expiry date it was loaded with. See opening-stock.md.


## Finished product batches in progress (10 Oct 2026 — B34 / FB-0049 / FB-0056)

QC is now told when a finished product batch **starts**, not only when it is
complete (Ravi: "after the batch is submitted, i.e. In Process, intimation
should be sent to QC that the process has started").

- **`/qc` card "Finished Product Batches In Progress"**, above "Awaiting QC":
  every active batch with status `in_process` (Create Batch has been clicked,
  Complete Batch has not), newest first, with the product, full and short batch
  number, start date and planned quantity. Each row opens the batch page.
- **Dashboard card "Finished product batches in progress"** with the same rows
  (first eight, then "+ more on the QC page").
- A batch leaves the list when it is completed (it then appears under "Finished
  Product Awaiting QC"), cancelled, or deleted. Both cards respect "Hide legacy
  data".
- Nothing is stored: the list reads `finished_product_batches.status` through
  `getFpInProgress()` (`lib/fp-in-progress.ts`, 50 rows, with a "+ N more"
  line). No migration. Email or WhatsApp alerts are not built (they would need
  an outside service).
