# Module 11 — Packaging

DESIGN.md cross-reference: §4.10.

**Newly-promoted module.** Like BMR, this was a "Not Yet Built" table row
until the second requirements-review pass found real source documents for
it — there is no packaging module in the first-draft codebase, so this was
built clean against `packaging_issues` and `trg_packaging_pull`, not
adapted from prior code. Field spec sources:

- `Software Point.docx` §5 — the department-issue concept (`department`,
  linking a finished-product batch to packaging material consumption).
- `FormPacking` (the legacy issue-to-department screen) and
  `FormPackingList` (the legacy printable packing register) — confirmed the
  screen's actual field set (`pack_size`, `unit_count`,
  `packaging_qty_used`) and that the list view is meant to double as a
  printable register, which is why the PDF export button is on `/packaging`
  itself rather than a separate report.
- The handwritten requirements list's "Add Repackaging" and "show unpack &
  finish pack material with details" items — the reason
  `transaction_type` exists as a first-class `pack` / `repack` / `unpack`
  field instead of `packaging_issues` only ever meaning "pack".

## Screens

### List — `/packaging`
- `DataTable` of every `packaging_issues` row, newest first by
  `created_at`.
- Columns: FP batch number, pack size, unit count, department (badge),
  transaction type (badge), packaging materials (summarized, see below),
  created at.
- **PDF export button** (`lib/pdf.ts`'s `downloadPdfTable()`) next to "New
  issue" — exports the currently-loaded rows as the packing register, the
  direct replacement for legacy `FormPackingList`.
- "New issue" button gated by `canWrite(user.roles, "packaging")`.

### New — `/packaging/new`
- Role: `packaging` (`system_admin`, `inventory_manager`, `mfr_manager` —
  matches the RLS insert policy on `packaging_issues` and, since 3 Sept
  2026, `packaging_issue_items`).
- `finished_product_batch_id` — dropdown of `finished_product_batches`
  filtered to `status = 'approved'` **only**. Packaging follows FP approval
  per the corrected legacy flow (see `docs/DESIGN.md`'s note under
  Finished Product that the legacy system does gate FP on approval before
  it can be packed) — an unapproved batch never appears as an option, and
  the Server Action re-checks the batch's status server-side before
  inserting as a second line of defense.
- `pack_size` — plain text input, not a unit-list dropdown. Legacy pack-size
  data (e.g. "100ml bottle", "60 tab strip") has increments the fixed
  `UNITS` list in `lib/constants/units.ts` doesn't cover, so this is
  deliberately free text.
- `unit_count` — numeric.
- `department` — select from `DEPARTMENTS` (`production` / `rnd` /
  `store`).
- `transaction_type` — select `pack` / `repack` / `unpack`, defaults to
  `pack`.
- **Packaging materials** — see "Multiple packaging materials per issue"
  below; this replaced the old single `packaging_item_id` +
  `packaging_qty_used` pair.
- On insert, `trg_packaging_pull` (in `0002_transactions.sql`, rewritten by
  `0027_packaging_multi_material.sql`) bumps
  `finished_product_batches.packaged_qty` (subtracting for `unpack`) off the
  `packaging_issues` header row; a separate per-line trigger
  (`trg_packaging_item_pull`, new in the same migration) pulls each
  material's own quantity from stock via the ledger. The Server Action only
  inserts the header + line rows, it never touches the ledger or
  `packaged_qty` itself.

## Multiple packaging materials per issue (3 Sept 2026)

"In packaging allow selection of multiple packaging materials such as
bottles, caps etc. Each material can have a different unit/quantity."
(Ravi) — the original design modeled one packaging issue as exactly one
`packaging_item_id` + `packaging_qty_used` (1:1), so a single pack run that
actually used bottles *and* caps *and* labels needed a separate issue per
material, with nothing tying them together as one packing event.

- `supabase/migrations/0027_packaging_multi_material.sql` adds a new
  `packaging_issue_items` table (`packaging_issue_id`, `item_id`,
  `quantity`, `unit`) — the same header/lines split already used for MFR
  recipe lines and Finished Product composition
  (`finished_product_components`). `packaging_issues.packaging_item_id` /
  `packaging_qty_used` are dropped to nullable (not dropped outright) so
  every pre-existing row keeps its original single-material value on file;
  the migration also backfills each of those rows into the new table as its
  own one-line entry, using the item's own Item Master unit as a
  best-effort default (there was never a captured unit on the old ledger
  pull either — see below).
- `app/(dashboard)/packaging/packaging-materials-editor.tsx` —
  `PackagingMaterialsEditor`, a new client component mirroring
  `mfr-line-editor.tsx`'s `MfrLineEditor` add/remove-row pattern exactly:
  one row per material (item picker, quantity, unit — unit auto-fills from
  the item's own Item Master default on pick, still overridable), a hidden
  `lineCount` field, "Add material" / trash-icon remove. `packaging-form.tsx`
  now renders this in place of the old two-column
  item-dropdown-plus-quantity-input block.
- `lib/actions/packaging.ts`'s `createPackagingIssue()` gained a
  `parseMaterials()` helper (same `lineCount` + `item_id_i`/`quantity_i`/
  `unit_i` parsing shape as `finished-product.ts`'s `parseComponents()`),
  inserts the `packaging_issues` header first, then bulk-inserts
  `packaging_issue_items`, with the header rolled back (deleted) if the
  lines insert fails — same pattern as `createFinishedProductBatch()`.
- List page (`packaging/page.tsx`) and table (`packaging-table.tsx`) now
  embed `packaging_issue_items(quantity, unit, items(name, item_code))`
  instead of the old singular `items(name)`, and render/search/export a
  summarized string ("Bottle 500ml (12 count), Cap (12 count)") via the new
  `materialsSummary()` helper.
- **Pre-existing gap closed as a side effect**: the old
  `trg_fn_packaging_pull()`'s ledger insert never set a `unit` column at
  all (`packaging_issues` had no unit column to read one from) — every
  historical packaging "pull" ledger row has `unit = null`. The new
  per-line trigger (`trg_fn_packaging_item_pull` /
  `trg_packaging_item_pull`) writes each line's real `unit`, so every new
  pull going forward has one. Historical rows are unchanged.
- `app/(dashboard)/packaging/new/page.tsx` needed no changes — its
  `packagingItems` query shape (`id, item_code, name, unit`) already
  matched what the new editor expects.

## Role

`packaging` in `MODULE_WRITE_ROLES` (`lib/constants/roles.ts` — already
present, not added by this module).

## Files

- `lib/actions/packaging.ts` — `createPackagingIssue`, `parseMaterials`.
- `app/(dashboard)/packaging/page.tsx` — list + PDF export.
- `app/(dashboard)/packaging/new/page.tsx` + `packaging-form.tsx` — create
  form.
- `app/(dashboard)/packaging/packaging-materials-editor.tsx` — multi-line
  materials editor (3 Sept 2026).
- `app/(dashboard)/packaging/packaging-table.tsx` — list table +
  `materialsSummary()` helper (shared with the PDF export).
- `app/(dashboard)/packaging/packaging-export-button.tsx` — client
  component wrapping `downloadPdfTable()`.
- `supabase/migrations/0027_packaging_multi_material.sql` — the
  `packaging_issue_items` table and its consumption trigger.

## Deviations / notes for review

- No detail/edit screen — the module brief specifies only a list and a new
  form, matching `FormPacking`/`FormPackingList`'s original scope (issue +
  register, no edit-after-issue workflow in the legacy system either).
- `packaging_issues` has no QC-approval gate trigger of its own (only
  `bmr_weighment_lines` and `finished_product_components` carry
  `check_batch_qc_approved()`), so no Postgres-exception handling was needed
  here beyond the FP-status re-check described above.

## Fixes (1 Sept 2026)

From a full-app audit (`claude/known-issues.md`):

- **Success confirmation.** `createPackagingIssue` now redirects to
  `/packaging?created=1`; the list shows a one-time "New packaging issue has
  been successfully added" banner — previously it redirected with no
  confirmation at all, unlike the create flows elsewhere in the app.
- **"Hide legacy data" (FB-0003) reached Packaging.** It asked for the
  toggle "across app" but Packaging was missed — 22 real `packaging_issues`
  rows tied to `LEG-FP-*` batches (per `claude/data-gap-analysis.md`) had no
  way to be hidden. `PackagingTable` now passes `isLegacy` (keyed off the
  linked FP batch's `LEG-` prefix) to `DataTable`, same as Items/Vendors/
  Purchase/MFR/Finished Product.
- **Quantity columns had no database-level check.** `unit_count` and
  `packaging_qty_used` relied entirely on Server Action validation.
  `0016_quantity_check_constraints.sql` adds `not valid` CHECK constraints
  requiring both `> 0` — enforced on all new writes without needing to
  validate/reject any existing row first.

## Searchable, legacy-aware pickers (1 Sept 2026)

`packaging-form.tsx`'s FP batch and Packaging item selects are searchable
comboboxes app-wide now (DESIGN.md §8), both marked `data-legacy`. The
packaging item picker's server query (`app/(dashboard)/packaging/new/page.tsx`)
had to widen from `select("id, name, unit")` to include `item_code` — it
wasn't selected before, so there was no way to tell a legacy packaging
item apart from a v2 one. The dropdown label now also shows the item code
(`RM-00006 — Ashwagandha Powder` style), matching every other item picker
in the app instead of name-only.

## Bug fix: row-cap truncation, applied preemptively (1 Sept 2026)

Not separately reported, but found during the sweep triggered by the
Purchase/MFR item-picker bug (see `docs/modules/purchase.md`'s "Bug fix"
section and `claude/known-issues.md`): the packaging-items query
(`packaging/new/page.tsx`) had the same unbounded-query-plus-name-order
shape, just with a much smaller table so lower practical risk today. Fixed
the same way for consistency — orders by `created_at descending` now.
