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
  `qc_qty` reserve is never decremented by the initial assign), carries
  forward the previous record's `expiry_date` (the sample's tested expiry
  doesn't change just because it's being retested), sets `is_retest =
  true`, and gets a new AR number the normal way.
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
