-- 0098: expiry date on QC approval, final retest (FB-0058, FB-0061)
--
-- Ravi, 3 Oct 2026:
--   FB-0058  raw material and finished product both carry an Expiry date and a
--            Re-test date.
--   FB-0061  a raw material is retested at most 3 times, each period at most
--            180 days; the next retest date is set 180 days out but can be
--            edited. The Expiry date can be changed at every retest. After the
--            3rd retest there is no new retest and the material can be used
--            until its Expiry date.
--
-- quality_checks.expiry_date already exists (0001). The QC Reviewer now fills it
-- in when approving (the screen is in the app). Here the database learns to use
-- it: the batch status views expose it, and a batch past its expiry date can
-- no longer be consumed or counted as the oldest stock in the FIFO check.
-- The final retest has no retest period, so retest_date stays empty and the
-- existing retest gates let the batch through until it expires.

begin;

create or replace view public.purchase_batch_status
with (security_invoker = on) as
select pl.id as purchase_line_id,
       coalesce(qc.status, 'not_submitted') as qc_status,
       qc.ar_number, qc.retest_date, qc.id as quality_check_id,
       qc.expiry_date
from public.purchase_lines pl
left join lateral (
  select * from public.quality_checks
  where purchase_line_id = pl.id
  order by created_at desc limit 1
) qc on true;

create or replace view public.production_batch_status
with (security_invoker = on) as
select pib.id as production_batch_id,
       coalesce(qc.status, 'not_submitted') as qc_status,
       qc.ar_number, qc.retest_date, qc.id as quality_check_id,
       qc.expiry_date
from public.production_issue_batches pib
left join lateral (
  select * from public.quality_checks
  where production_batch_id = pib.id
  order by created_at desc limit 1
) qc on true;

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
                           as stability_reserve_left,
  s.expiry_date
from public.purchase_lines pl
join public.items i on i.id = pl.item_id
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.purchase_batch_status s on s.purchase_line_id = pl.id;

create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
  v_prod_status public.production_batch_status%rowtype;
  v_pushed_at timestamptz;
  v_batch_number text;
begin
  if new.purchase_line_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(new.purchase_line_id, null));

    select pushed_at, batch_number into v_pushed_at, v_batch_number
      from public.purchase_lines where id = new.purchase_line_id;
    if v_pushed_at is null then
      raise exception 'Batch % can''t be used: its purchase order isn''t submitted (it may have been reopened for editing).',
        coalesce(v_batch_number, new.purchase_line_id::text)
        using errcode = 'P0001';
    end if;

    select * into v_status
    from public.purchase_batch_status
    where purchase_line_id = new.purchase_line_id;

    if v_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (purchase_line_id=%) is not QC-Approved and cannot be consumed', new.purchase_line_id;
    end if;

    if v_status.retest_date is not null and v_status.retest_date <= current_date then
      raise exception 'Batch (purchase_line_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.purchase_line_id, v_status.retest_date;
    end if;

    -- FB-0058 / FB-0061 (0098): past its expiry date a batch can never be used.
    if v_status.expiry_date is not null and v_status.expiry_date < current_date then
      raise exception 'Batch (purchase_line_id=%) expired on % and cannot be consumed',
        new.purchase_line_id, v_status.expiry_date;
    end if;

    return new;
  end if;

  if new.production_batch_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(null, new.production_batch_id));

    select * into v_prod_status
    from public.production_batch_status
    where production_batch_id = new.production_batch_id;

    if v_prod_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (production_batch_id=%) is not QC-Approved and cannot be consumed', new.production_batch_id;
    end if;

    if v_prod_status.retest_date is not null and v_prod_status.retest_date <= current_date then
      raise exception 'Batch (production_batch_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.production_batch_id, v_prod_status.retest_date;
    end if;

    if v_prod_status.expiry_date is not null and v_prod_status.expiry_date < current_date then
      raise exception 'Batch (production_batch_id=%) expired on % and cannot be consumed',
        new.production_batch_id, v_prod_status.expiry_date;
    end if;

    return new;
  end if;

  return new;
end $$;

create or replace function public.trg_fn_fp_component_fifo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_batch   text;
  v_item    uuid;
  o         record;
  v_name    text;
begin
  if new.purchase_line_id is not null then
    select created_at, batch_number, item_id into v_created, v_batch, v_item
      from public.purchase_lines where id = new.purchase_line_id;
  elsif new.production_batch_id is not null then
    select created_at, batch_number, item_id into v_created, v_batch, v_item
      from public.production_issue_batches where id = new.production_batch_id;
  else
    return new;
  end if;
  if v_item is null or v_created is null then
    return new;
  end if;

  -- One item at a time: a second person composing the same item waits here,
  -- then sees the first person's draw.
  perform pg_advisory_xact_lock(hashtext('fifo-item'), hashtext(v_item::text));

  select x.batch_number, x.remaining, x.unit, x.created_at into o
  from (
    select pl.batch_number, pl.live_remaining_qty as remaining, pl.unit, pl.created_at
      from public.purchase_lines pl
      join public.purchase_batch_status s on s.purchase_line_id = pl.id
     where pl.item_id = v_item
       and pl.active
       and pl.pushed_at is not null
       and pl.live_remaining_qty > 0
       and pl.created_at < v_created
       and pl.id is distinct from new.purchase_line_id
       and s.qc_status = 'approved'
       and (s.retest_date is null or s.retest_date > current_date)
       and (s.expiry_date is null or s.expiry_date >= current_date)
    union all
    select pb.batch_number, pb.live_remaining_qty, pb.unit, pb.created_at
      from public.production_issue_batches pb
      join public.production_batch_status s on s.production_batch_id = pb.id
     where pb.item_id = v_item
       and pb.active
       and pb.live_remaining_qty > 0
       and pb.created_at < v_created
       and pb.id is distinct from new.production_batch_id
       and s.qc_status = 'approved'
       and (s.retest_date is null or s.retest_date > current_date)
       and (s.expiry_date is null or s.expiry_date >= current_date)
  ) x
  order by x.created_at, x.batch_number
  limit 1;

  if found then
    select coalesce(item_code || ' ' || name, name) into v_name from public.items where id = v_item;
    raise exception 'Oldest stock must be used first. Batch % of % (% % still available) is older than batch % and has to be used before it.',
      o.batch_number, v_name, o.remaining, o.unit, coalesce(v_batch, '?')
      using errcode = 'P0001';
  end if;

  return new;
end $$;

commit;
