-- ============================================================
-- "Add vendor functionality should be available in the same screen as of
-- Vendor page. The next assigned vendor code should be visible in the add
-- vendor page" + "while adding new Item, next assigned Item Code should be
-- visible e.g. RM-00005"
--
-- Both get_next_item_code() and get_next_vendor_code() call nextval() —
-- calling either just to show a preview would burn a real code number
-- (sequences are non-transactional; a rolled-back or abandoned page load
-- would still permanently skip that number). These two functions instead
-- read the sequence's current state (last_value/is_called) without
-- advancing it, so the New Item / Add Vendor screens can show what code
-- WILL be assigned without consuming it.
--
-- Caveat, by design: this is a best-effort preview, not a reservation. If
-- two people load the form at the same time, both see the same next code,
-- but only one of them gets it — the actual value always still comes from
-- get_next_item_code()/get_next_vendor_code() (nextval) at insert time in
-- createItem()/createVendor(), so the assigned code is always correct and
-- unique even if the preview briefly went stale.
-- ============================================================

create or replace function public.peek_next_item_code(p_category text)
returns text language plpgsql stable as $$
declare
  v_num bigint;
  v_prefix text;
  v_seq regclass;
begin
  if p_category = 'packaging' then
    v_seq := 'public.item_code_seq_pkg'; v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_seq := 'public.item_code_seq_fp'; v_prefix := 'FP';
  else
    v_seq := 'public.item_code_seq_raw'; v_prefix := 'RM';
  end if;

  execute format(
    'select case when is_called then last_value + 1 else last_value end from %s',
    v_seq
  ) into v_num;

  return v_prefix || '-' || lpad(v_num::text, 5, '0');
end $$;

create or replace function public.peek_next_vendor_code()
returns text language sql stable as $$
  select 'V-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    4, '0'
  )
  from public.vendor_code_seq;
$$;
