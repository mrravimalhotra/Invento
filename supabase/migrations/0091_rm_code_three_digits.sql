-- ============================================================
-- FB-0045 (1 Oct 2026, Namrata Gaikwad): "RM code 001 (3 digit) not 00001".
-- Ravi: "make RM code 001 (3 Digit) not 00001. Make sure overflow issue is
-- taken care when RM code reaches RM999".
--
-- New Raw Material item codes are RM-001, RM-002 ... RM-999, and then RM-1000,
-- RM-1001 ...: the number is padded to AT LEAST three digits, never cut, so
-- reaching 999 cannot truncate, repeat an earlier code or raise an error.
-- (Same shared helper as 0069: _pad_seq_code(number, width).)
--
-- Only Raw Material changes. Packaging (PKG-00001), Finished Product (FP-00001),
-- packaged Finished Product (PKG-FP-00001) and Production raw material
-- (RM-FP-00001) keep five digits.
--
-- Existing items keep the code they have (RM-00001 stays RM-00001). The
-- sequence is not reset, so the next new Raw Material code continues the
-- number (for example after RM-00045 the next one is RM-046); a new code can
-- never equal an old one.
-- The "next code" preview on New item (peek_next_item_code) is changed in the
-- same way so it always shows what will be assigned.
--
-- No table, no data and no app code is touched; signatures and return types
-- are unchanged (CREATE OR REPLACE only). Has a built-in self-check.
-- ============================================================

begin;

create or replace function public.get_next_item_code(p_category text)
returns text language plpgsql as $$
declare v_num int; v_prefix text; v_width int := 5;
begin
  if p_category = 'packaging' then
    v_num := nextval('public.item_code_seq_pkg'); v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_num := nextval('public.item_code_seq_fp'); v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_num := nextval('public.item_code_seq_pkgfp'); v_prefix := 'PKG-FP';
  else
    v_num := nextval('public.item_code_seq_raw'); v_prefix := 'RM'; v_width := 3;
  end if;
  return v_prefix || '-' || public._pad_seq_code(v_num::text, v_width);
end $$;

create or replace function public.peek_next_item_code(p_category text)
returns text language plpgsql stable as $$
declare
  v_num bigint;
  v_prefix text;
  v_seq regclass;
  v_width int := 5;
begin
  if p_category = 'packaging' then
    v_seq := 'public.item_code_seq_pkg'; v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_seq := 'public.item_code_seq_fp'; v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_seq := 'public.item_code_seq_pkgfp'; v_prefix := 'PKG-FP';
  else
    v_seq := 'public.item_code_seq_raw'; v_prefix := 'RM'; v_width := 3;
  end if;

  execute format(
    'select case when is_called then last_value + 1 else last_value end from %s',
    v_seq
  ) into v_num;

  return v_prefix || '-' || public._pad_seq_code(v_num::text, v_width);
end $$;

-- Self-check: the padding the Raw Material generator now uses, at and around
-- the 999 boundary, and that the other categories are unchanged.
do $$
begin
  if public._pad_seq_code('1', 3) <> '001' or public._pad_seq_code('45', 3) <> '045'
     or public._pad_seq_code('999', 3) <> '999' or public._pad_seq_code('1000', 3) <> '1000'
     or public._pad_seq_code('12345', 3) <> '12345' then
    raise exception '0091 self-check failed: 3-digit padding is wrong.';
  end if;
  if public._pad_seq_code('1', 5) <> '00001' or public._pad_seq_code('100000', 5) <> '100000' then
    raise exception '0091 self-check failed: 5-digit padding changed.';
  end if;
  if position('v_width := 3' in pg_get_functiondef('public.get_next_item_code(text)'::regprocedure)) = 0
     or position('v_width := 3' in pg_get_functiondef('public.peek_next_item_code(text)'::regprocedure)) = 0 then
    raise exception '0091 self-check failed: a generator is missing the 3-digit Raw Material width.';
  end if;
end $$;

commit;
