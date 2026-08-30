# Legacy data vs v2 schema — data-characteristics gap analysis + sample import report

This is a companion to `requirements-gap-analysis.md` (which compared legacy
*requirement documents* to v2) and `legacy-data-mapping.md` (table→table
mapping). This doc covers what was actually found in the legacy *data itself*
once loaded, plus the outcome of the module-by-module sample import and the
test suite run against it. Written 2026-08-29, fully unattended (user asleep
per their instruction — "insert sample records ... starting item master, raw
material details, vendor details, purchase etc and run comprehensive test
cases").

## Why sample import, not full bulk load

A prior session measured the cost of importing all 151 transform SQL files
(~8,461 rows) through the only available execution path (Supabase SQL Editor,
driven via browser automation — there is no direct DB network access from
this environment). That path is too token-expensive for a full bulk load.
This session pivoted to: curated, business-key-joined sample inserts,
module-by-module in dependency order, chosen to (a) be realistic — pulled
from real legacy rows wherever possible, not fabricated — and (b) exercise
every downstream table and trigger at least once.

## Data-quality characteristics found in the legacy data

- **Item codes are sparse and non-sequential.** They carry over the original
  SQL Server `ItemId` identity values directly (`LEG-RM-00001` up to
  `LEG-RM-92090+`), not a clean 1..N range. Only a partial range
  (`LEG-RM-00001`–`~04144`, plus the full 79-row packaging set) is loaded in
  this staging project. This matters for anyone selecting further legacy rows
  to import: a batch/formula/purchase row chosen at random very likely
  references item codes outside whatever range happens to be loaded, and the
  business-key join will silently drop it (0 rows, no error) rather than
  fail loudly.
- **Legacy chunked transform files are alphabetically sorted, not
  numerically.** `LEG-PO-2` sorts after all `LEG-PO-1xxx` values, so
  "file 000" does not contain "PO 0 through PO N" — it contains whatever text
  sorts first. Anyone resuming this import must grep across *all* chunk files
  for a given business key, never assume chunk-N-in-order.
- **Historical batches only have usable component data for older
  (~2016) batches**, given the partial items range loaded. Newer batches
  (2023-era, e.g. `LEG-FP-2852`) reference item codes (`LEG-RM-9xxxx`) far
  outside range. This is a direct consequence of the sparse numbering above,
  not a separate issue.
- **`purchase_lines.qc_qty` / `stability_qty` / `rnd_qty` are 0 for every
  row sampled** (both the real curated POs and the legacy-realistic
  synthetic ones). The legacy `ItemMaster.QCQty` split fields exist in the
  schema but were evidently not populated for the batches sampled here —
  consistent with `legacy-data-mapping.md`'s note that legacy QC data is a
  snapshot at best, not an event log.
- **No historical QC/approval event log exists in legacy data at all** —
  confirmed again at the row level, not just the requirements level. The new
  `quality_checks` table (AR-number workflow) has zero legacy equivalent; all
  27 sample rows in this session are synthesized to exercise the workflow,
  not migrated.
- **Legacy batch numbers are free text** (`LEG-PR-39` style, carried over
  from SQL Server) and do not match v2's generated `RM-NN/YY` pattern from
  `get_next_batch_number()`. Confirmed both are internally consistent (no
  collisions) but they're deliberately different formats — legacy batch
  numbers are historical record, not something a NN/YY parser should expect.

## v2 schema behaviors discovered while loading (not previously documented)

- **`finished_product_components` and `bmr_weighment_lines` both carry a
  QC-gate trigger** (`trg_fp_component_qc_gate`, `trg_bmr_weighment_qc_gate`,
  same underlying function `check_batch_qc_approved()`) that blocks
  consuming a `purchase_line` unless a `quality_checks` row for it has
  `status='approved'` (checked via a `purchase_batch_status` view — latest
  `quality_checks` row per purchase_line, `COALESCE(status,'not_submitted')`).
  This was hit as a real blocker during import (had to insert `quality_checks`
  rows before those two tables would accept historical/synthetic data) and is
  now confirmed working correctly in both directions (see Test results
  below) — this is a meaningful, previously-undocumented business rule.
- **`purchase_lines` inserts auto-generate an `inventory_ledger` push event**
  (`trg_purchase_line_push`), and **`finished_product_components` /
  `bmr_weighment_lines` inserts auto-generate `inventory_ledger` pull
  events** (`trg_fp_component_pull` and an equivalent on
  `bmr_weighment_lines`). This means `inventory_ledger` is *not* purely a
  migrated table — it mixes explicitly-imported legacy events (opening
  balance "push", historical "wastage") with live trigger-generated ones from
  every purchase/consumption insert made this session. Anyone reconciling
  `inventory_ledger` counts against the legacy `OpeningBalance`/`RawWestage`
  row counts needs to account for this, or the numbers won't match 1:1.
- **Code-generation functions are date-anchored to "now", not to a supplied
  historical date** — `get_next_ar_number()` → `AR-001-29082026`,
  `get_next_coa_number()` → `COA-0001-2026`. There is no way to backfill an
  exact historical AR/COA number through these functions; sample
  `quality_checks`/`coa_records` rows in this session use manually
  constructed identifiers (`AR-...` via the function, since it has no date
  parameter either way; `COA-<batch_number>-<YYYYMMDD>` built by hand to stay
  traceable) rather than the app's own generator, which would have stamped
  today's date onto 2016-era history.
- **`get_next_item_code`/`vendor`/`mfr`/`fp_batch`/`po`/`batch` all confirmed
  independent of the `LEG-*` legacy code space** — first call in this fresh
  staging project returned `RM-0001`, `V-0001`, `F-0001`, `FP-0001`,
  `PO-0001`, `RM-01/26` respectively, with no collision risk against
  imported `LEG-RM-...` / `LEG-V-...` / etc. codes. Good: new records created
  through the app won't collide with migrated history.
- **`quality_checks` schema constraints**: `status` is a strict 3-value enum
  (`submitted`/`approved`/`rejected` — no `on_hold`/`pending` distinct
  state), and a check constraint enforces **exactly one** of
  `purchase_line_id` / `finished_product_batch_id` is set (never both, never
  neither) — i.e. one QC record is always either a raw-material check or a
  finished-product check, never generic. `line_clearance_checks.status` is
  `clear`/`not_clear` only. `documents.doc_type` is `sop`/`stp` only (no
  label-template or COA-template doc type in the current schema, despite
  `requirements-gap-analysis.md` flagging label templates as an in-scope
  legacy artifact type — worth a follow-up decision on whether `documents`
  should gain more `doc_type` values or those stay a separate concept).

## Sample data loaded this session (module-by-module, dependency order)

| Module | Rows | Source |
|---|---|---|
| `items` (packaging) | 79 | Real — full `Packingmaster`-derived set (`02_items_027.sql`), imported whole since it's small and complete |
| `items` (raw/finish) | 3,421 | Real — carried over from prior session (chunks 000–011, `LEG-RM-00001`–`~04144`) |
| `vendors` | 94 | Real — full set (prior session) |
| `purchase_orders` | 26 | Real (curated, PO-0..24) + 2 synthetic (`LEG-PO-SAMPLE-RM`, `LEG-PO-SAMPLE-FP`) to unblock MFR/FP component joins |
| `purchase_lines` | 107 | 38 real (PO-1..24) + 53 synthetic (RM sample) + 18 synthetic (FP sample, exact item+batch pairs needed by real `09_finished_product_components_*` rows) |
| `mfr_definitions` | 18 | Real — 18 of 248 formulas selected for having real, in-range component data |
| `mfr_lines` | 121 | Real — full BOM for the 18 selected formulas |
| `finished_product_batches` | 7 | Real — 2016-era batches (`LEG-FP-192/195/199/205/231/259/304`) chosen because their real components fall in the loaded items range |
| `finished_product_components` | 26 | Real — actual legacy consumption rows for the 7 batches |
| `packaging_issues` | 22 | Real — legacy rows found by grep across all 36 chunk files for the 7 selected batches |
| `inventory_ledger` | 612 | 381 real "push" (opening-balance-style) + 100 real "wastage" (sampled) + ~131 auto-generated by triggers on the purchase_lines / component inserts above (see trigger note) |
| `quality_checks` | 27 | Synthesized (no legacy equivalent) — 20 raw-material checks (13 approved / 3 rejected / 4 submitted) against real PO-1..24 lines, 7 finished-product checks (5 approved / 1 rejected / 1 submitted) against the 7 imported batches |
| `bmr_records` | 7 | Synthesized — one per imported FP batch, staggered workflow states (5 fully approved, 1 prepared+checked only, 1 prepared only) |
| `bmr_observations` | 21 | Synthesized — 3 standard in-process readings per BMR |
| `bmr_weighment_lines` | 26 | Derived — generated directly from `finished_product_components` × `mfr_lines` via SQL join (standard vs actual qty), not hand-typed |
| `coa_records` | 5 | Synthesized — one per approved finished-product QC |
| `documents` | 7 | Synthesized reference set — 3 STP, 4 SOP (incl. one superseded/inactive revision) |
| `environmental_control_readings` | 10 | Synthesized — 5 areas, includes one deliberate out-of-range excursion (29.5°C/68% RH) for threshold-test coverage |
| `line_clearance_checks` | 7 | Synthesized — one per imported FP batch, includes 2 `not_clear` holds |

QC/approval fields on the *legacy-derived* tables (`purchase_lines`,
`finished_product_batches`, `mfr_definitions`) remain null/pending as
decided in `legacy-data-mapping.md` — nothing there was synthesized. Only the
new-in-v2 workflow tables (`quality_checks` and everything downstream of it)
carry synthetic sample data, which is what this phase of work asked for.

## Test results

31 automated data-integrity/domain assertions were run (uniqueness of
business keys, no negative quantities anywhere in the chain, zero orphaned
foreign keys across `finished_product_components` / `packaging_issues` /
`bmr_weighment_lines` / `coa_records`, `quality_checks` status-domain and
exactly-one-subject constraint conformance, `ar_number` format, both QC-gate
triggers enabled, retest-date = approval + 366 days for approved QC records)
— **all 31 passed**.

Functional/behavioral tests:
- All 6 code-generation functions (`get_next_item_code`, `_vendor_code`,
  `_mfr_code`, `_fp_batch_number`, `_po_number`, `_batch_number`,
  `_ar_number`, `_coa_number` — 8 total) called and confirmed correct output
  format, and confirmed no collision with imported `LEG-*` codes.
- QC-gate trigger positive case: inserting a `finished_product_components`
  row against an **approved** purchase_line succeeded — confirmed, then
  cleaned up.
- QC-gate trigger negative case: inserting against a **rejected**
  purchase_line raised `P0001: ... is not QC-Approved and cannot be
  consumed` — confirmed correctly blocked.

## ⚠ Open follow-ups — flagged for user review later

These are not done and not blocking; they're queued here specifically so
they aren't lost before you get a chance to weigh in:

- [ ] **REVIEW: `documents.doc_type` enum is missing label-template and
      COA-template values** (currently `sop`/`stp` only), even though
      `requirements-gap-analysis.md` flags both as in-scope legacy artifact
      types. Needs a product decision: extend the enum, or treat those as a
      separate concept/table entirely.
- [ ] **REVIEW: `inventory_ledger` opening-balance coverage is a sample**
      (381 of the legacy-implied event set), not the full historical
      push/wastage log. Fine for testing; confirm whether a fuller backfill
      is wanted before this is treated as migration-complete.
- [ ] **REVIEW: sample data breadth** — only 18 of 248 legacy MFR formulas
      and 7 of thousands of historical batches are loaded (enough to
      exercise every table/trigger once, not a production-scale or
      statistically representative dataset). Confirm whether that's
      sufficient for your test plan or whether the imported item-code range
      (currently `LEG-RM-00001`–`~04144` only) should be widened to unlock
      more/newer batches.
