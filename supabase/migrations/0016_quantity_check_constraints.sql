-- ============================================================
-- Found during a full-app integrity audit (1 Sept 2026, see
-- claude/known-issues.md): only purchase_lines.quantity and
-- inventory_ledger.quantity have a database-level CHECK against
-- negative/zero values — every other quantity column relies entirely on
-- Server Action validation, so a direct PostgREST insert/update by an
-- otherwise-authorized role could silently corrupt yield/stock math
-- (mfr recipe ratios, actual_yield_pct, on-hand balances, etc).
--
-- All constraints below are added `not valid` deliberately: this means
-- Postgres does NOT scan/reject existing rows when the migration runs (so
-- it cannot fail or be blocked by historical legacy-imported or
-- synthesized-sample data that might already contain an edge-case 0 or
-- null), while still enforcing the check on every INSERT and UPDATE from
-- this point forward. Once you've had a chance to review whether any
-- existing rows would violate these (a query, not a change — ask Claude),
-- each can be flipped to fully validated with, e.g.:
--   alter table public.mfr_lines validate constraint mfr_lines_quantity_positive;
-- That's a separate, optional follow-up — not required for the constraint
-- to protect all future writes.
--
-- Where a field is nullable in the schema (wt_total_rm, wastage,
-- actual_qty), the check allows null and only constrains non-null values,
-- matching how the column is actually used today (e.g. wt_total_rm is
-- filled in once a batch is completed, not at creation).
-- ============================================================

alter table public.mfr_lines
  add constraint mfr_lines_quantity_positive check (quantity > 0) not valid;

alter table public.finished_product_components
  add constraint fp_components_quantity_positive check (quantity > 0) not valid;

alter table public.bmr_weighment_lines
  add constraint bmr_weighment_standard_qty_positive check (standard_qty > 0) not valid;
alter table public.bmr_weighment_lines
  add constraint bmr_weighment_actual_qty_nonnegative check (actual_qty is null or actual_qty >= 0) not valid;

alter table public.finished_product_batches
  add constraint fp_batches_target_qty_positive check (target_qty > 0) not valid;
alter table public.finished_product_batches
  add constraint fp_batches_wt_total_rm_nonnegative check (wt_total_rm is null or wt_total_rm >= 0) not valid;
alter table public.finished_product_batches
  add constraint fp_batches_wastage_nonnegative check (wastage is null or wastage >= 0) not valid;

alter table public.packaging_issues
  add constraint packaging_unit_count_positive check (unit_count > 0) not valid;
alter table public.packaging_issues
  add constraint packaging_qty_used_positive check (packaging_qty_used > 0) not valid;
