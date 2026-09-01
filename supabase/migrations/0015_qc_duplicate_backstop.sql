-- ============================================================
-- Backstop for a check-then-insert race found during a full-app integrity
-- audit (1 Sept 2026, see claude/known-issues.md), present in both places
-- quality_checks rows get created:
--
--   - createQualityCheck() (lib/actions/qc.ts) reads purchase_batch_status
--     for the chosen purchase_line, and only inserts if it's still
--     'not_submitted'.
--   - submitFinishedProductToQc() (lib/actions/finished-product.ts) reads
--     the batch's status, and only inserts if it's still 'in_process'.
--
-- Both are two separate round trips (read, then insert) with nothing
-- serializing them — two concurrent submissions against the same
-- purchase_line or the same finished-product batch can both pass the
-- check and both insert, producing two AR numbers (and, for the RM side,
-- two automatic sample-pull ledger events) for what the app's own rules
-- say should be a single QC record per batch.
--
-- A unique constraint on each of the two "subject" columns is a correct
-- backstop, not an overreach: quality_checks already enforces (via a check
-- constraint, 0001_init.sql) that exactly one of purchase_line_id /
-- finished_product_batch_id is set per row, and both app paths above
-- already treat "one ever" as the rule (submitting again once a record
-- exists — approved, rejected, or still submitted — is already refused).
-- Postgres unique constraints allow unlimited NULLs, so RM-only rows
-- (finished_product_batch_id null) and FP-only rows (purchase_line_id
-- null) are both unaffected — only a genuine duplicate on the non-null
-- side is now rejected at the database level.
--
-- Standalone, additive migration. Should not fail on existing data: the
-- 31-assertion integrity check run during the sample data load already
-- confirmed no such duplicates exist in that data (claude/data-gap-
-- analysis.md), and both app code paths have refused re-submission since
-- day one — but if it does fail, stop and tell Claude the exact error
-- rather than editing/deleting rows yourself.
-- ============================================================

alter table public.quality_checks
  add constraint quality_checks_purchase_line_unique unique (purchase_line_id);

alter table public.quality_checks
  add constraint quality_checks_fp_batch_unique unique (finished_product_batch_id);
