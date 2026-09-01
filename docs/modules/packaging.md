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
  transaction type (badge), packaging item name, created at.
- **PDF export button** (`lib/pdf.ts`'s `downloadPdfTable()`) next to "New
  issue" — exports the currently-loaded rows as the packing register, the
  direct replacement for legacy `FormPackingList`.
- "New issue" button gated by `canWrite(user.roles, "packaging")`.

### New — `/packaging/new`
- Role: `packaging` (`system_admin`, `inventory_manager`, `mfr_manager` —
  matches the RLS insert policy on `packaging_issues`).
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
- `packaging_item_id` — dropdown of `items` where `category = 'packaging'`.
- `packaging_qty_used` — numeric.
- `transaction_type` — select `pack` / `repack` / `unpack`, defaults to
  `pack`.
- On insert, `trg_packaging_pull` (in `0002_transactions.sql`) pulls
  `packaging_qty_used` of `packaging_item_id` from stock via the ledger and
  bumps `finished_product_batches.packaged_qty` (subtracting for `unpack`)
  automatically — the Server Action only inserts the row, it never touches
  the ledger or `packaged_qty` itself.

## Role

`packaging` in `MODULE_WRITE_ROLES` (`lib/constants/roles.ts` — already
present, not added by this module).

## Files

- `lib/actions/packaging.ts` — `createPackagingIssue`.
- `app/(dashboard)/packaging/page.tsx` — list + PDF export.
- `app/(dashboard)/packaging/new/page.tsx` + `packaging-form.tsx` — create
  form.
- `app/(dashboard)/packaging/packaging-export-button.tsx` — client
  component wrapping `downloadPdfTable()`.

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
