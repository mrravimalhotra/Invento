-- ============================================================
-- Embed the item code in generated batch numbers.
--
-- get_next_batch_number(p_item_id) (0001_init.sql, category-prefix
-- revision in 0023_packaging_purchase_batch_prefix.sql) has always scoped
-- its sequence per (item_id, year) but labeled every item with the same
-- bare "<category-prefix>-<seq>/<year>" string — e.g. "RM-01/26". That
-- means any two raw-material items' first purchase of a year collide on
-- the exact same batch number text (item_id is still what's actually
-- unique — see purchase_lines_item_batch_unique, 0013 — so nothing was
-- ever ambiguous in the data; it only read as a collision on screen).
-- Flagged by Ravi from the live Awaiting QC list (RM-00001 and RM-00002
-- both showing "RM-01/26"); this was confirmed working-as-designed, and
-- Ravi asked for the batch number itself to be unique/self-identifying
-- rather than just the underlying row.
--
-- Fix: fold the item's own item_code (already globally unique, already
-- the format users recognize from Item Master: RM-00001 / PKG-00001) into
-- the batch number in place of the plain category prefix. New format:
--   <item_code>-<seq>/<year>   e.g. "RM-00001-01/26", "PKG-00006-03/26"
-- instead of the old "RM-01/26" / "PKG-03/26".
--
-- Purely a function replace, same signature, same per-(item,year)
-- counting logic (unchanged, so this doesn't renumber or reset any
-- existing sequence) — only the label format changes. No data migration:
-- every batch number already issued (including legacy 'LEG-%' rows, which
-- this function never touches) is left exactly as stored. Every caller
-- (lib/actions/purchase.ts createPurchaseLine, and bulk_create_purchase_
-- orders in 0038_bulk_upload_purchase.sql) goes through this one RPC and
-- treats the result as an opaque string, so no app-side code needs to
-- change. purchase_lines_item_batch_unique (0013) stays keyed on
-- (item_id, batch_number) — still correct, just now also incidentally
-- globally unique since item_code is embedded.
--
-- Scope note: get_next_fp_batch_number() and the production-batch
-- numbering added in 0050_production_rm_from_packaging.sql are separate
-- functions, not touched here — Ravi's report was specifically about
-- purchase/raw-material batch numbers. Flagging in chat, not folding in
-- silently: worth a separate look if the same visual-collision question
-- applies there too.
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

  return v_item_code || '-' || lpad(v_n::text, 2, '0') || '/' || v_year;
end $$;
