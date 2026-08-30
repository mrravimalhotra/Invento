# Legacy → v2 data mapping (Samarth restore, BKP_30122023.Bak)

Source: `SSMS Generate Scripts` export of the restored legacy SQL Server database
`Samarth` (schema + all data, ~46k INSERT statements across 31 tables), taken
2026-08-29. Working copy analyzed at
`/mnt/user-data/uploads/invento_30122023--Invento/samarth_export_utf8.sql`
(converted from the SSMS UTF-16 output).

Data spans **2015-05-18 to 2023-12-22** — real production history, good for
realistic test scenarios (not just smoke-test volume).

## Row counts (legacy tables, all in `dbo` schema)

| Table | Rows | Maps to (v2) |
|---|---|---|
| CrrationFinishReg | 17,213 | `finished_product_components` (RM consumed per batch) |
| Packing | 9,097 | `packaging_issues` |
| ItemMaster | 8,382 | `items` (+ `item_types` derived) |
| PurchaseRegister | 3,780 | `purchase_lines` |
| CreationFinish | 2,781 | `finished_product_batches` |
| Purchase | 1,977 | `purchase_orders` |
| FinishWastage | 965 | wastage → `finished_product_batches.wastage` / ledger |
| RawWestage | 737 | wastage → `inventory_ledger` (event_type='wastage') |
| RecipeMaster | 566 | `mfr_definitions` + `mfr_lines` — real legacy MFR/BOM data |
| OpeningBalance | 239 | opening stock seed for `inventory_ledger` |
| RePacking | 227 | `packaging_issues` (transaction_type='repack') |
| FinishOpeningBalance | 150 | opening stock seed (finished items) |
| ContactMaster | 94 | `vendors` (rows flagged `VENDOR`) — customer rows out of scope |
| Packingmaster | 79 | `items` (category=packaging) |
| Othrity | 3 | legacy per-user permission flags — no v2 equivalent table |
| UserAccount, Orgnization, Mack, LicencesKey | 1 each | old desktop-app config — not migrated |
| CreationFinishGood, CreationFinishGoodRegister, AddrawDetails, Testing | 0 | empty in this backup |
| Employee, EmpWork, SalarySlip, Expenses, Sales, SalesRegister, Testing1, PreDespatchMaster | — | no v2 module exists for these — **decided: leave unimported** |

## Important correction to earlier assumption

We'd assumed MFR (Manufacturing Formula/Recipe) had **zero** legacy data. That's
not quite right: **`RecipeMaster` (566 rows) is a real bill-of-materials** —
`RecipeNo` groups rows, each linking a `FinishItem_Id` to a `RawItem_Id` with a
`RawQty` per `FQty` of finish item, plus `FPCode`/`RMCode` text codes. It's much
thinner than the new `mfr_definitions`/`mfr_lines` schema (no batch size, item
type, version, or approval metadata), but it's genuine historical formula data,
not a blank slate.

Better still, **`CreationFinish` (2,781 rows) + `CrrationFinishReg` (17,213
rows) together already look like a legacy Batch Manufacturing Record**:
`CreationFinish` has `StartDate/EndDate`, `BatchQty`, `WestageQty`, `NetQty`,
`ExpiryMonth`, `FPName`, `AppxNoTablets`, `WtofTotalRM`, `NetWeight`,
`ActualYeild` — a near 1:1 field match to `finished_product_batches`
(`target_qty`, `wastage`, `net_qty`, `expiry_month`, `wt_total_rm`,
`net_weight`, `actual_yield_pct`). `CrrationFinishReg` is the per-batch RM
consumption detail (`CId → ItemId, Qty, Price`), matching
`finished_product_components`.

So the realistic plan: import `RecipeMaster` as real `mfr_definitions` /
`mfr_lines` (backfilling the missing metadata with reasonable defaults —
version=1, batch_size derived from `CreationFinish.BatchQty` for that
`FinishItem_Id` where available), and import `CreationFinish` /
`CrrationFinishReg` as real `finished_product_batches` /
`finished_product_components` history. QC status/approvals on those batches
are left null/pending (decided below), not synthesized.

## Other schema notes

- `ItemMaster.Status_Flag` is exactly `RAW` or `FINISH` — clean split, but v2
  `items.category` is a 3-way enum (`raw`/`processed`/`packaging`); legacy has
  no `packaging` category among ItemMaster rows — packaging comes from
  `Packingmaster` instead (see decision below).
- `ItemMaster.TypeofRM` (free text, e.g. `Herbal`) is the closest analog to
  `item_types.description` but was never normalized in the legacy app —
  needs a distinct-values pass to build the `item_types` seed list.
- Legacy `BatchNo` (free text like `RM 03/13`) does not match v2's generated
  `RM-NN/YY` pattern — import as historical data (plain text field) rather
  than trying to force it through `get_next_batch_number()`.
- No legacy QC (quality_checks) equivalent found beyond `ItemMaster.QCQty`/
  `QCNo` (a snapshot, not an event log) — `Testing`/`Testing1` were suspected
  QC tables but are empty / look unrelated (dispatch-ish fields). QC event
  history is left pending, not synthesized (decided below).
- `ContactMaster.V_C_Statusflag` distinguishes `VENDOR` vs presumably
  `CUSTOMER` — only vendor rows are in scope for v2 (no customer/sales module).

## Decisions (confirmed with user 2026-08-29)

1. **Scope**: import only into modules that exist in v2 today (items,
   item_types, vendors, purchase, MFR, finished product/BMR, packaging,
   inventory ledger opening balances). Employee/payroll, Sales/Customer,
   Expenses, dispatch tables are **left out entirely** — not imported as
   reference tables either.
2. **Packaging items**: `Packingmaster` rows are **promoted to `items`**
   (category=`packaging`), so they flow through purchase/inventory/packaging
   like any other item.
3. **Target environment**: a **new, separate Supabase staging project** (not
   production) — to be created and have migrations 0001-0004 applied before
   import.
4. **QC & approval fields on imported data**: left **null/pending** — real
   historical batches/formulas are imported, but QC status, approvals, and
   MFR version/approval metadata are NOT synthesized on the legacy-derived
   tables themselves. The new `quality_checks` workflow table (and
   everything downstream of it — `coa_records`, `bmr_records`, etc.) is a
   separate v2-only module with no legacy equivalent, so sample rows there
   ARE synthesized (see below) — that's a different decision than
   fabricating status on migrated legacy rows.
5. **Full bulk import abandoned in favor of curated sample import**: a
   151-file/~8,461-row full load was measured as too token-expensive given
   the only execution path (Supabase SQL Editor via browser automation, no
   direct DB network access). Instead, realistic *sample* data is loaded
   module-by-module in dependency order, using real legacy rows wherever
   possible (business-key-joined inserts) plus a small amount of clearly-
   marked synthetic data only where needed to bridge gaps (e.g. purchase
   lines for MFR components whose real purchase history falls outside the
   loaded item-code range).

## Next steps

- [x] Create the staging Supabase project, apply migrations 0001-0004.
- [x] Import a curated sample (not full bulk) covering every v2 module in
      dependency order: `items` (3,500, incl. full packaging set),
      `vendors` (94, full), `purchase_orders`/`purchase_lines` (26/107),
      `mfr_definitions`/`mfr_lines` (18/121), `finished_product_batches`/
      `components` (7/26), `packaging_issues` (22), `inventory_ledger`
      (612, incl. real opening-balance "push" + "wastage" samples),
      `quality_checks` (27, synthesized workflow sample),
      `bmr_records`/`bmr_observations`/`bmr_weighment_lines` (7/21/26),
      `coa_records` (5), `documents` (7), `environmental_control_readings`
      (10), `line_clearance_checks` (7). Full methodology, data-quality
      findings, and newly-discovered schema/trigger behaviors are written
      up in `data-gap-analysis.md`.
- [x] Ran a 31-assertion data-integrity test suite (uniqueness, no negative
      quantities, zero orphaned FKs, `quality_checks` constraint conformance)
      plus functional tests of all 8 code-generation functions and both
      directions of the `finished_product_components`/`bmr_weighment_lines`
      QC-gate trigger (positive: approved purchase_line consumption
      succeeds; negative: rejected purchase_line consumption is correctly
      blocked with `P0001`). All passed — see `data-gap-analysis.md` for
      the full list and results.
- [ ] Decide whether `documents.doc_type` should gain values for label
      templates / COA templates (currently `sop`/`stp` only), per the
      in-scope legacy artifact types noted in `requirements-gap-analysis.md`.
- [ ] If broader test coverage is wanted later: the current sample only
      spans 18 of 248 legacy MFR formulas and 7 of thousands of historical
      batches — deliberately enough to exercise every table/trigger once,
      not a production-scale or statistically representative dataset. A
      follow-up pass could widen the item-code range imported (currently
      `LEG-RM-00001`–`~04144` only) to unlock sampling more/newer batches
      whose real components fall outside that range today.
- [ ] Report back with a summary + any data-quality issues hit along the
      way — done in `data-gap-analysis.md` and in chat.
