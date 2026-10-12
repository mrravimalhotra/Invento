-- 0120: Finished product retest (SCAN-P4-04, Ravi 12 Oct 2026)
--
-- "QC and Retest of Finished product will have same retest cycles as of Raw material."
--
--  * A finished product batch can now have more than one QC record: the first, and a retest
--    each time its retest date arrives (at most 3, the 180-day / final-retest rules are
--    applied in the QC screen, 'retests already done' for opening stock counts too).
--  * start_fp_retest(): the sample comes from the batch's stability sample first, then from
--    its bulk (a ledger pull, reason 'Retest sample'). Expired batches are never retested.
--  * Approving a retest does not post the yield again. Rejecting one takes the bulk still in
--    stock out of On hand (reason qc_rejected); voiding the rejection brings it back.
--    Packs already made are left as recorded (Ravi: 'Bulk only').
--  * Bulk left of a batch is now yield less every sample, including the retest samples taken
--    from bulk (finished_product_batches.retest_sample_qty), in the packaging check, Ageing,
--    the packaging list and the stock integrity check (S7).
--  * fp_batch_block_reason(): an approved batch that has expired, is past its retest date or
--    has a retest in progress cannot be packed (here) or labelled (in the app).
--  * A retest date can never fall after the expiry date (raw material and finished product).

begin;

-- ------------------------------------------------------------
-- 1. Retest samples taken from bulk
-- ------------------------------------------------------------
alter table public.finished_product_batches
  add column if not exists retest_sample_qty numeric not null default 0 check (retest_sample_qty >= 0);
comment on column public.finished_product_batches.retest_sample_qty is
  'Quantity (in the batch unit) taken from the bulk as retest samples, after the stability sample ran out (0120).';

-- ------------------------------------------------------------
-- 2. More than one QC record per batch, one open at a time
-- ------------------------------------------------------------
alter table public.quality_checks drop constraint if exists quality_checks_fp_batch_unique;
drop index if exists public.quality_checks_fp_batch_pending_unique;
create unique index quality_checks_fp_batch_pending_unique
  on public.quality_checks (finished_product_batch_id)
  where status in ('submitted', 'checker_approved', 'checker_rejected');

-- ------------------------------------------------------------
-- 3. Helpers
-- ------------------------------------------------------------
create or replace function public.fp_stability_reserve_left(p_batch uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(coalesce(fpb.stability_qty, 0)
           - coalesce((select sum(q.stability_reserve_used) from public.quality_checks q
                        where q.is_retest and q.finished_product_batch_id = fpb.id), 0), 0)
    from public.finished_product_batches fpb where fpb.id = p_batch;
$$;

-- Bulk still in stock, in the batch unit: yield less every sample and what packaging took.
create or replace function public.fp_bulk_left(p_batch uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(coalesce(fpb.batch_yield, 0) - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0)
                  - coalesce(fpb.rnd_qty, 0) - coalesce(fpb.retest_sample_qty, 0)
                  - coalesce((select sum(pi.fp_qty_consumed) from public.packaging_issues pi
                               where pi.finished_product_batch_id = fpb.id), 0)
                    / coalesce(public.convert_unit(1, fpb.unit, coalesce(i.unit, fpb.unit)), 1), 0)
    from public.finished_product_batches fpb
    left join public.mfr_definitions md on md.id = fpb.mfr_definition_id
    left join public.items i on i.id = md.finished_product_item_id
   where fpb.id = p_batch;
$$;

-- Why an approved batch cannot be packed or labelled right now (null = it can).
create or replace function public.fp_batch_block_reason(p_batch uuid)
returns text language plpgsql stable security definer set search_path = public set timezone = 'Asia/Kolkata' as $$
declare
  b record;
  q record;
begin
  select batch_number, status into b from public.finished_product_batches where id = p_batch;
  if not found or b.status <> 'approved' then
    return null;   -- other states are refused by their own checks
  end if;
  select status, retest_date, expiry_date into q
    from public.quality_checks where finished_product_batch_id = p_batch
   order by created_at desc, id desc limit 1;
  if not found then
    return null;
  end if;
  if q.status <> 'approved' then
    return format('Batch %s has a retest in progress, so it cannot be used until the retest is approved.', b.batch_number);
  end if;
  if q.expiry_date is not null and q.expiry_date < current_date then
    return format('Batch %s expired on %s, so it cannot be used.', b.batch_number, to_char(q.expiry_date, 'DD-MM-YYYY'));
  end if;
  if q.retest_date is not null and q.retest_date <= current_date then
    return format('Batch %s is past its retest date (%s). Retest it before it is used.', b.batch_number, to_char(q.retest_date, 'DD-MM-YYYY'));
  end if;
  return null;
end $$;

-- Bulk left for many batches at once (Rejected Materials).
create or replace function public.fp_bulk_left_many(p_ids uuid[])
returns table(batch_id uuid, bulk_left numeric)
language sql stable security definer set search_path = public as $$
  select u.id, public.fp_bulk_left(u.id) from unnest(p_ids) as u(id);
$$;

-- The same question for many batches at once (the label search): only the blocked ones come back.
create or replace function public.fp_batch_block_reasons(p_ids uuid[])
returns table(batch_id uuid, reason text)
language sql stable security definer set search_path = public as $$
  select x.id, x.r
    from (select u.id, public.fp_batch_block_reason(u.id) as r from unnest(p_ids) as u(id)) x
   where x.r is not null;
$$;

revoke all on function public.fp_stability_reserve_left(uuid), public.fp_bulk_left(uuid), public.fp_batch_block_reason(uuid), public.fp_batch_block_reasons(uuid[]), public.fp_bulk_left_many(uuid[]) from public, anon;
grant execute on function public.fp_stability_reserve_left(uuid), public.fp_bulk_left(uuid), public.fp_batch_block_reason(uuid), public.fp_batch_block_reasons(uuid[]), public.fp_bulk_left_many(uuid[]) to authenticated;

-- ------------------------------------------------------------
-- 4. Start a retest of a finished product batch
-- ------------------------------------------------------------
create or replace function public.start_fp_retest(
  p_batch_id uuid,
  p_sample_qty numeric,
  p_sample_unit text
)
returns uuid
language plpgsql
security definer
set search_path = public
set timezone = 'Asia/Kolkata'
as $$
declare
  b record;
  v_latest record;
  v_qty numeric;
  v_reserve numeric;
  v_from_reserve numeric;
  v_from_stock numeric;
  v_bulk numeric;
  v_id uuid;
begin
  if not public.has_any_role('system_admin', 'inventory_manager', 'quality_checker', 'qc_reviewer') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('batch-qc'), hashtext('fp:' || p_batch_id::text));

  select fpb.batch_number, fpb.status, fpb.unit, md.finished_product_item_id as item_id
    into b
    from public.finished_product_batches fpb
    left join public.mfr_definitions md on md.id = fpb.mfr_definition_id
   where fpb.id = p_batch_id
     for update of fpb;
  if not found then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;

  select status, retest_date, expiry_date into v_latest
    from public.quality_checks where finished_product_batch_id = p_batch_id
   order by created_at desc, id desc limit 1;

  if b.status <> 'approved' or v_latest.status is distinct from 'approved' then
    raise exception 'Batch % is not due for retest (it isn''t currently approved).', b.batch_number using errcode = 'P0001';
  end if;
  if v_latest.expiry_date is not null and v_latest.expiry_date < current_date then
    raise exception 'Batch % expired on %, so it can''t be retested. Expired material is not brought back into use.',
      b.batch_number, to_char(v_latest.expiry_date, 'DD-MM-YYYY') using errcode = 'P0001';
  end if;
  if v_latest.retest_date is null or v_latest.retest_date > current_date then
    raise exception 'Batch %''s retest date has not arrived yet.', b.batch_number using errcode = 'P0001';
  end if;
  if b.item_id is null then
    raise exception 'Batch % has no finished product item, so its stock cannot be moved.', b.batch_number using errcode = 'P0001';
  end if;

  if p_sample_qty is null or p_sample_qty <= 0 then
    raise exception 'Enter the retest sample quantity.' using errcode = 'P0001';
  end if;
  v_qty := public.convert_unit(p_sample_qty, p_sample_unit, b.unit);
  if v_qty is null then
    raise exception 'Batch % is kept in %, so a sample in % can''t be used.', b.batch_number, b.unit, p_sample_unit
      using errcode = 'P0001';
  end if;

  v_reserve := public.fp_stability_reserve_left(p_batch_id);
  v_from_reserve := least(v_reserve, v_qty);
  v_from_stock := v_qty - v_from_reserve;
  v_bulk := public.fp_bulk_left(p_batch_id);

  if v_from_stock > v_bulk + 0.0000001 then
    raise exception 'Batch % has only % % of stability sample and % % of bulk left — not enough for a % % sample.',
      b.batch_number, trim_scale(v_reserve), b.unit, trim_scale(v_bulk), b.unit, trim_scale(v_qty), b.unit
      using errcode = 'P0001';
  end if;

  if v_from_stock > 0 then
    update public.finished_product_batches
       set retest_sample_qty = retest_sample_qty + v_from_stock
     where id = p_batch_id;
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by, reason)
    values
      ('pull', b.item_id, v_from_stock, b.unit, 'qc_sample', p_batch_id, auth.uid(), 'Retest sample');
  end if;

  insert into public.quality_checks
    (ar_number, finished_product_batch_id, sample_qty, sample_unit, is_retest, stability_reserve_used, stock_sample_used)
  values
    (public.get_next_fp_ar_number(), p_batch_id, p_sample_qty, p_sample_unit, true, v_from_reserve, v_from_stock)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.start_fp_retest(uuid, numeric, text) from public, anon;
grant execute on function public.start_fp_retest(uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 5. The batch follows the decision: a first approval posts the yield, a retest does not
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_review_finished_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch record;
  v_item_id uuid;
  v_net numeric;
  v_left numeric;
begin
  select md.finished_product_item_id into v_item_id
    from public.finished_product_batches fpb
    join public.mfr_definitions md on md.id = fpb.mfr_definition_id
   where fpb.id = new.finished_product_batch_id;

  if new.is_retest then
    update public.finished_product_batches set status = new.status where id = new.finished_product_batch_id;
    if new.status = 'rejected' and v_item_id is not null then
      select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0)
        into v_net from public.inventory_ledger l
       where l.reference_type = 'qc_rejected' and l.reference_id = new.finished_product_batch_id;
      v_left := public.fp_bulk_left(new.finished_product_batch_id);
      if v_net <= 0 and v_left > 0 then
        insert into public.inventory_ledger
          (event_type, item_id, quantity, unit, reference_type, reference_id, event_by, reason)
        select 'pull', v_item_id, v_left, fpb.unit, 'qc_rejected', fpb.id, auth.uid(), 'Retest rejected'
          from public.finished_product_batches fpb where fpb.id = new.finished_product_batch_id;
      end if;
    end if;
    return new;
  end if;

  update public.finished_product_batches
  set status = new.status
  where id = new.finished_product_batch_id;

  if new.status <> 'approved' then
    return new;
  end if;

  select fpb.batch_yield, fpb.qc_sample_qty, fpb.stability_qty, fpb.rnd_qty, fpb.unit
    into v_batch
    from public.finished_product_batches fpb
    where fpb.id = new.finished_product_batch_id;

  if v_item_id is null or v_batch.batch_yield is null or v_batch.batch_yield <= 0 then
    return new;
  end if;

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
  values
    ('push', v_item_id, v_batch.batch_yield, v_batch.unit, 'fp_yield', new.finished_product_batch_id, auth.uid());

  if coalesce(v_batch.qc_sample_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.qc_sample_qty, v_batch.unit, 'qc_sample', new.finished_product_batch_id, auth.uid());
  end if;

  if coalesce(v_batch.stability_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.stability_qty, v_batch.unit, 'stability_sample', new.finished_product_batch_id, auth.uid());
  end if;

  if coalesce(v_batch.rnd_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.rnd_qty, v_batch.unit, 'rnd_sample', new.finished_product_batch_id, auth.uid());
  end if;

  return new;
end $$;

-- A voided rejection: a first record returns the batch to Awaiting QC; a retest returns it to
-- Approved (the retest starts again) and brings the bulk back to On hand.
create or replace function public.trg_fn_qc_void_finished_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_net numeric;
  v_item_id uuid;
  v_unit text;
begin
  if new.is_retest then
    update public.finished_product_batches
       set status = 'approved'
     where id = new.finished_product_batch_id and status = 'rejected';
    select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0)
      into v_net from public.inventory_ledger l
     where l.reference_type = 'qc_rejected' and l.reference_id = new.finished_product_batch_id;
    if v_net > 0 then
      select md.finished_product_item_id, fpb.unit into v_item_id, v_unit
        from public.finished_product_batches fpb
        join public.mfr_definitions md on md.id = fpb.mfr_definition_id
       where fpb.id = new.finished_product_batch_id;
      insert into public.inventory_ledger
        (event_type, item_id, quantity, unit, reference_type, reference_id, event_by, reason)
      values ('push', v_item_id, v_net, v_unit, 'qc_rejected', new.finished_product_batch_id, auth.uid(), 'Rejection voided');
    end if;
    return new;
  end if;
  update public.finished_product_batches
     set status = 'submitted_to_qc'
   where id = new.finished_product_batch_id and status = 'rejected';
  return new;
end $$;

-- ------------------------------------------------------------
-- 6. A retest date can never fall after the expiry date
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_retest_within_expiry()
returns trigger language plpgsql set search_path = public as $$
declare
  v_retest date;
begin
  if new.retest_period_days is not null and new.expiry_date is not null then
    v_retest := (coalesce(new.reviewed_at, now()) at time zone 'Asia/Kolkata')::date + new.retest_period_days;
    if v_retest > new.expiry_date then
      raise exception 'The retest date (%) would fall after the expiry date (%). Enter a shorter retest period.',
        to_char(v_retest, 'DD-MM-YYYY'), to_char(new.expiry_date, 'DD-MM-YYYY') using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_qc_retest_within_expiry on public.quality_checks;
create trigger trg_qc_retest_within_expiry
  before update on public.quality_checks
  for each row
  when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.trg_fn_qc_retest_within_expiry();

-- ------------------------------------------------------------
-- 7. Finished product batches due for retest (the QC screen card)
-- ------------------------------------------------------------
create or replace view public.fp_due_for_retest
with (security_invoker = on) as
select fpb.id as batch_id,
       md.finished_product_item_id as item_id,
       i.item_code,
       coalesce(i.name, md.name) as item_name,
       fpb.batch_number || coalesce(' (' || fpb.short_batch_no || ')', '') as batch_label,
       fpb.unit,
       fpb.qc_sample_qty,
       public.fp_stability_reserve_left(fpb.id) as stability_reserve_left,
       public.fp_bulk_left(fpb.id) as bulk_left,
       q.ar_number,
       q.retest_date,
       q.expiry_date,
       fpb.is_legacy
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items i on i.id = md.finished_product_item_id
  join lateral (select x.status, x.ar_number, x.retest_date, x.expiry_date
                  from public.quality_checks x
                 where x.finished_product_batch_id = fpb.id
                 order by x.created_at desc, x.id desc limit 1) q on true
 where fpb.active
   and fpb.status = 'approved'
   and q.status = 'approved'
   and q.retest_date is not null
   and q.retest_date <= (now() at time zone 'Asia/Kolkata')::date
   and (q.expiry_date is null or q.expiry_date >= (now() at time zone 'Asia/Kolkata')::date);

-- The newest approved QC record of each finished product batch (a retested batch has several).
create or replace view public.fp_latest_approvals
with (security_invoker = on) as
select q.id as quality_check_id,
       q.finished_product_batch_id,
       q.retest_date,
       q.expiry_date
  from public.quality_checks q
 where q.status = 'approved'
   and q.finished_product_batch_id is not null
   and not exists (
         select 1 from public.quality_checks n
          where n.finished_product_batch_id = q.finished_product_batch_id
            and n.status = 'approved'
            and n.id <> q.id
            and (n.created_at > q.created_at or (n.created_at = q.created_at and n.id > q.id)));

revoke all on public.fp_latest_approvals from public, anon;
grant select on public.fp_latest_approvals to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.fp_latest_approvals from authenticated;

revoke all on public.fp_due_for_retest from public, anon;
grant select on public.fp_due_for_retest to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.fp_due_for_retest from authenticated;

-- ------------------------------------------------------------
-- 8. Packaging check: retest samples and the block rule
-- ------------------------------------------------------------
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
  v_block text;
begin
  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  -- 0120: an expired batch, one past its retest date or with a retest in progress is not packed
  -- (packs recorded by an opening stock load are history, not an issue).
  v_block := case when new.opening_load_id is null then public.fp_batch_block_reason(new.finished_product_batch_id) end;
  if v_block is not null then
    raise exception '%', v_block using errcode = 'P0001';
  end if;

  -- Lock the batch so two issues against it at the same moment are checked
  -- one after the other.
  select fpb.batch_number, fpb.batch_yield, fpb.unit,
         coalesce(fpb.qc_sample_qty, 0) + coalesce(fpb.stability_qty, 0) + coalesce(fpb.rnd_qty, 0)
         + coalesce(fpb.retest_sample_qty, 0) as samples,
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

-- ------------------------------------------------------------
-- 9. Ageing: bulk left less the retest samples
-- ------------------------------------------------------------
create or replace view public.batch_ageing
with (security_invoker = on) as
select 'raw'::text as kind,
       pl.id as batch_id,
       pl.item_id,
       i.item_code,
       i.name as item_name,
       pl.batch_number::text as batch_label,
       pl.unit,
       pl.live_remaining_qty as remaining_qty,
       s.ar_number,
       s.retest_date,
       s.expiry_date,
       pl.is_legacy
  from public.purchase_lines pl
  join public.items i on i.id = pl.item_id
  join public.purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
  join public.purchase_batch_status s on s.purchase_line_id = pl.id
 where s.qc_status = 'approved'
   and pl.active
   and i.category = 'raw'
   and pl.live_remaining_qty >= 0.0005
   and (s.retest_date is not null or s.expiry_date is not null)
union all
select 'production_raw',
       pb.id,
       pb.item_id,
       i.item_code,
       i.name,
       pb.batch_number::text,
       pb.unit,
       pb.live_remaining_qty,
       s.ar_number,
       s.retest_date,
       s.expiry_date,
       false
  from public.production_issue_batches pb
  join public.items i on i.id = pb.item_id
  join public.production_batch_status s on s.production_batch_id = pb.id
 where s.qc_status = 'approved'
   and pb.active
   and pb.live_remaining_qty >= 0.0005
   and (s.retest_date is not null or s.expiry_date is not null)
union all
select 'fp',
       fpb.id,
       i.id,
       i.item_code,
       coalesce(i.name, md.name),
       fpb.batch_number || coalesce(' (' || fpb.short_batch_no || ')', ''),
       fpb.unit,
       -- SCAN-P6-06: bulk still in stock = yield - samples - what the packaging issues took
       -- (the same rule as the packaging stock check, 0094). The old figure subtracted
       -- the number of packs, so 60 L packed as 100 bottles showed as nothing left.
       greatest(coalesce(fpb.batch_yield, 0) - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0)
                - coalesce(fpb.rnd_qty, 0) - coalesce(fpb.retest_sample_qty, 0)
                - coalesce((select sum(pi.fp_qty_consumed) from public.packaging_issues pi
                             where pi.finished_product_batch_id = fpb.id), 0)
                  / coalesce(public.convert_unit(1, fpb.unit, coalesce(i.unit, fpb.unit)), 1), 0),
       q.ar_number,
       q.retest_date,
       q.expiry_date,
       fpb.is_legacy
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items i on i.id = md.finished_product_item_id
  join public.current_qc_approvals ca on ca.finished_product_batch_id = fpb.id
  join public.quality_checks q on q.id = ca.quality_check_id
 where fpb.active
   and (q.retest_date is not null or q.expiry_date is not null);
grant select on public.batch_ageing to authenticated;
revoke all on public.batch_ageing from anon;

-- ------------------------------------------------------------
-- 10. Packing list: only batches that can be packed, with the retest samples taken off
-- ------------------------------------------------------------
create or replace view public.fp_batch_packing_options
with (security_invoker = on) as
select fpb.id,
       fpb.batch_number,
       fpb.short_batch_no,
       fpb.status,
       fpb.is_legacy,
       it.name as fp_name,
       it.unit as fp_unit,
       case when fpb.batch_yield is null then null
            else greatest(
                   (fpb.batch_yield - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0) - coalesce(fpb.rnd_qty, 0) - coalesce(fpb.retest_sample_qty, 0))
                   * coalesce(public.convert_unit(1, fpb.unit, coalesce(it.unit, fpb.unit)), 1)
                   - coalesce(iss.issued, 0), 0)
       end as left_qty
  from public.finished_product_batches fpb
  left join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items it on it.id = md.finished_product_item_id
  left join (select finished_product_batch_id, sum(fp_qty_consumed) as issued
               from public.packaging_issues group by finished_product_batch_id) iss
         on iss.finished_product_batch_id = fpb.id
 where fpb.active and fpb.status = 'approved'
   and public.fp_batch_block_reason(fpb.id) is null;

revoke all on public.fp_batch_packing_options from public, anon;
grant select on public.fp_batch_packing_options to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.fp_batch_packing_options from authenticated;

-- ------------------------------------------------------------
-- 11. Integrity check S7: bulk left less the retest samples
-- ------------------------------------------------------------
create or replace function public.stock_integrity_check()
returns table(code text, title text, problems integer, sample jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can run the stock integrity check.' using errcode = 'P0001';
  end if;

  -- S1
  select * into r from public._integrity_run($q$
    select i.item_code, i.name as item_name, p.on_hand,
           p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
           - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected as parts_total,
           'On hand does not equal the sum of its parts on Stock Position' as problem
      from item_position p join items i on i.id = p.item_id
     where p.on_hand is distinct from
           p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
           - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected
  $q$);
  code := 'S1'; title := 'An item''s On hand equals the sum of its parts on Stock Position'; problems := r.problems; sample := r.sample; return next;

  -- S2
  select * into r from public._integrity_run($q$
    with led as (
      select purchase_line_id, sum(case event_type when 'push' then quantity else -quantity end) as net
        from inventory_ledger where purchase_line_id is not null and reference_type is distinct from 'qc_rejected' group by 1)
    select i.item_code, i.name as item_name, pl.batch_number, pl.live_remaining_qty as batch_remaining, coalesce(l.net, 0) as ledger_net,
           pl.live_remaining_qty - coalesce(l.net, 0) as difference,
           'The quantity left on this batch differs from what the ledger shows for it' as problem
      from purchase_lines pl join items i on i.id = pl.item_id left join led l on l.purchase_line_id = pl.id
     where pl.pushed_at is not null and pl.live_remaining_qty is distinct from coalesce(l.net, 0)
     order by 1, 2
  $q$);
  code := 'S2'; title := 'A purchase batch''s remaining quantity equals what the ledger shows for it'; problems := r.problems; sample := r.sample; return next;

  -- S3
  select * into r from public._integrity_run($q$
    with led as (
      select production_batch_id, sum(case event_type when 'push' then quantity else -quantity end) as net
        from inventory_ledger where production_batch_id is not null group by 1)
    select i.item_code, i.name as item_name, pb.batch_number, pb.quantity as issued_quantity, pb.live_remaining_qty as batch_remaining,
           coalesce(l.net, 0) as ledger_net,
           'The quantity left on this production-issued batch differs from what the ledger shows for it' as problem
      from production_issue_batches pb join items i on i.id = pb.item_id left join led l on l.production_batch_id = pb.id
     where pb.active and pb.live_remaining_qty is distinct from pb.quantity + coalesce(l.net, 0)
  $q$);
  code := 'S3'; title := 'A production-issued raw material batch''s remaining quantity equals what the ledger shows'; problems := r.problems; sample := r.sample; return next;

  -- S4
  select * into r from public._integrity_run($q$
    select 'Item on hand is below zero' as problem, i.item_code, i.name as item_name, null::text as batch_number, b.on_hand::text as quantity
      from stock_balance b join items i on i.id = b.item_id where b.on_hand < 0
    union all
    select 'Batch remaining quantity is below zero', i.item_code, i.name, pl.batch_number, pl.live_remaining_qty::text
      from purchase_lines pl join items i on i.id = pl.item_id where pl.live_remaining_qty < 0
    union all
    select 'Production-issued batch remaining quantity is below zero', i.item_code, i.name, pb.batch_number, pb.live_remaining_qty::text
      from production_issue_batches pb join items i on i.id = pb.item_id where pb.live_remaining_qty < 0
  $q$);
  code := 'S4'; title := 'No item or batch is below zero'; problems := r.problems; sample := r.sample; return next;

  -- S5
  select * into r from public._integrity_run($q$
    select i.item_code, i.name as item_name, pl.batch_number, po.po_number, po.status,
           sum(case l.event_type when 'push' then l.quantity else -l.quantity end) as purchase_net,
           'This purchase line is not submitted but the ledger holds stock for it' as problem
      from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
      join items i on i.id = pl.item_id
      join inventory_ledger l on l.purchase_line_id = pl.id and l.reference_type = 'purchase' and l.reference_id = pl.id
     where pl.pushed_at is null
     group by i.item_code, i.name, pl.batch_number, po.po_number, po.status
    having sum(case l.event_type when 'push' then l.quantity else -l.quantity end) <> 0
  $q$);
  code := 'S5'; title := 'A purchase line that is not submitted has no stock in the ledger'; problems := r.problems; sample := r.sample; return next;

  -- S6
  select * into r from public._integrity_run($q$
    select case when l.unit is null
                then 'This ledger row has no unit written on it; the item is kept in ' || i.unit
                else 'This ledger row is in ' || l.unit || ' but the item is kept in ' || i.unit end as problem,
           to_char(l.event_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI') as event_date,
           i.item_code, i.name as item_name, l.quantity, l.event_type, l.reference_type,
           pl.batch_number as purchase_batch, fpb.batch_number as finished_product_batch, l.id
      from inventory_ledger l join items i on i.id = l.item_id
      left join purchase_lines pl on pl.id = l.purchase_line_id
      left join finished_product_batches fpb on l.reference_type = 'finished_product' and fpb.id = l.reference_id
     where l.unit is distinct from i.unit
    union all
    select 'This ledger row belongs to a different item from the batch it points to',
           to_char(l.event_at at time zone 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI'),
           i.item_code, i.name, l.quantity, l.event_type, l.reference_type, pl.batch_number, null, l.id
      from inventory_ledger l join purchase_lines pl on pl.id = l.purchase_line_id join items i on i.id = l.item_id
     where pl.item_id <> l.item_id
  $q$);
  code := 'S6'; title := 'Every ledger row uses its item''s unit and its batch''s item'; problems := r.problems; sample := r.sample; return next;

  -- S7
  select * into r from public._integrity_run($q$
    with b as (
      select md.finished_product_item_id as item_id,
             sum(greatest(coalesce(fpb.batch_yield,0) - coalesce(fpb.qc_sample_qty,0) - coalesce(fpb.stability_qty,0)
                          - coalesce(fpb.rnd_qty,0) - coalesce(fpb.retest_sample_qty,0) - coalesce(iss.bulk,0), 0)) as bulk
        from public.finished_product_batches fpb
        join public.mfr_definitions md on md.id = fpb.mfr_definition_id
        left join lateral (select sum(pi.fp_qty_consumed) as bulk from public.packaging_issues pi
                            where pi.finished_product_batch_id = fpb.id) iss on true
       where fpb.active and fpb.status = 'approved'
       group by 1)
    select i.item_code, i.name as item_name, round(coalesce(sb.on_hand,0),3) as ledger_on_hand, round(b.bulk,3) as batch_bulk,
           'The ledger On hand for this finished product differs from the bulk left on its approved batches' as problem
      from b join public.items i on i.id = b.item_id
      left join public.stock_balance sb on sb.item_id = i.id
     where abs(coalesce(sb.on_hand,0) - b.bulk) > 0.0005
  $q$);
  code := 'S7'; title := 'A finished product''s ledger On hand equals the bulk left on its approved batches'; problems := r.problems; sample := r.sample; return next;

  -- S8
  select * into r from public._integrity_run($q$
    select 'This purchase batch number is used more than once for the same item' as problem, i.item_code, i.name as item_name, x.batch_number, x.n as times_used
      from (select pl.item_id, pl.batch_number, count(*) as n from public.purchase_lines pl
             where pl.active group by pl.item_id, pl.batch_number having count(*) > 1) x
      join public.items i on i.id = x.item_id
    union all
    select 'This finished product batch number is used more than once', null, null, fpb.batch_number, count(*)
      from public.finished_product_batches fpb where fpb.active group by fpb.batch_number having count(*) > 1
  $q$);
  code := 'S8'; title := 'No batch number is used twice for the same item'; problems := r.problems; sample := r.sample; return next;

  -- S9
  select * into r from public._integrity_run($q$
    select 'This submitted line has no receipt in the ledger' as problem, i.item_code, pl.batch_number as reference
      from public.purchase_lines pl join public.purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
      join public.items i on i.id = pl.item_id
     where pl.active and pl.pushed_at is not null
       and not exists (select 1 from public.inventory_ledger l
                        where l.purchase_line_id = pl.id and l.event_type = 'push' and l.reference_type = 'purchase')
    union all
    select 'The ledger has a receipt for a line that is not submitted', i.item_code, pl.batch_number
      from public.inventory_ledger l join public.purchase_lines pl on pl.id = l.purchase_line_id
      join public.purchase_orders po on po.id = pl.purchase_order_id
      join public.items i on i.id = pl.item_id
     where l.event_type = 'push' and l.reference_type = 'purchase' and (po.status <> 'submitted' or pl.pushed_at is null)
    union all
    select 'This QC record points to no batch', null, q.ar_number
      from public.quality_checks q
     where q.purchase_line_id is null and q.production_batch_id is null and q.finished_product_batch_id is null
  $q$);
  code := 'S9'; title := 'Every submitted line has its receipt in the ledger, and every QC record has a batch'; problems := r.problems; sample := r.sample; return next;
end $$;
revoke all on function public.stock_integrity_check() from public, anon;
grant execute on function public.stock_integrity_check() to authenticated, service_role;

-- ------------------------------------------------------------
-- 12. Retained samples: the stability sample left on a finished product batch
-- ------------------------------------------------------------
create or replace view public.retained_samples
with (security_invoker = on) as
select 'raw'::text as kind,
       pl.id as batch_id,
       pl.item_id,
       i.item_code,
       i.name as item_name,
       pl.batch_number::text as batch_label,
       pl.unit,
       coalesce(pl.qc_qty, 0) as qc_qty,
       coalesce(pl.stability_qty, 0) as stability_qty,
       coalesce(pl.rnd_qty, 0) as rnd_qty,
       greatest(coalesce(pl.stability_qty, 0)
                - coalesce((select sum(q.stability_reserve_used) from public.quality_checks q
                             where q.is_retest and q.purchase_line_id = pl.id), 0), 0) as stability_left,
       s.qc_status,
       s.ar_number,
       s.expiry_date,
       pl.created_at as taken_at,
       pl.is_legacy
  from public.purchase_lines pl
  join public.items i on i.id = pl.item_id
  join public.purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
  join public.purchase_batch_status s on s.purchase_line_id = pl.id
 where pl.active
   and coalesce(pl.qc_qty, 0) + coalesce(pl.stability_qty, 0) + coalesce(pl.rnd_qty, 0) > 0
union all
select 'production_raw',
       pb.id,
       pb.item_id,
       i.item_code,
       i.name,
       pb.batch_number::text,
       pb.unit,
       coalesce(pb.qc_qty, 0),
       coalesce(pb.stability_qty, 0),
       coalesce(pb.rnd_qty, 0),
       null::numeric,
       s.qc_status,
       s.ar_number,
       s.expiry_date,
       pb.created_at,
       false
  from public.production_issue_batches pb
  join public.items i on i.id = pb.item_id
  join public.production_batch_status s on s.production_batch_id = pb.id
 where pb.active
   and coalesce(pb.qc_qty, 0) + coalesce(pb.stability_qty, 0) + coalesce(pb.rnd_qty, 0) > 0
union all
select 'fp',
       fpb.id,
       i.id,
       i.item_code,
       coalesce(i.name, md.name),
       fpb.batch_number || coalesce(' (' || fpb.short_batch_no || ')', ''),
       fpb.unit,
       coalesce(fpb.qc_sample_qty, 0),
       coalesce(fpb.stability_qty, 0),
       coalesce(fpb.rnd_qty, 0),
       public.fp_stability_reserve_left(fpb.id),
       coalesce(q.status, 'not_submitted'),
       q.ar_number,
       q.expiry_date,
       fpb.created_at,
       fpb.is_legacy
  from public.finished_product_batches fpb
  join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items i on i.id = md.finished_product_item_id
  left join lateral (
    select x.status, x.ar_number, x.expiry_date from public.quality_checks x
     where x.finished_product_batch_id = fpb.id
     order by x.created_at desc, x.id desc limit 1
  ) q on true
 where fpb.active
   and fpb.status in ('complete_awaiting_qc', 'submitted_to_qc', 'approved', 'rejected')
   and coalesce(fpb.qc_sample_qty, 0) + coalesce(fpb.stability_qty, 0) + coalesce(fpb.rnd_qty, 0) > 0;

grant select on public.retained_samples to authenticated;
revoke all on public.retained_samples from anon;


-- ------------------------------------------------------------
-- 13. Opening stock, finished product: retest date and retests already done (SCAN-P4-04)
-- ------------------------------------------------------------
-- p_rows also carries retest_date (optional) and retests_done (0 to 3, blank = 0).
create or replace function public.load_opening_finished_product(p_rows jsonb)
returns table(load_no text, row_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_load_id   uuid;
  v_load_no   text;
  v_row       jsonb;
  v_idx       integer := 0;
  v_item      record;
  v_mfr       record;
  v_batch     text;
  v_mfg       date;
  v_exp       date;
  v_appr      date;
  v_retest    date;
  v_done      integer;
  v_ar        text;
  v_bulk      numeric;
  v_packs     numeric;
  v_psize     numeric;
  v_punit     text;
  v_packed    numeric;   -- bulk in the packs, in the item's unit
  v_total     numeric;   -- bulk + packed, in the item's unit
  v_yield     numeric;   -- same, in the batch unit
  v_batch_id  uuid;
  v_n_bulk    integer := 0;
  v_n_packs   integer := 0;
  v_code      text;
begin
  if not public.has_app_access() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed.' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to load.' using errcode = 'P0001';
  end if;

  v_load_no := 'OPN-' || public._pad_seq_code(nextval('public.opening_load_seq')::text, 4);
  insert into public.opening_loads (load_no, kind, row_count)
    values (v_load_no, 'finished', jsonb_array_length(p_rows))
    returning id into v_load_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;

    select i.id, i.item_code, i.unit, i.packaged_item_id, i.category into v_item
      from public.items i where i.id = (v_row->>'item_id')::uuid and i.active;
    if not found or v_item.category <> 'processed' then
      raise exception 'Row %: finished product not found or inactive.', v_idx using errcode = 'P0001';
    end if;
    select md.id, md.version, md.batch_size_unit into v_mfr
      from public.mfr_definitions md where md.finished_product_item_id = v_item.id;
    if not found then
      raise exception 'Row %: % has no MFR.', v_idx, v_item.item_code using errcode = 'P0001';
    end if;

    v_batch := nullif(btrim(coalesce(v_row->>'batch_number', '')), '');
    if v_batch is null then
      raise exception 'Row %: batch number is required.', v_idx using errcode = 'P0001';
    end if;
    if (left(v_batch, length(v_item.item_code) + 1) = v_item.item_code || '-' and v_batch ~ '/[0-9]{2}$')
       or v_batch ~* '^(PR|OR)-[0-9]+/[0-9]{2}$' then
      raise exception 'Row %: batch number "%" looks like a batch number made by the app. Use the number from the old records.', v_idx, v_batch
        using errcode = 'P0001';
    end if;
    if exists (select 1 from public.finished_product_batches where batch_number = v_batch) then
      raise exception 'Row %: batch number "%" is already used.', v_idx, v_batch using errcode = 'P0001';
    end if;

    v_mfg  := nullif(v_row->>'manufacture_date', '')::date;
    v_exp  := nullif(v_row->>'expiry_date', '')::date;
    v_appr := nullif(v_row->>'approval_date', '')::date;
    if v_mfg is null or v_mfg > v_today then
      raise exception 'Row %: manufacture date is required and cannot be in the future.', v_idx using errcode = 'P0001';
    end if;
    if v_exp is null or v_exp <= v_mfg then
      raise exception 'Row %: expiry date is required and must be after the manufacture date.', v_idx using errcode = 'P0001';
    end if;
    if v_appr is null or v_appr > v_today or v_appr < v_mfg then
      raise exception 'Row %: QC approval date is required, cannot be in the future and cannot be before the manufacture date.', v_idx
        using errcode = 'P0001';
    end if;

    -- 0120: the retest cycle carried over. Retests already done count toward the limit of 3;
    -- a retest date is optional (left blank, the batch is simply not due for retest).
    v_retest := nullif(v_row->>'retest_date', '')::date;
    v_done := coalesce(nullif(v_row->>'retests_done', '')::integer, 0);
    if v_done not between 0 and 3 then
      raise exception 'Row %: retests already done must be 0 to 3.', v_idx using errcode = 'P0001';
    end if;
    if v_retest is not null then
      if v_retest <= v_appr then
        raise exception 'Row %: retest date must be after the QC approval date.', v_idx using errcode = 'P0001';
      end if;
      if v_retest > v_exp then
        raise exception 'Row %: retest date cannot be after the expiry date.', v_idx using errcode = 'P0001';
      end if;
      if v_done >= 3 then
        raise exception 'Row %: 3 retests are already done, so no further retest date applies. Leave the retest date blank.', v_idx
          using errcode = 'P0001';
      end if;
    end if;

    v_ar := nullif(btrim(coalesce(v_row->>'old_ar', '')), '');
    if v_ar is null then
      raise exception 'Row %: the old AR number is required.', v_idx using errcode = 'P0001';
    end if;
    if v_ar ~* '^AR(RM|FP)-[0-9]+/[0-9]{2}$' then
      raise exception 'Row %: AR number "%" looks like a number made by the app. Use the old number.', v_idx, v_ar using errcode = 'P0001';
    end if;
    if exists (select 1 from public.quality_checks where ar_number = v_ar) then
      raise exception 'Row %: AR number "%" is already used.', v_idx, v_ar using errcode = 'P0001';
    end if;

    v_bulk  := coalesce(nullif(v_row->>'bulk_qty', '')::numeric, 0);
    v_packs := coalesce(nullif(v_row->>'packs', '')::numeric, 0);
    if v_bulk < 0 or v_packs < 0 or v_packs <> trunc(v_packs) then
      raise exception 'Row %: bulk quantity cannot be negative and packs must be a whole number.', v_idx using errcode = 'P0001';
    end if;
    if v_bulk = 0 and v_packs = 0 then
      raise exception 'Row %: enter the bulk quantity, the packs in stock, or both.', v_idx using errcode = 'P0001';
    end if;

    v_packed := 0;
    if v_packs > 0 then
      v_psize := nullif(v_row->>'pack_size_qty', '')::numeric;
      v_punit := coalesce(nullif(v_row->>'pack_size_unit', ''), v_item.unit);
      if v_psize is null or v_psize <= 0 then
        raise exception 'Row %: pack size is required when packs are in stock.', v_idx using errcode = 'P0001';
      end if;
      if v_item.packaged_item_id is null then
        raise exception 'Row %: % has no packaged item yet, so packs cannot be recorded for it.', v_idx, v_item.item_code
          using errcode = 'P0001';
      end if;
      v_packed := public.convert_unit(v_psize, v_punit, v_item.unit) * v_packs;
      if v_packed is null then
        raise exception 'Row %: pack size unit "%" cannot be converted to %.', v_idx, v_punit, v_item.unit using errcode = 'P0001';
      end if;
    end if;

    v_total := v_bulk + v_packed;
    v_yield := v_total * coalesce(public.convert_unit(1, v_item.unit, v_mfr.batch_size_unit), 1);

    insert into public.finished_product_batches
      (batch_number, mfr_definition_id, mfr_version, target_qty, unit, status, expiry_month, finish_date,
       batch_start_date, batch_yield, is_legacy, opening_load_id, created_at)
      values (v_batch, v_mfr.id, v_mfr.version, v_yield, v_mfr.batch_size_unit, 'approved', v_exp, v_mfg,
              v_mfg, v_yield, true, v_load_id, (v_mfg::timestamp at time zone 'Asia/Kolkata') + interval '12 hours')
      returning id into v_batch_id;

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
      values ('push', v_item.id, v_total, v_item.unit, 'fp_yield', v_batch_id, auth.uid());

    insert into public.quality_checks
      (ar_number, finished_product_batch_id, expiry_date, status,
       checker_by, checker_at, checker_comments, reviewed_by, reviewed_at, review_comments,
       retest_period_days, is_retest, is_legacy, legacy_retests_done)
      values (v_ar, v_batch_id, v_exp, 'approved',
              auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours',
              'Legacy record, loaded as opening stock ' || v_load_no,
              auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours',
              'Legacy record, loaded as opening stock ' || v_load_no,
              case when v_retest is not null then v_retest - v_appr end, false, true, v_done);

    if v_packs > 0 then
      v_code := public.get_next_packaging_issue_code();
      insert into public.packaging_issues
        (code, finished_product_batch_id, pack_size, pack_size_qty, pack_size_unit, fp_qty_consumed,
         unit_count, department, transaction_type, issue_date, opening_load_id)
        values (v_code, v_batch_id, trim_scale(v_psize)::text || ' ' || v_punit, v_psize, v_punit, v_packed,
                v_packs, 'store', 'pack', v_appr, v_load_id);
      v_n_packs := v_n_packs + 1;
    end if;
    if v_bulk > 0 then
      v_n_bulk := v_n_bulk + 1;
    end if;
  end loop;

  update public.opening_loads
     set summary = jsonb_build_object('with_bulk', v_n_bulk, 'with_packs', v_n_packs)
   where id = v_load_id;

  load_no := v_load_no;
  row_count := jsonb_array_length(p_rows);
  return next;
end $$;
revoke all on function public.load_opening_finished_product(jsonb) from public, anon;
grant execute on function public.load_opening_finished_product(jsonb) to authenticated;

commit;
