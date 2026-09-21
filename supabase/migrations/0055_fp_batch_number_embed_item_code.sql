-- ============================================================
-- Finished Product batch numbers: embed the FP item's own item_code and
-- scope the per-year sequence per FP item, matching Raw Material/
-- Packaging batch numbers exactly.
--
-- Ravi (21 Sept 2026), looking at a Finished Product batch detail page
-- showing "FP-01/26" next to Composition rows reading "RM-00001-01/26" /
-- "RM-00002-03/26": "Finished product batch number should be in same
-- format as of Raw material Batch Number. Also what happens when finished
-- product batch number reaches FP-99/26?"
--
-- This is the exact follow-up 0051_batch_number_embed_item_code.sql's own
-- "Scope note" flagged and deliberately left open: that migration embedded
-- each RM/PKG item's item_code into ITS batch numbers (RM-01/26 ->
-- RM-00001-01/26) because two different items' first purchase of a year
-- otherwise rendered the identical string. get_next_fp_batch_number()
-- (0045_fp_batch_number_year_reset.sql) was never touched — it still
-- returns a bare 'FP-<seq>/<year>' counted GLOBALLY across every Finished
-- Product batch of any MFR created that year, not per finished product.
-- So today two different MFRs' first FP batch of the year collide on
-- screen exactly the same way RM/PKG items used to (both would show
-- "FP-01/26"), and — Ravi's second question — get_next_fp_batch_number()
-- still pads with the pre-0052 exact-width `lpad(v_n::text, 2, '0')`,
-- which Postgres TRUNCATES rather than skips once v_n reaches 3 digits
-- (confirmed in 0052: lpad('100', 2, '0') = '10'). Globally-counted FP
-- batches are a much smaller number than per-item RM purchases in
-- practice, but the 100th FP batch of any kind created in one calendar
-- year would silently compute 'FP-10/26' again — the exact same batch
-- number as that year's real 10th FP batch — and the insert would fail on
-- finished_product_batches.batch_number's `unique` constraint with a raw
-- 23505 error, since createFinishedProductBatch() (lib/actions/
-- finished-product.ts) has no retry loop around this call (unlike
-- createPurchaseLine(), which retries a few times specifically because
-- get_next_batch_number() has the same count()+1 shape — see that
-- function's own comment).
--
-- Fix, mirroring 0051 + 0052 in one pass so FP batch numbers never need
-- their own follow-up truncation fix later:
--   1. Scope the sequence per Finished Product item, not globally. Every
--      MFR is linked 1:1 to exactly one 'processed'-category item via
--      mfr_definitions.finished_product_item_id (0010_mfr_finished_
--      product_link.sql, unique both ways) — and that link is set once
--      and never changes across MFR versions (mfr_definitions is a single
--      row whose `version` column is bumped in place, not re-inserted —
--      0001_init.sql). So counting finished_product_batches rows by
--      mfr_definition_id is exactly counting them by FP item.
--   2. Format as '<item_code>-<seq>/<year>', e.g. the 3rd FP batch of
--      MFR-0001 / item FP-00001 created in 2026 is 'FP-00001-03/26' —
--      byte-for-byte the same shape as 'RM-00001-01/26'.
--   3. Pad with `greatest(2, length(v_n::text))` (0052's fix) from the
--      start, so hitting 100 FP batches of the same product in one year
--      renders 'FP-00001-100/26' correctly instead of truncating to
--      'FP-00001-10/26' and colliding.
--
-- Defensive fallback: finished_product_item_id is nullable (pre-0010 MFRs,
-- or a 'processed' item created directly through Item Master before that
-- change existed, predate the link and have no counterpart) — 0010's own
-- comment says every MFR created from here on always sets it, but this
-- function still coalesces to the bare 'FP' prefix if a linked item_code
-- can't be found, rather than raising and blocking batch creation
-- entirely for one of those legacy rows.
--
-- Signature change: get_next_fp_batch_number() -> get_next_fp_batch_number
-- (p_mfr_definition_id uuid) — its one caller (createFinishedProductBatch,
-- lib/actions/finished-product.ts) already has mfrDefinitionId in scope at
-- the call site, so this is a one-line change there, included in this same
-- patch. No data migration: existing FP batch numbers already assigned
-- (both the original flat 'FP-0001' style and the 2026 'FP-NN/26' style)
-- are immutable and left exactly as stored, same as every other batch/code
-- format change in this app.
-- ============================================================

create or replace function public.get_next_fp_batch_number(p_mfr_definition_id uuid)
returns text language plpgsql as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
  v_item_code text;
begin
  select i.item_code into v_item_code
  from public.mfr_definitions m
  join public.items i on i.id = m.finished_product_item_id
  where m.id = p_mfr_definition_id;

  select count(*) + 1 into v_n
  from public.finished_product_batches
  where mfr_definition_id = p_mfr_definition_id and to_char(created_at, 'YY') = v_year;

  return coalesce(v_item_code, 'FP') || '-' || lpad(v_n::text, greatest(2, length(v_n::text)), '0') || '/' || v_year;
end $$;

-- The old zero-argument signature is superseded, not just shadowed — drop
-- it so nothing can call the global-count version by accident (Postgres
-- allows overloads by argument count, and the old signature has no
-- remaining callers to preserve — see the header comment).
drop function if exists public.get_next_fp_batch_number();
