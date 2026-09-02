-- ============================================================
-- Packaging items are now purchasable (2 Sept 2026)
--
-- Per direct request: "In Purchase Screen - there should be option to
-- choose Purchase Raw Material or Packaging Item. For Packaging Item, no
-- need to capture QC, R&D or Stability Sample." Until now, /purchase only
-- ever offered category='raw' items — there was no way to buy more
-- packaging stock through the app at all (Packaging Issue only ever
-- consumed existing stock; packaging items' only inventory came from the
-- legacy import's opening balances). The app-side change adds a Raw
-- Material / Packaging Item toggle to the Add-line and Edit-line forms and
-- hides QC/Stability/R&D/Sample-unit capture for packaging lines entirely
-- (no schema change needed there — qc_qty/stability_qty/rnd_qty already
-- default to 0 server-side when the form doesn't send them).
--
-- This migration covers the one thing that DOES need a DB-side change:
-- get_next_batch_number(p_item_id) (0001_init.sql) hard-coded the 'RM-'
-- prefix on every batch number it generated, regardless of the item's
-- category — a packaging purchase would have been assigned a batch number
-- like "RM-01/26", which is wrong and inconsistent with the item-code
-- convention already in place (items.item_code uses RM-/PKG-/FP- per
-- category, see get_next_item_code() in 0007_item_code_fp_and_sample_
-- unit.sql). Rewritten to look up the item's category and prefix
-- accordingly: 'PKG-' for packaging, 'RM-' for everything else (raw is
-- the only other category ever purchased here — processed/Finished
-- Product items never go through Purchase).
--
-- Purely a function replace — no data migration, nothing destructive.
-- purchase_lines_item_batch_unique (0013_batch_number_integrity.sql) is
-- keyed on (item_id, batch_number) regardless of prefix, so this doesn't
-- affect that constraint or the per-item/year counting logic at all, only
-- the label.
-- ============================================================

create or replace function public.get_next_batch_number(p_item_id uuid)
returns text language plpgsql as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
  v_category text;
  v_prefix text;
begin
  select category into v_category from public.items where id = p_item_id;
  v_prefix := case when v_category = 'packaging' then 'PKG' else 'RM' end;

  select count(*) + 1 into v_n from public.purchase_lines
  where item_id = p_item_id and to_char(created_at, 'YY') = v_year;

  return v_prefix || '-' || lpad(v_n::text, 2, '0') || '/' || v_year;
end $$;
