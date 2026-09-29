-- ============================================================
-- Batch numbers and retests (accuracy audit ACC-09, ACC-10, ACC-16, ACC-39 —
-- claude/app-accuracy-audit-2026-09-28.md; Ravi, 29 Sept 2026: "Start
-- Implementation").
--
-- ACC-09  Batch numbers were "count this item's batches this year + 1". After
--         a draft line was deleted, the count went down and the next number
--         repeated one already in use: for normal items every save then failed
--         for the rest of the year; for items whose code starts with LEG- (not
--         covered by the unique index) two batches silently got the same
--         number. Same count+1 pattern in finished-product and production
--         batch numbers.
--         Now: next number = highest number already used for that item (or
--         MFR) this year + 1, read from the batch numbers themselves, so a
--         deletion can never make a number repeat. A guard also refuses a
--         duplicate purchase batch number for ANY item, LEG- included.
--
-- ACC-10  An approved batch with no stability sample (0 is allowed, and all
--         legacy lines are 0) was blocked from production once its retest date
--         passed — but "Due for retest" didn't list it and "Start Retest"
--         refused it, so it could never be retested.
-- ACC-16  Every retest recorded the FULL stability reserve as its sample, and
--         the reserve never went down.
-- ACC-39  "Due for retest" listed batches with nothing left.
--         Now: start_retest() takes the retest sample size entered by QC. It
--         is drawn from the batch's stability reserve first (already out of
--         stock since Final Submit), and only any remainder from the batch's
--         remaining stock (a normal QC-sample stock movement). Each retest
--         records how much came from each, so the reserve goes down. Every
--         due batch that still has stock is listed, with or without a
--         stability reserve.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- ACC-09: next batch number = highest used + 1
-- ------------------------------------------------------------
-- Highest sequence already used among batch numbers shaped
-- <prefix><digits><suffix>, e.g. 'RM-00012-' || '07' || '/26'.
create or replace function public._max_batch_seq(p_numbers text[], p_prefix text, p_suffix text)
returns integer
language sql
immutable
as $$
  select coalesce(max(substr(n, length(p_prefix) + 1, length(n) - length(p_prefix) - length(p_suffix))::integer), 0)
    from unnest(p_numbers) as n
   where left(n, length(p_prefix)) = p_prefix
     and right(n, length(p_suffix)) = p_suffix
     and substr(n, length(p_prefix) + 1, length(n) - length(p_prefix) - length(p_suffix)) ~ '^[0-9]{1,9}$';
$$;

create or replace function public.get_next_batch_number(p_item_id uuid)
returns text
language plpgsql
as $$
declare
  v_year text := to_char(now(), 'YY');
  v_item_code text;
  v_n int;
begin
  select item_code into v_item_code from public.items where id = p_item_id;
  select public._max_batch_seq(array_agg(batch_number), v_item_code || '-', '/' || v_year) + 1
    into v_n
    from public.purchase_lines where item_id = p_item_id;
  return v_item_code || '-' || lpad(v_n::text, greatest(2, length(v_n::text)), '0') || '/' || v_year;
end $$;

create or replace function public.get_next_fp_batch_number(p_mfr_definition_id uuid)
returns table(batch_number text, short_batch_no text)
language plpgsql
as $$
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

  select public._max_batch_seq(array_agg(fpb.batch_number), coalesce(v_item_code, 'FP') || '-', '/' || v_year) + 1
    into v_n
    from public.finished_product_batches fpb
   where fpb.mfr_definition_id = p_mfr_definition_id;

  v_seq_year := lpad(v_n::text, greatest(2, length(v_n::text)), '0') || '/' || v_year;
  v_short_prefix := case coalesce(v_market, 'domestic') when 'export' then 'OR' else 'PR' end;

  batch_number := coalesce(v_item_code, 'FP') || '-' || v_seq_year;
  short_batch_no := v_short_prefix || '-' || v_seq_year;
  return next;
end $$;

create or replace function public.get_next_production_batch_number(p_item_id uuid)
returns text
language plpgsql
as $$
declare
  v_year text := to_char(now(), 'YY');
  v_n int;
begin
  select public._max_batch_seq(array_agg(batch_number), 'PROD-', '/' || v_year) + 1
    into v_n
    from public.production_issue_batches where item_id = p_item_id;
  return 'PROD-' || public._pad_seq_code(v_n::text, 2) || '/' || v_year;
end $$;

-- Duplicate guard for purchase batch numbers on every item (the unique index
-- skips numbers starting LEG-, because imported legacy data has duplicates;
-- this guard checks new and changed rows only, so that data is untouched).
create or replace function public.trg_fn_purchase_line_batch_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.batch_number is not distinct from old.batch_number
     and new.item_id is not distinct from old.item_id then
    return new;
  end if;
  if exists (select 1 from public.purchase_lines
              where item_id = new.item_id and batch_number = new.batch_number and id <> new.id) then
    raise exception 'Batch number % is already used for this item.', new.batch_number
      using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_batch_unique_purchase_line on public.purchase_lines;
create trigger trg_00_batch_unique_purchase_line
  before insert or update on public.purchase_lines
  for each row execute function public.trg_fn_purchase_line_batch_unique();

-- ------------------------------------------------------------
-- ACC-10 / ACC-16: retests draw from the stability reserve, then stock
-- ------------------------------------------------------------
alter table public.quality_checks add column if not exists stability_reserve_used numeric;
alter table public.quality_checks add column if not exists stock_sample_used numeric;
comment on column public.quality_checks.stability_reserve_used is
  'Retests only: part of the sample taken from the batch''s stability reserve, in the batch''s unit (0080).';
comment on column public.quality_checks.stock_sample_used is
  'Retests only: part of the sample taken from the batch''s remaining stock, in the batch''s unit (0080).';

-- Earlier retests took their sample from the reserve (in full).
update public.quality_checks q
   set stability_reserve_used = coalesce(public.convert_unit(q.sample_qty, q.sample_unit, pl.unit), q.sample_qty)
  from public.purchase_lines pl
 where q.is_retest and q.purchase_line_id = pl.id and q.stability_reserve_used is null;
update public.quality_checks q
   set stability_reserve_used = coalesce(public.convert_unit(q.sample_qty, q.sample_unit, pb.unit), q.sample_qty)
  from public.production_issue_batches pb
 where q.is_retest and q.production_batch_id = pb.id and q.stability_reserve_used is null;

create or replace function public.stability_reserve_left(p_purchase_line_id uuid, p_production_batch_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce(
      (select stability_qty from public.purchase_lines where id = p_purchase_line_id),
      (select stability_qty from public.production_issue_batches where id = p_production_batch_id),
      0)
    - coalesce((select sum(q.stability_reserve_used) from public.quality_checks q
                 where q.is_retest
                   and ((p_purchase_line_id is not null and q.purchase_line_id = p_purchase_line_id)
                     or (p_production_batch_id is not null and q.production_batch_id = p_production_batch_id))), 0),
    0);
$$;
grant execute on function public.stability_reserve_left(uuid, uuid) to authenticated;

create or replace function public.start_retest(
  p_purchase_line_id uuid,
  p_production_batch_id uuid,
  p_sample_qty numeric,
  p_sample_unit text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_unit text;
  v_batch_number text;
  v_live numeric;
  v_pushed timestamptz;
  v_latest record;
  v_qty numeric;
  v_reserve numeric;
  v_from_reserve numeric;
  v_from_stock numeric;
  v_id uuid;
begin
  if not public.has_any_role('system_admin', 'inventory_manager', 'quality_checker', 'qc_reviewer') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if (p_purchase_line_id is null) = (p_production_batch_id is null) then
    raise exception 'Choose one batch to retest.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('batch-qc'),
                                public._batch_qc_lock_key(p_purchase_line_id, p_production_batch_id));

  if p_purchase_line_id is not null then
    select item_id, unit, batch_number, live_remaining_qty, pushed_at
      into v_item_id, v_unit, v_batch_number, v_live, v_pushed
      from public.purchase_lines where id = p_purchase_line_id for update;
    if v_item_id is null then
      raise exception 'Batch not found.' using errcode = 'P0002';
    end if;
    if v_pushed is null then
      raise exception 'Batch %: its purchase order isn''t submitted.', v_batch_number using errcode = 'P0001';
    end if;
    select status, retest_date into v_latest
      from public.quality_checks where purchase_line_id = p_purchase_line_id
     order by created_at desc limit 1;
  else
    select item_id, unit, batch_number, live_remaining_qty
      into v_item_id, v_unit, v_batch_number, v_live
      from public.production_issue_batches where id = p_production_batch_id for update;
    if v_item_id is null then
      raise exception 'Batch not found.' using errcode = 'P0002';
    end if;
    select status, retest_date into v_latest
      from public.quality_checks where production_batch_id = p_production_batch_id
     order by created_at desc limit 1;
  end if;

  if v_latest.status is distinct from 'approved' then
    raise exception 'Batch % is not due for retest (it isn''t currently approved).', v_batch_number using errcode = 'P0001';
  end if;
  if v_latest.retest_date is null or v_latest.retest_date > current_date then
    raise exception 'Batch %''s retest date has not arrived yet.', v_batch_number using errcode = 'P0001';
  end if;

  if p_sample_qty is null or p_sample_qty <= 0 then
    raise exception 'Enter the retest sample quantity.' using errcode = 'P0001';
  end if;
  v_qty := public.convert_unit(p_sample_qty, p_sample_unit, v_unit);
  if v_qty is null then
    raise exception 'Batch % is kept in %, so a sample in % can''t be used.', v_batch_number, v_unit, p_sample_unit
      using errcode = 'P0001';
  end if;

  v_reserve := public.stability_reserve_left(p_purchase_line_id, p_production_batch_id);
  v_from_reserve := least(v_reserve, v_qty);
  v_from_stock := v_qty - v_from_reserve;

  if v_from_stock > coalesce(v_live, 0) + 0.0000001 then
    raise exception 'Batch % has only % % of stability reserve and % % of stock left — not enough for a % % sample.',
      v_batch_number, trim_scale(v_reserve), v_unit, trim_scale(coalesce(v_live, 0)), v_unit, trim_scale(v_qty), v_unit
      using errcode = 'P0001';
  end if;

  if v_from_stock > 0 then
    if p_purchase_line_id is not null then
      update public.purchase_lines set live_remaining_qty = live_remaining_qty - v_from_stock where id = p_purchase_line_id;
    else
      update public.production_issue_batches set live_remaining_qty = live_remaining_qty - v_from_stock where id = p_production_batch_id;
    end if;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit, reference_type, reference_id, event_by, reason)
    values
      ('pull', v_item_id, p_purchase_line_id, p_production_batch_id, v_from_stock, v_unit, 'qc_sample',
       coalesce(p_purchase_line_id, p_production_batch_id), auth.uid(), 'Retest sample');
  end if;

  insert into public.quality_checks
    (ar_number, purchase_line_id, production_batch_id, item_id, sample_qty, sample_unit, is_retest,
     stability_reserve_used, stock_sample_used)
  values
    (public.get_next_ar_number(), p_purchase_line_id, p_production_batch_id, v_item_id, p_sample_qty, p_sample_unit, true,
     v_from_reserve, v_from_stock)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.start_retest(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.start_retest(uuid, uuid, numeric, text) to authenticated;

-- purchase_line_qc (0077) gains the stability reserve still available, for
-- the "Due for retest" card.
create or replace view public.purchase_line_qc
with (security_invoker = on) as
select
  pl.id                    as purchase_line_id,
  pl.batch_number,
  pl.item_id,
  i.item_code,
  i.name                   as item_name,
  i.category               as item_category,
  i.default_sample_unit,
  pl.quantity,
  pl.qc_qty,
  pl.stability_qty,
  pl.rnd_qty,
  pl.unit,
  pl.live_remaining_qty,
  pl.active,
  pl.created_at,
  pl.purchase_order_id,
  po.status                as po_status,
  s.qc_status,
  s.ar_number,
  s.retest_date,
  s.quality_check_id,
  greatest(pl.stability_qty - coalesce((select sum(q.stability_reserve_used) from public.quality_checks q
                                          where q.is_retest and q.purchase_line_id = pl.id), 0), 0)
                           as stability_reserve_left
from public.purchase_lines pl
join public.items i on i.id = pl.item_id
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.purchase_batch_status s on s.purchase_line_id = pl.id;

revoke all on public.purchase_line_qc from anon;
grant select on public.purchase_line_qc to authenticated;

commit;
