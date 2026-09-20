-- ============================================================
-- Fix a latent truncation bug in get_next_batch_number(), found by
-- Ravi asking "what happens if in a year the batch number reaches
-- RM-00001-99/26?" right after the 0051 migration shipped.
--
-- 0051 (and, before it, the original 0001_init.sql /
-- 0023_packaging_purchase_batch_prefix.sql) formatted the per-item/year
-- sequence with `lpad(v_n::text, 2, '0')`. Postgres's lpad() TRUNCATES
-- its input when it's already longer than the target width (confirmed
-- directly: `lpad('100', 2, '0')` returns '10', not '100') — it does not
-- just skip padding. So the 100th purchase of the same item in the same
-- calendar year would silently compute the exact same batch-number
-- string as that item's real 10th purchase of the year: '10/26' either
-- way. In practice this wouldn't corrupt data — the
-- purchase_lines_item_batch_unique index (0013) would reject the insert
-- with a 23505 — but createPurchaseLine()'s retry logic recomputes the
-- identical wrong value every time (the count hasn't changed), so it
-- would retry 3 times and then fail outright with a generic duplicate-
-- batch error, with nothing pointing at the real cause.
--
-- Fix: pad to *at least* 2 digits instead of *exactly* 2 digits, via
-- `greatest(2, length(v_n::text))` as the lpad width. Every value under
-- 100 renders byte-for-byte identically to before (09, 42, 99); 100 and
-- above now render as the real number (100, 101, ...) instead of being
-- cut down to 2 digits. Confirmed directly against local Postgres:
-- lpad('9',2,'0')='09', lpad('99',2,'0')='99' (unchanged),
-- lpad('100', greatest(2,3), '0') = '100', lpad('101', greatest(2,3),
-- '0') = '101' (fixed, no collision).
--
-- Purely a function replace, same signature, no data migration, no
-- schema change — every batch number already issued stays exactly as
-- stored (none of them were ever >= 100 within one item/year, so none of
-- them could have hit the bug this closes). Same callers as 0051
-- (lib/actions/purchase.ts createPurchaseLine, bulk_create_purchase_
-- orders in 0038_bulk_upload_purchase.sql) — opaque string, no app-code
-- change needed.
-- ============================================================

create or replace function public.get_next_batch_number(p_item_id uuid)
returns text language plpgsql as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
  v_item_code text;
begin
  select item_code into v_item_code from public.items where id = p_item_id;

  select count(*) + 1 into v_n from public.purchase_lines
  where item_id = p_item_id and to_char(created_at, 'YY') = v_year;

  return v_item_code || '-' || lpad(v_n::text, greatest(2, length(v_n::text)), '0') || '/' || v_year;
end $$;
