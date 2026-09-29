-- ============================================================
-- One stock unit per item (accuracy audit ACC-02, ACC-03, ACC-04 —
-- claude/app-accuracy-audit-2026-09-28.md; Ravi, 29 Sept 2026: "yes Start
-- Implementing").
--
-- The problem: quantities were stored in whatever unit a line was typed in
-- (a kg item bought once as 500 g, a recipe line in g for a kg item, a
-- finished-product batch in g for an MFR sized in kg) and every stock
-- figure then added them up as if they were one unit — e.g. 10 kg + 500 g
-- showed as 509.9 kg on hand, and a 500 g recipe line took 500 kg out of a
-- kg batch.
--
-- The rule from now on: every item has ONE stock unit — the unit on its
-- Item Master record. Users can still type a quantity in a related unit
-- (g or mg for a kg item, ml for a ltr item); the database converts it to
-- the item's unit when it is saved. A unit that can't be converted (e.g.
-- "nos" for a kg item) is refused with a clear message. So stock, the
-- ledger, batch remaining quantities, recipe scaling and reports always
-- work in one unit per item.
--
--   1. purchase_lines: quantity, QC/Stability/R&D quantities AND the unit
--      price are converted (500 g @ ₹0.50/g is saved as 0.5 kg @ ₹500/kg —
--      the line value is unchanged).
--   2. mfr_lines (recipe lines): quantity converted to the item's unit.
--   3. finished_product_batches: the batch is always in its MFR's
--      batch-size unit (target entered as 50,000 g for a 100 kg MFR is
--      saved as 50 kg), so recipe scaling is always like-for-like.
--   4. packaging_issue_items (packaging materials): converted to the item's
--      unit.
--   5. inventory_ledger (safety net under everything): every stock movement
--      is stored in its item's unit — converted if needed, labelled with the
--      item's unit where the writer left the unit blank (e.g. raw material
--      consumed by a finished-product batch). Nothing can add mixed units
--      to stock again, whatever screen or import wrote it.
--   6. items: an item's unit can't be changed once it has purchases,
--      recipes, stock movements or packaging records (it would silently
--      change the meaning of every stored quantity). An item with no unit
--      set yet takes the unit of its first use.
--
-- Existing data: production has no rows in a different unit from their
-- item (audit-impact-check.sql, 29 Sept 2026 — all zero), and all data is
-- test data (Ravi, 29 Sept 2026), so no back-conversion is needed.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Helper: the item's stock unit, and the factor to convert into it
-- ------------------------------------------------------------
-- Returns the item's unit. If the item has no unit yet, it adopts p_unit
-- (the first unit it is used with) and returns that.
create or replace function public._item_stock_unit(p_item_id uuid, p_unit text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
begin
  select unit into v_unit from public.items where id = p_item_id;
  if v_unit is null and p_unit is not null then
    update public.items set unit = p_unit where id = p_item_id and unit is null;
    v_unit := p_unit;
  end if;
  return v_unit;
end $$;

-- Factor that converts a quantity in p_from into p_to (1 when equal).
-- Raises a user-facing message when the units can't be converted.
create or replace function public._unit_factor(p_from text, p_to text, p_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_factor numeric;
  v_name text;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return 1;
  end if;
  v_factor := public.convert_unit(1, p_from, p_to);
  if v_factor is null then
    select item_code || ' — ' || name into v_name from public.items where id = p_item_id;
    raise exception '% is kept in stock in "%", so a quantity in "%" can''t be used for it. Enter it in % (or a unit that converts to it).',
      coalesce(v_name, 'This item'), p_to, p_from, p_to
      using errcode = 'P0001';
  end if;
  -- Unit ratios are powers of ten; drop the trailing zeros numeric
  -- division leaves (0.00100000000000000000 → 0.001).
  return trim_scale(v_factor);
end $$;

-- ------------------------------------------------------------
-- 1. Purchase lines
-- ------------------------------------------------------------
create or replace function public.trg_fn_purchase_line_item_unit()
returns trigger
language plpgsql
as $$
declare
  v_item_unit text;
  v_factor numeric;
begin
  if tg_op = 'UPDATE' then
    -- Quantities on an existing row are already in the item's unit; a row
    -- is converted once, when it is created. Changing its unit later would
    -- be ambiguous (which of its numbers are in the new unit?), so it is
    -- refused. A row whose unit is unchanged is left alone.
    if new.unit is distinct from old.unit then
      raise exception 'The unit of an existing line can''t be changed. Delete the line and add it again in the new unit.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_item_unit := public._item_stock_unit(new.item_id, new.unit);
  if v_item_unit is null or new.unit = v_item_unit then
    return new;
  end if;
  v_factor := public._unit_factor(new.unit, v_item_unit, new.item_id);
  new.quantity      := trim_scale(new.quantity * v_factor);
  new.qc_qty        := trim_scale(new.qc_qty * v_factor);
  new.stability_qty := trim_scale(new.stability_qty * v_factor);
  new.rnd_qty       := trim_scale(new.rnd_qty * v_factor);
  -- Price is per unit, so it moves the other way (per g × 1000 = per kg).
  if new.unit_price is not null then
    new.unit_price := trim_scale(new.unit_price / v_factor);
  end if;
  new.unit := v_item_unit;
  return new;
end $$;

-- "trg_00_unit_" sorts after the workflow guard (trg_00_guard_…) and before
-- trg_purchase_line_live_remaining, which must see converted quantities.
drop trigger if exists trg_00_unit_purchase_line on public.purchase_lines;
create trigger trg_00_unit_purchase_line
  before insert or update on public.purchase_lines
  for each row execute function public.trg_fn_purchase_line_item_unit();

-- ------------------------------------------------------------
-- 2. Recipe lines
-- ------------------------------------------------------------
create or replace function public.trg_fn_mfr_line_item_unit()
returns trigger
language plpgsql
as $$
declare
  v_item_unit text;
begin
  if tg_op = 'UPDATE' then
    -- Quantities on an existing row are already in the item's unit; a row
    -- is converted once, when it is created. Changing its unit later would
    -- be ambiguous (which of its numbers are in the new unit?), so it is
    -- refused. A row whose unit is unchanged is left alone.
    if new.unit is distinct from old.unit then
      raise exception 'The unit of an existing line can''t be changed. Delete the line and add it again in the new unit.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_item_unit := public._item_stock_unit(new.item_id, new.unit);
  if v_item_unit is null or new.unit = v_item_unit then
    return new;
  end if;
  new.quantity := trim_scale(new.quantity * public._unit_factor(new.unit, v_item_unit, new.item_id));
  new.unit := v_item_unit;
  return new;
end $$;

drop trigger if exists trg_00_unit_mfr_line on public.mfr_lines;
create trigger trg_00_unit_mfr_line
  before insert or update on public.mfr_lines
  for each row execute function public.trg_fn_mfr_line_item_unit();

-- ------------------------------------------------------------
-- 3. Finished-product batches: always in the MFR's batch-size unit
-- ------------------------------------------------------------
create or replace function public.trg_fn_fp_batch_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_unit text;
  v_fp_item_id uuid;
  v_fp_item_unit text;
begin
  if tg_op = 'UPDATE' then
    if new.unit is distinct from old.unit then
      raise exception 'A finished-product batch''s unit can''t be changed after it is created.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  select batch_size_unit, finished_product_item_id
    into v_batch_unit, v_fp_item_id
    from public.mfr_definitions where id = new.mfr_definition_id;

  if v_batch_unit is null then
    return new;
  end if;

  -- The finished product's stock item (created at first MFR approval with
  -- the batch-size unit) must be convertible from the batch unit, or the
  -- batch's yield could never be added to stock.
  if v_fp_item_id is not null then
    select unit into v_fp_item_unit from public.items where id = v_fp_item_id;
    if v_fp_item_unit is not null and public.convert_unit(1, v_batch_unit, v_fp_item_unit) is null then
      raise exception 'This MFR''s batch size is in "%" but its finished product is kept in stock in "%". Correct the MFR before making a batch.',
        v_batch_unit, v_fp_item_unit
        using errcode = 'P0001';
    end if;
  end if;

  if new.unit is distinct from v_batch_unit then
    new.target_qty := trim_scale(new.target_qty * public._unit_factor(new.unit, v_batch_unit, v_fp_item_id));
    new.unit := v_batch_unit;
  end if;
  return new;
end $$;

drop trigger if exists trg_00_unit_fp_batch on public.finished_product_batches;
create trigger trg_00_unit_fp_batch
  before insert or update on public.finished_product_batches
  for each row execute function public.trg_fn_fp_batch_unit();

-- ------------------------------------------------------------
-- 4. Packaging material lines
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_item_unit()
returns trigger
language plpgsql
as $$
declare
  v_item_unit text;
begin
  if tg_op = 'UPDATE' then
    -- Quantities on an existing row are already in the item's unit; a row
    -- is converted once, when it is created. Changing its unit later would
    -- be ambiguous (which of its numbers are in the new unit?), so it is
    -- refused. A row whose unit is unchanged is left alone.
    if new.unit is distinct from old.unit then
      raise exception 'The unit of an existing line can''t be changed. Delete the line and add it again in the new unit.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_item_unit := public._item_stock_unit(new.item_id, new.unit);
  if v_item_unit is null or new.unit = v_item_unit then
    return new;
  end if;
  new.quantity := trim_scale(new.quantity * public._unit_factor(new.unit, v_item_unit, new.item_id));
  new.unit := v_item_unit;
  return new;
end $$;

drop trigger if exists trg_00_unit_packaging_item on public.packaging_issue_items;
create trigger trg_00_unit_packaging_item
  before insert or update on public.packaging_issue_items
  for each row execute function public.trg_fn_packaging_item_unit();

-- ------------------------------------------------------------
-- 5. Stock ledger safety net: every movement in its item's unit
-- ------------------------------------------------------------
create or replace function public.trg_fn_ledger_item_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_unit text;
begin
  v_item_unit := public._item_stock_unit(new.item_id, new.unit);
  if v_item_unit is null then
    return new;
  end if;
  if new.unit is null then
    -- Writer didn't label it (e.g. RM consumed by an FP batch): the
    -- quantity is already in the batch's unit, which is the item's unit.
    new.unit := v_item_unit;
  elsif new.unit <> v_item_unit then
    new.quantity := trim_scale(new.quantity * public._unit_factor(new.unit, v_item_unit, new.item_id));
    new.unit := v_item_unit;
  end if;
  return new;
end $$;

drop trigger if exists trg_00_unit_ledger on public.inventory_ledger;
create trigger trg_00_unit_ledger
  before insert on public.inventory_ledger
  for each row execute function public.trg_fn_ledger_item_unit();

-- ------------------------------------------------------------
-- 6. An item's unit is fixed once it has been used
-- ------------------------------------------------------------
create or replace function public.trg_fn_item_unit_locked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.unit is null or new.unit is not distinct from old.unit then
    return new;
  end if;
  if exists (select 1 from public.inventory_ledger where item_id = old.id)
     or exists (select 1 from public.purchase_lines where item_id = old.id)
     or exists (select 1 from public.mfr_lines where item_id = old.id)
     or exists (select 1 from public.packaging_issue_items where item_id = old.id)
     or exists (select 1 from public.production_issue_batches where item_id = old.id)
     or exists (select 1 from public.mfr_definitions where finished_product_item_id = old.id) then
    raise exception 'The unit of % can''t be changed: it already has purchases, recipes or stock movements recorded in "%".',
      old.item_code, old.unit
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_unit_locked_item on public.items;
create trigger trg_00_unit_locked_item
  before update of unit on public.items
  for each row execute function public.trg_fn_item_unit_locked();

-- ------------------------------------------------------------
-- Self-check: nothing already stored in a unit different from its item
-- ------------------------------------------------------------
do $$
declare
  v_bad bigint;
begin
  select
      (select count(*) from public.inventory_ledger l join public.items i on i.id = l.item_id where l.unit <> i.unit)
    + (select count(*) from public.purchase_lines pl join public.items i on i.id = pl.item_id where pl.unit <> i.unit)
    + (select count(*) from public.mfr_lines ml join public.items i on i.id = ml.item_id where ml.unit <> i.unit)
    + (select count(*) from public.packaging_issue_items p join public.items i on i.id = p.item_id where p.unit <> i.unit)
    into v_bad;
  if v_bad > 0 then
    raise notice '0076: % existing row(s) are stored in a unit different from their item. New rows are now always converted; existing rows were left as they are.', v_bad;
  end if;
end $$;

commit;
