-- ============================================================
-- FB-0044 follow-up (27 Sept 2026): Namrata's original ask was to drop the
-- item-code embedding from batch numbers entirely ("PR01/26" instead of
-- "FP-00002-01/26") — flagged back to Ravi as a direct conflict with his
-- own 21 Sept decision (0051/0055_*_batch_number_embed_item_code.sql),
-- which deliberately embedded the item code to fix a real on-screen
-- collision he'd reported (two different items' first batch of the year
-- both rendering as "RM-01/26"). Ravi then clarified the real constraint:
-- bottle labels have no room to print the long compound batch number.
--
-- Resolution, scoped and confirmed with Ravi via a short back-and-forth in
-- chat (not AskUserQuestion this time — a direct design proposal he
-- confirmed piece by piece): keep the canonical, globally-unique
-- `batch_number` exactly as it is (nothing about 0051/0055 changes) and
-- add a second, print-only `short_batch_no` column that a label can
-- reference instead. It's deliberately NOT globally unique — it reuses the
-- same per-item-scoped sequence number the canonical batch number already
-- has, just with the item code swapped for a short, fixed prefix — because
-- every label template that prints "Batch No." also prints the product
-- name right above it, so the ambiguity that made the bare format
-- confusing on 21 Sept (a shared list with no product context) doesn't
-- exist on a printed label.
--
-- Mid-conversation, Ravi added a real, separate business requirement: some
-- Finished Products are for domestic use and some are for export, decided
-- once per MFR (an MFR is permanently 1:1 with one Finished Product item —
-- 0010_mfr_finished_product_link.sql — so this is really a property of the
-- product, just set where the product is defined). The short batch prefix
-- depends on it: "PR" for domestic, "OR" for export. Confirmed via three
-- follow-up questions, asked one at a time per Ravi's request:
--   1. Market is set once at MFR creation and is NOT editable afterward —
--      same permanence as the MFR's own link to its Finished Product item.
--      No new edit UI needed.
--   2. Every existing MFR (no Market on file) defaults to 'domestic' —
--      Ravi confirmed no existing MFRs need flagging as export instead.
--   3. Existing Finished Product batches already in the new compound
--      format (e.g. FP-00002-01/26) get short_batch_no backfilled — since
--      every existing MFR defaults to domestic, every backfilled row gets
--      the 'PR' prefix. Older flat-style batches (FP-0001, no seq/year to
--      extract) are left null; the label falls back to the full
--      batch_number for those (see label-picker.tsx).
-- ============================================================

-- ------------------------------------------------------------
-- 1. mfr_definitions.market — set once at MFR creation, never changed
--    after. Existing rows default to 'domestic' per Ravi's confirmation.
-- ------------------------------------------------------------
alter table public.mfr_definitions
  add column if not exists market text not null default 'domestic';

alter table public.mfr_definitions
  drop constraint if exists mfr_definitions_market_check;
alter table public.mfr_definitions
  add constraint mfr_definitions_market_check check (market in ('domestic', 'export'));

-- ------------------------------------------------------------
-- 2. finished_product_batches.short_batch_no — nullable, print-only,
--    populated going forward by get_next_fp_batch_number() below and
--    backfilled for existing rows where it's mechanically derivable.
-- ------------------------------------------------------------
alter table public.finished_product_batches
  add column if not exists short_batch_no text;

-- ------------------------------------------------------------
-- 3. create_mfr_definition() — one new parameter, p_market, validated and
--    stored alongside the rest of the header. Everything else in this
--    function (0041_mfr_deferred_approval.sql) is unchanged.
--
--    Adding a parameter changes the argument list, so CREATE OR REPLACE
--    does not replace the old 5-arg function in place — it silently adds a
--    second, overloaded 5-arg-vs-6-with-default function instead, and a
--    5-positional-argument call then fails as ambiguous ("not unique").
--    Caught directly via a local RPC test (calling with the original 5
--    positional args), not assumed — same DROP-FUNCTION-first class of bug
--    already documented above for get_next_fp_batch_number() and fixed by
--    migration 0064 for bulk_create_mfr_definitions(), just triggered by an
--    added parameter instead of a changed return type this time.
-- ------------------------------------------------------------
drop function if exists public.create_mfr_definition(text, numeric, text, uuid, jsonb);

create or replace function public.create_mfr_definition(
  p_name text,
  p_batch_size_qty numeric,
  p_batch_size_unit text,
  p_item_type_id uuid,
  p_lines jsonb,
  p_market text default 'domestic'
)
returns table(id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(both from coalesce(p_name, ''));
  v_market text := coalesce(p_market, 'domestic');
  v_line jsonb;
  v_mfr_code text;
  v_def_id uuid;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to create an MFR definition.';
  end if;

  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if p_batch_size_qty is null or p_batch_size_qty <= 0 then
    raise exception 'Batch size must be greater than 0.';
  end if;
  if p_batch_size_unit is null or p_batch_size_unit = '' then
    raise exception 'Batch size unit is required.';
  end if;
  if v_market not in ('domestic', 'export') then
    raise exception 'Market must be Domestic or Export.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one recipe line.';
  end if;

  if exists (select 1 from public.mfr_definitions where name ilike v_name) then
    raise exception '"%" already exists as an MFR.', v_name;
  end if;

  v_mfr_code := public.get_next_mfr_code();

  insert into public.mfr_definitions (code, name, batch_size_qty, batch_size_unit, item_type_id, market)
    values (v_mfr_code, v_name, p_batch_size_qty, p_batch_size_unit, p_item_type_id, v_market)
    returning mfr_definitions.id into v_def_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if (v_line->>'item_id') is null or (v_line->>'quantity') is null
       or v_line->>'unit' is null or v_line->>'unit' = '' then
      raise exception 'Every recipe line needs an item, quantity, and unit.';
    end if;
    if (v_line->>'quantity')::numeric <= 0 then
      raise exception 'Recipe line quantity must be greater than 0.';
    end if;
    insert into public.mfr_lines (mfr_definition_id, version, item_id, quantity, unit)
      values (v_def_id, 1, (v_line->>'item_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit');
  end loop;

  id := v_def_id;
  code := v_mfr_code;
  return next;
end $$;

-- ------------------------------------------------------------
-- 4. get_next_fp_batch_number() — now returns BOTH the canonical batch
--    number and the short print form together, computed from the exact
--    same v_n/v_year, so the two can never disagree. Signature's return
--    type is changing (text -> table), so the old function must be
--    dropped first — Postgres can't CREATE OR REPLACE across an OUT-column
--    change (same class of issue 0064 fixed for bulk_create_mfr_
--    definitions; confirmed directly rather than assumed, per that
--    migration's own precedent).
-- ------------------------------------------------------------
drop function if exists public.get_next_fp_batch_number(uuid);

create or replace function public.get_next_fp_batch_number(p_mfr_definition_id uuid)
returns table(batch_number text, short_batch_no text)
language plpgsql as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
  v_item_code text;
  v_market text;
  v_seq_year text;
  v_short_prefix text;
begin
  select i.item_code, m.market into v_item_code, v_market
  from public.mfr_definitions m
  join public.items i on i.id = m.finished_product_item_id
  where m.id = p_mfr_definition_id;

  select count(*) + 1 into v_n
  from public.finished_product_batches
  where mfr_definition_id = p_mfr_definition_id and to_char(created_at, 'YY') = v_year;

  v_seq_year := lpad(v_n::text, greatest(2, length(v_n::text)), '0') || '/' || v_year;
  -- Domestic -> PR, Export -> OR. coalesce covers a null market the same
  -- way v_item_code is already coalesced below (defensive, not expected in
  -- practice since the column is not null default 'domestic').
  v_short_prefix := case coalesce(v_market, 'domestic') when 'export' then 'OR' else 'PR' end;

  batch_number := coalesce(v_item_code, 'FP') || '-' || v_seq_year;
  short_batch_no := v_short_prefix || '-' || v_seq_year;
  return next;
end $$;

-- ------------------------------------------------------------
-- 5. Backfill short_batch_no for existing batches already in the compound
--    <item_code>-<seq>/<year> format (0051/0055's format) — mechanically
--    derivable by pulling the trailing "-<seq>/<year>" back off the
--    existing batch_number. Every existing MFR defaults to 'domestic'
--    (confirmed with Ravi — no exceptions to flag), so every backfilled
--    row gets the 'PR' prefix. Older flat 'FP-0001'-style batches have no
--    seq/year to extract (the regex simply won't match) and are correctly
--    left null; label-picker.tsx falls back to the full batch_number for
--    those. batch_number is immutable/never rewritten by this migration —
--    only the new, additive short_batch_no column is touched.
-- ------------------------------------------------------------
update public.finished_product_batches
set short_batch_no = 'PR-' || substring(batch_number from '-(\d+/\d{2})$')
where short_batch_no is null
  and batch_number ~ '-\d+/\d{2}$';
