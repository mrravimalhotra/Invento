-- ============================================================
-- FB-0052 follow-up (2 Oct 2026, Ravi): the two "not enough" messages on a packaging
-- save read differently —
--   packaging material:  "Not enough stock on hand for D60: 4800 available, 250000 requested."
--   finished product:    "Batch FP-... has only 0 kg left to pack or issue (yield less samples,
--                         less 0 kg already issued). This issue needs 5 kg."
-- Both now use one shape, with the code and name and the unit on both numbers:
--   "Not enough stock for PKG-00001 · D60: 4800 nos available, 250000 nos needed."
--   "Not enough stock for batch FP-00002-01/26 · Atharva Amalaki Vati: 39100 nos available, 500000 nos needed."
-- Only the wording changes. The rules (what is allowed and refused) are exactly as before.
-- check_sufficient_stock() is shared, so wastage and Production issues read the same way too.
-- ============================================================

begin;

create or replace function public.check_sufficient_stock(p_item_id uuid, p_quantity numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_name text;
  v_unit text;
  v_available numeric;
begin
  select item_code, name, unit into v_code, v_name, v_unit from public.items where id = p_item_id for update;

  select on_hand into v_available from public.stock_balance where item_id = p_item_id;
  v_available := coalesce(v_available, 0);

  if p_quantity > v_available then
    raise exception 'Not enough stock for %: % % available, % % needed.',
      case when v_code is null then 'this item' else v_code || ' · ' || coalesce(v_name, '') end,
      trim_scale(round(v_available, 6)), coalesce(v_unit, ''),
      trim_scale(round(p_quantity, 6)), coalesce(v_unit, '');
  end if;
end $$;

create or replace function public.trg_fn_packaging_batch_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
  v_fp_unit text;
  v_fp_name text;
  v_factor numeric;
  v_left numeric;
  v_issued numeric;
begin
  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  -- Lock the batch so two issues against it at the same moment are checked
  -- one after the other.
  select fpb.batch_number, fpb.batch_yield, fpb.unit,
         coalesce(fpb.qc_sample_qty, 0) + coalesce(fpb.stability_qty, 0) + coalesce(fpb.rnd_qty, 0) as samples,
         md.finished_product_item_id
    into v_batch
    from public.finished_product_batches fpb
    join public.mfr_definitions md on md.id = fpb.mfr_definition_id
   where fpb.id = new.finished_product_batch_id
     for update of fpb;

  if v_batch.batch_yield is null then
    return new;   -- no yield recorded (older data): item-level check still applies
  end if;

  select unit, name into v_fp_unit, v_fp_name from public.items where id = v_batch.finished_product_item_id;
  -- fp_qty_consumed is in the finished product's stock unit; the batch's
  -- yield is in the batch's unit (0076 keeps these compatible).
  v_factor := coalesce(public.convert_unit(1, v_batch.unit, coalesce(v_fp_unit, v_batch.unit)), 1);

  select coalesce(sum(fp_qty_consumed), 0) into v_issued
    from public.packaging_issues
   where finished_product_batch_id = new.finished_product_batch_id
     and id is distinct from new.id;

  v_left := (v_batch.batch_yield - v_batch.samples) * v_factor - v_issued;

  if new.fp_qty_consumed > v_left + 0.0000001 then
    raise exception 'Not enough stock for batch % · %: % % available, % % needed.',
      v_batch.batch_number, coalesce(v_fp_name, ''),
      trim_scale(round(greatest(v_left, 0), 6)), coalesce(v_fp_unit, v_batch.unit),
      trim_scale(round(new.fp_qty_consumed, 6)), coalesce(v_fp_unit, v_batch.unit)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
begin
  if position('Not enough stock for batch' in pg_get_functiondef('public.trg_fn_packaging_batch_balance()'::regprocedure)) = 0
     or position('available, % % needed' in pg_get_functiondef('public.check_sufficient_stock(uuid,numeric)'::regprocedure)) = 0 then
    raise exception '0094 self-check failed: shortage messages not updated.';
  end if;
end $$;

commit;
