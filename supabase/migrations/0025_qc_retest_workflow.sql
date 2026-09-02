-- ============================================================
-- Part B of the "Re-Test" feature (see claude/known-issues.md, Eighth
-- pass): "Once Re-Test date has come, Item should go through QC again
-- using the stability sample already available."
--
-- The trigger for this workflow is quality_checks.retest_date — the
-- QC-computed column already populated by trg_fn_qc_compute_retest_date
-- (reviewed_at + retest_period_days, 0001_init.sql) and already surfaced
-- on the Dashboard's "Retest due soon" card, the QC list/detail pages,
-- Labels, and the QC Register report. It is NOT purchase_lines.expiry_date
-- (the hand-entered field renamed "Re-Test Date" on the Purchase screen
-- in Part A) — that field stays a purchase-time reference value and is
-- untouched by this migration. Confirmed with the user via AskUserQuestion
-- before building this.
--
-- A genuine retest cycle means a second (third, ...) quality_checks row
-- against the same purchase_line_id, dated later, pulling from the
-- stability_qty already reserved at Purchase time (fp_stability_rnd_qty,
-- 0021) rather than a fresh sample pull — trg_fn_qc_sample_pull
-- (0002_transactions.sql) already logs an inventory_ledger 'pull' event
-- for ANY quality_checks insert with purchase_line_id set and sample_qty
-- > 0, so inserting sample_qty = stability_qty is enough; no trigger
-- changes are needed. purchase_batch_status's lateral join (0001_init.sql,
-- "order by created_at desc limit 1") already returns the latest QC row's
-- qc_status/retest_date/ar_number per line, so it already supports
-- multiple historical rows with zero view changes.
--
-- The one real blocker: quality_checks_purchase_line_unique
-- (0015_qc_duplicate_backstop.sql) permits at most one quality_checks row
-- ever per purchase_line_id, which was correct before this feature existed
-- (it was a backstop against a check-then-insert race, not a deliberate
-- "one QC per batch, forever" rule) but now conflicts with the whole
-- point of a retest history. Replacing it with a partial unique index
-- scoped to status = 'submitted' preserves the original invariant this
-- codebase actually needs — no two concurrent *unreviewed* QC records
-- against the same batch — while allowing unlimited reviewed
-- (approved/rejected) rows to accumulate as dated history. Partial unique
-- indexes are an established idiom here (0013_batch_number_integrity.sql
-- excludes LEG- rows the same way).
--
-- is_retest flags which quality_checks rows came from this new workflow
-- (vs. the original Purchase -> QC assignment), so the UI can show a
-- "(Retest)" indicator without having to infer it from row order.
-- Additive, nullable-default column — no backfill needed, existing rows
-- default to false (correctly: they are all original assignments).
--
-- `drop constraint if exists`, not a bare `drop constraint`: running this
-- against the live project (2 Sept 2026) surfaced that
-- quality_checks_purchase_line_unique never actually existed there —
-- 0015_qc_duplicate_backstop.sql's *other* constraint
-- (quality_checks_fp_batch_unique) is present, but its purchase_line_id
-- twin apparently failed silently when 0015 was originally run and was
-- never caught (the app-level check-then-insert in createQualityCheck()
-- masked the gap — no observed incident). `if exists` makes this
-- migration a correct no-op for that half on a project where it's
-- already missing, and still drops it cleanly on one where 0015 ran in
-- full.
-- ============================================================

alter table public.quality_checks
  drop constraint if exists quality_checks_purchase_line_unique;

create unique index if not exists quality_checks_purchase_line_pending_unique
  on public.quality_checks (purchase_line_id)
  where status = 'submitted';

alter table public.quality_checks
  add column if not exists is_retest boolean not null default false;
