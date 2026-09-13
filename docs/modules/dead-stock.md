# Module 18 — Dead Stock Register

Not part of the original 15-module baseline. Requested per the
open-requirements-log gap analysis (12-13 Sept 2026): spec.md 4.3 "Asset
Register: Dead Stock Log — track purchase date, original value, and 25%
Depreciation to show Balance Value." Migration:
`0035_dead_stock_register.sql`.

## Screens
- `/dead-stock` — add-form-and-list combined screen (same pattern as
  Vendor Master), sorted by asset code. Columns: Code, Article, Purchased,
  Qty, Purchase price/unit, Depreciation %, Depreciated value/unit, Balance
  qty, Balance value.
- `/dead-stock/[id]` — edit screen; read-only fallback for users without
  write access.

## Data
`dead_stock_items(asset_code, article_name, date_of_purchase, quantity,
purchase_price, depreciation_pct, depreciated_unit_value, resolution_date,
rejected_qty, rejected_value, balance_qty, balance_value, remark, active)`.
`asset_code` is auto-generated (`DS-0001...`) via
`get_next_dead_stock_code()`/`peek_next_dead_stock_code()`, same
non-consuming-preview pattern as Vendor/Item Master.

`purchase_price` is a **per-unit** price, not a line total — confirmed by
reconciling the real source spreadsheet's one worked example against its
own numbers (Qty 4, Purchase Price 40000, 25% depreciation → "Value"
30000, Balance Qty 3 → "Value" 90000: this only holds together if 40000 is
the per-unit price). `depreciated_unit_value` is a generated column —
`purchase_price × (100 − depreciation_pct) / 100` — the value one unit is
still worth after depreciation, not the amount lost to it.

`balance_qty`/`balance_value` are deliberately plain editable fields, not
an auto-computed running ledger like Inventory Ledger's push/pull model.
Per Ravi (13 Sept 2026): this register is reviewed and adjusted by hand a
few times a year in practice (the real spreadsheet has exactly one worked
example row, not a transactional history), so a v1 that mirrors that —
record a rejection, manually update the balance — is lower-risk than
building disposal-event triggers for a low-volume module. `rejected_value`
is likewise manual: a written-off unit's value in the source data is a
business call (0), not a formula.

No seed data — the source spreadsheet contains only the one worked
example, a template for the field set rather than a historical backlog.

## Role / access
Write gated to `system_admin`, `inventory_manager`, `mfr_manager`,
`quality_checker`, `qc_reviewer` — same role set as Equipment, applied
consistently per Ravi's 13 Sept 2026 decision. Enforced via
`canWrite(user.roles, "dead_stock")` and by RLS
(`dead_stock_items_insert`/`dead_stock_items_update`). Delete is split out
and kept admin-only (`dead_stock_items_delete`), matching the convention
set in `0009_master_data_delete_policy.sql`. Read is open to any
signed-in user.

## Not done in this pass
- No auto-computed running ledger for balance qty/value (see above) — a
  reasonable follow-up if write-offs turn out to happen often enough to
  want automatic reconciliation.
- No dedicated "resolution" workflow (a formal review/approval step for
  applying a rejection) — `resolution_date` is a plain field, not a
  sign-off chain like BMR's Prepared/Checked/Approved.
