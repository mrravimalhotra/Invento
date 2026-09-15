-- ============================================================
-- Ravi (15 Sept 2026): "suggest suitable name for batch number instead of
-- FP-0003 etc." — get_next_fp_batch_number() (0001_init.sql) generated a
-- flat global sequence (FP-0001, FP-0002, FP-0003, ...) via fp_batch_seq,
-- the only code-generation format in the app that doesn't sort or scan
-- meaningfully by time. Presented four options grounded in the app's
-- existing conventions (year-reset like RM-01/26/PKG-01/26, seq+full-date
-- like AR-001-02092026, date-first daily-reset, or leave as is); Ravi
-- picked the year-reset format.
--
-- New format: FP-<2-digit seq>/<2-digit year>, e.g. the 3rd FP batch
-- created in 2026 is FP-03/26, resetting to 01 each calendar year —
-- matches get_next_batch_number()'s RM-/PKG- pattern (0001_init.sql,
-- prefix logic added in 0023_packaging_purchase_batch_prefix.sql) exactly,
-- except the count is global across all Finished Products rather than
-- per-item: RM/PKG batch numbers are scoped per raw material/packaging
-- item because those items are each purchased repeatedly, but FP batches
-- don't have an equivalent natural per-item bucket Ravi asked to reset
-- by — every finished_product_batches row this year counts, regardless of
-- which MFR product it's for.
--
-- Counted from created_at, which is when get_next_fp_batch_number() is
-- actually called (createFinishedProductBatch, at Step 2/compose submit —
-- i.e. batch start time, see 0044_fp_batch_start_date.sql), same as
-- get_next_batch_number() counts purchase_lines.created_at. This is a
-- count(*)+1, not a real sequence, same as get_next_batch_number() — two
-- concurrent batch creations in the same instant could compute the same
-- number, but finished_product_batches.batch_number is `not null unique`
-- (0001_init.sql), so a genuine race fails the second insert with a
-- constraint violation rather than silently assigning a duplicate code —
-- identical to how purchase_lines_item_batch_unique already backstops
-- get_next_batch_number().
--
-- Purely a function replace, no data migration: existing FP-0001-style
-- batch numbers already assigned to rows are NOT rewritten. Batch numbers
-- are immutable once assigned everywhere else in this app (item codes,
-- vendor codes, MFR codes per 0042_mfr_code_prefix.sql) — pre-existing FP
-- batches keep their old 'FP-0001' style codes; only batches created from
-- now on get the new 'FP-NN/YY' format. fp_batch_seq (0001_init.sql) is
-- left in place, unused — harmless, and 0039_purge_test_data.sql already
-- resets it along with the other sequences on test-data purge.
-- ============================================================

create or replace function public.get_next_fp_batch_number()
returns text language plpgsql as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
begin
  select count(*) + 1 into v_n
  from public.finished_product_batches
  where to_char(created_at, 'YY') = v_year;

  return 'FP-' || lpad(v_n::text, 2, '0') || '/' || v_year;
end $$;
