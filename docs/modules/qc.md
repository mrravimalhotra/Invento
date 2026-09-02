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
  The sample-pull ledger row is written automatically by
  `trg_qc_sample_pull` (0002_transactions.sql) — this action never touches
  `inventory_ledger`.
- Guards against double-submission: re-checks `purchase_batch_status` at
  submit time and rejects if the batch is no longer `not_submitted`.

### Review ("checker" step) — `/qc/[id]`
- Role: `qc_review` (`system_admin`, `quality_checker`, `qc_reviewer`).
- Shows the assign record read-only (AR number, item, batch, sample qty,
  expiry) always.
- While `status = 'submitted'`: shows the review form — Approved/Rejected
  toggle buttons, review comments (textarea), and **Retest Period (days)**,
  a plain numeric input.
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
  renders read-only (decision, reviewed-at, retest period + date, comments)
  and the review form is gone — there is no re-edit path, matching the
  existing baseline behavior, kept as-is per the module brief.
- The Server Action re-checks the row is still `'submitted'` before writing,
  so this is enforced server-side too, not just by hiding the form.

## Role note (flag for reconciliation)

The module brief asked me to check whether `qc_assign` exists as a key in
`lib/constants/roles.ts` → `MODULE_WRITE_ROLES`, since it wasn't expected to
be there. **It already exists**, and so does `qc_review`:

```
qc_assign: ["system_admin", "inventory_manager", "quality_checker", "qc_reviewer"],
qc_review: ["system_admin", "quality_checker", "qc_reviewer"],
```

Both match the role sets specified in this module's brief exactly, so no
inline-array workaround was needed — both screens call `canWrite(user.roles,
"qc_assign" | "qc_review")` directly. Only noting this so whoever
reconciles the roles file knows the keys were already present (added by
another agent before this module was built) and don't need to be re-added.

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

- `lib/actions/qc.ts` — `createQualityCheck`, `reviewQualityCheck`.
- `app/(dashboard)/qc/page.tsx` — list.
- `app/(dashboard)/qc/new/page.tsx` + `qc-assign-form.tsx` — assign step.
- `app/(dashboard)/qc/[id]/page.tsx` + `qc-review-form.tsx` — review step /
  read-only view.

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
