# Module 23 — Opening Stock

Requested by Ravi (3 Oct 2026, FB-0054 / B4): add opening stock for raw material, packaging and
finished product before go-live. Part 1 (migration 0100) covers raw material and packaging; part 2 (migration 0101) covers finished
product, packed and bulk.

## Decisions (Ravi)
- Source: the physical stock count sheet. Raw material QC status is per row: Approved, Pending QC or Rejected.
- Vendor and unit price are optional. Rows with no vendor use the system vendor `V-OPENING`.
- All roles may load. Loading is open during testing; the System Administrator closes it by hand after the
  agreed cut-off. The app stores no cut-off date. The System Administrator can re-open it and can undo a
  load while loading is open and nothing from it has been used (both audited).
- The app tells new and legacy batches and AR numbers apart: `purchase_lines.is_legacy` and
  `quality_checks.is_legacy`. Old batch numbers and AR numbers are kept as typed; numbers that look
  app-made (`ITEM-0001/26`, `ARRM-0001/26`, `ARFP-0001/26`) are refused.

## How it works
- Tables: `opening_stock_settings` (one row, `is_open`), `opening_loads` (OPN-0001…, kind, row count, summary).
- `load_opening_stock(kind, rows)` (security definer, any role while open): one submitted purchase record per
  vendor (`OPN-0001-01`, invoice `OPENING OPN-0001`), purchase lines dated at the receipt date (so oldest-first
  and "RM Report as on" work), ledger push per line. Approved/Rejected raw material gets a closed QC record
  with the old AR, approval date, retest period (retest date − approval date), expiry date,
  `legacy_retests_done`. Pending QC gets none and keeps its expiry on the purchase line, which the Reviewer
  starts from. All or nothing.
- `set_opening_stock_open(bool)` and `undo_opening_load(id)`: System Administrator only. Undo refuses when
  stock was used (any ledger row beyond the opening push) or a new QC record was started.
- `purge_test_data()` also clears loads and restarts the OPN counter and the AR counters.
- Retest limit (FB-0061) counts `legacy_retests_done` plus retest records (`lib/qc-retests.ts`).

## Screens
- Admin → Opening Stock (`/opening-stock`): open/closed banner with Close/Re-open, one card per kind
  (template download, Check file, Load N rows), Loads table with Undo. Template route
  `/api/opening-stock/template/[kind]`. Checks in `lib/opening-stock/validate.ts`, actions in
  `lib/actions/opening-stock.ts`.
- Legacy tag (`components/ui/legacy-tag.tsx`) on QC list/detail, RM Report, item batch table, purchase lines,
  label and COA pickers. Source filter (All/New/Legacy) and Source export column on QC list and RM Report.

## Finished product (part 2, migration 0101)
- Sheet columns: Product Code*, Batch No*, Manufacture date*, Expiry date*, Bulk quantity unpacked, Packs in stock,
  Pack size, Old AR No*, QC approval date* (always Approved). Pack size is one text cell such as `100 ml`
  (`parsePackSize` in `lib/opening-stock/validate.ts`).
- `load_opening_finished_product(rows)` (security definer, any role while open) writes per row: an approved
  `finished_product_batches` row (`is_legacy`, `opening_load_id`; yield = bulk + packs × pack size in the batch
  unit; `finish_date`/`batch_start_date` = manufacture date), an `fp_yield` ledger push, an approved legacy
  `quality_checks` row carrying the old AR, and, when packs exist, one Store `packaging_issues` row (issue date =
  approval date) whose triggers move the bulk into the packaged item. Batch numbers must not look app-made and
  must be unique; AR numbers must not look app-made and must be unique.
- `fp_completion_fields_required_together` now accepts `is_legacy` rows (NOT VALID, still enforced for new rows).
- `undo_opening_load` also handles finished loads. It refuses when later packaging issues, other ledger rows,
  non-legacy QC rows or COA records exist on the batch; otherwise removes ledger, issues, QC, batches and the load.
- Tests: `supabase/tests/opening_stock_0101_fp.sql` (suite `os101`).

## Legacy tag coverage (5 Oct 2026)
Also on: Reports (QC Register, FP Register, Purchase Register: tag, Source filter, Source column in Excel/PDF),
COA list and detail, Inventory Ledger (raw and finished product batch, Source column), Purchase order list
(opening POs, Source filter), item page FP batches, QC Awaiting QC and Due for retest cards, Dashboard
retest/expiry alerts, the Finished Product composition (raw material batches) and the Wastage and Packaging
batch pickers (text "(Legacy)"). Lists built on the `purchase_line_qc` view find opening lines through
`lib/opening-stock/legacy-lines.ts`.

## Not yet
- A reopened opening-stock purchase order can still be edited like any other.
