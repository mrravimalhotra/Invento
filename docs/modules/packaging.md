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

## Packaged Finished Product — how FP leaves inventory (Task F, 3 Sept 2026)

Full design rationale: `claude/packaged-fp-redesign.md` (project doc).
Ravi's opening question for this task was "how Finished Product which is
only incremental right now in inventory will go out of inventory" —
Finished Product had been fully ledger-tracked since the
[Inventory Ledger redesign](inventory.md)'s Phase 3 (pushed at QC
approval, pulled for QC/Stability/R&D samples) but nothing ever pulled it
back out for ordinary use. His answer: build it into this screen, not a
new Dispatch/Sales module.

**The mechanic.** A "New Packaging Issue" for department **Store** or
**R&D** now does three things in one transaction, on top of the existing
packaging-material pull and `packaged_qty` bump:

1. Pulls bulk Finished Product (e.g. FP-00001, in its native unit).
2. Pushes a brand-new paired item, **Packaged Finished Product** (e.g.
   PKG-FP-00001 for FP-00001 — same item name, its own code and
   category), counted in packaged units (bottles/packs), not bulk volume.
3. Immediately pulls that same quantity back out as "issued to Store" /
   "issued to R&D" — always fully issued, one-shot; a Packaged FP item's
   on-hand always nets to zero right after. The full create-then-issue
   history stays on the ledger, same "never hide history" convention as
   the rest of this app.

**Department = Production is explicitly untouched.** The pre-existing
`trg_fn_packaging_pull` (packaged_qty bump) and `trg_fn_packaging_item_pull`
(packaging-material pulls) still fire for every department exactly as
before; the new transform only ever fires for `store`/`rnd`. `department`
was purely descriptive before this feature — this is the first place it
becomes a real behavioral fork.

**Schema (`0032_packaged_finished_product.sql`)**:
- `items.category` gains `'packaged_fp'`, a fourth value distinct from
  both `'processed'` (bulk FP) and the pre-existing `'packaging'`
  (materials — bottles, caps).
- `items.packaged_item_id` (nullable, unique, self-ref FK) pairs a bulk
  FP item to its Packaged FP item 1:1. Set once, eagerly, the moment the
  FP item itself is created — `createMfrDefinition()`
  (`lib/actions/mfr.ts`) now creates both items and links them, before
  creating the MFR definition, with the same best-effort rollback-on-
  failure discipline it already used for the FP item alone.
- `get_next_item_code()` / `peek_next_item_code()` gained a
  `'packaged_fp'` branch: prefix `PKG-FP` (own sequence,
  `item_code_seq_pkgfp`) → `PKG-FP-00001`, deliberately matching Ravi's
  own example despite the visual similarity to the pre-existing
  packaging-materials `PKG-00001` prefix.
- `packaging_issues` gained three nullable columns — `pack_size_qty`,
  `pack_size_unit`, `fp_qty_consumed` — populated only for Store/R&D.
  Production keeps the original free-text-only `pack_size` unchanged.
  `fp_qty_consumed` (`pack_size_qty × unit_count`, already unit-converted
  into the FP item's own base unit via `lib/constants/units.ts`
  `convertUnit()`) is computed app-side in `createPackagingIssue()`, so
  the DB trigger never does unit arithmetic.
- `inventory_ledger.reference_type` gained `fp_packaging_pull` (bulk FP
  consumed), `packaged_fp_yield` (Packaged FP pushed), `packaged_fp_issue`
  (Packaged FP pulled/issued — Store vs R&D read off the existing
  `department` column, same pattern the pre-existing `packaging` pulls
  already use, not a separate reference_type per department).
- New trigger `trg_fn_packaging_transform_and_issue`
  (`after insert on packaging_issues`) does the three-step pull/push/pull
  above. No-ops for `department = 'production'`, for a null/zero
  `fp_qty_consumed`, and — same graceful-skip posture as Phase 3's
  `fp_yield` trigger — for an FP item with no `packaged_item_id` yet
  (an MFR created before this migration). The server action checks that
  last case up front and returns a clear error instead of a silent no-op,
  since a Store/R&D issue succeeding without actually transforming
  anything would otherwise look like a bug.
- `item_position` (0031) gained four more columns:
  `consumed_by_packaging` (bulk FP's new pull bucket), `packaged_yield`
  (Packaged FP's push bucket), `issued_store` / `issued_rnd` (Packaged
  FP's pull bucket, split by department). Appended *after* the view's
  existing last column (`on_hand`) — `create or replace view` requires
  every pre-existing column to keep its exact name/type/position, so new
  columns can only ever go at the end (hit this the hard way locally: the
  first draft inserted them before `wastage`/`on_hand` and Postgres
  rejected the replace outright).

**Form (`packaging-form.tsx`)**: department Store/R&D swaps the free-text
Pack size field for two structured inputs (Pack size quantity + unit);
Production is unchanged. `packaging/new/page.tsx` now also resolves each
listed batch's own FP item unit (via `mfr_definitions.
finished_product_item_id`) to hint the form. All server-side enforcement
still happens in `createPackagingIssue()` regardless of what the client
sends.

**Item Master / Stock Position / item detail page**: `packaged_fp` gets
its own label ("Packaged finished product"), its own locked-category
treatment in the item edit form (same one-way-door pattern as
`processed`), a dedicated `ItemPositionSummary` layout (Packaged total /
Issued to Store / Issued to R&D / Available), and a Stock Position
breakdown line. The bulk FP item's own summary/breakdown gained a "Used
in packaging" / "Packaged" figure.

**Verified locally** (fresh `invento_test` Postgres, all 32 migrations
replayed): an FP batch pushed to 100 ltr at QC approval, then a Store
issue (1 ltr × 40 = 40 ltr) and an R&D issue (500 ml × 20 = 10 ltr,
exercising the ml→ltr unit-family conversion) both correctly pulled bulk
FP, pushed then fully pulled Packaged FP (on_hand nets to 0 for both),
and left bulk FP on-hand at 50 (100 − 40 − 10). A same-batch Production
issue produced *zero* new `fp_packaging_pull`/`packaged_fp_yield`/
`packaged_fp_issue` rows — only the pre-existing material pull and
`packaged_qty` bump, confirming Production is byte-for-byte unchanged.
Two defensive-skip paths (a store issue with no `fp_qty_consumed`, and a
legacy FP item with no paired `packaged_item_id`) both no-op cleanly with
no error, and the packaging-material pull still fires normally in the
second case.

**Not done in this pass** (see the design doc): no backfill of a
`packaged_item_id` for MFRs created before this migration — they simply
can't take a Store/R&D packaging issue until paired (the server action
reports this clearly rather than silently skipping the transform).
