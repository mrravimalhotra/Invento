-- ============================================================
-- Arithmetic and quantity fixes from the full-app scan (Ravi, 11 Oct 2026):
--
-- SCAN-P5-05  A finished product batch whose yield is outside the MFR's range
--             needs a written reason, stored with the batch and shown to QC.
--             New column finished_product_batches.yield_reason.
--
-- SCAN-P5-08  A raw material batch with less than 0.0005 left (a rounding speck
--             such as 0.0003 kg) no longer blocks newer batches in the
--             oldest-stock-first check, and is not listed in Expiry and Retest
--             Ageing. The speck is ignored, not deleted.
--
-- SCAN-P6-06  Expiry and Retest Ageing showed the wrong "In stock" for a
--             finished product batch once it was packed: it subtracted the
--             number of packs instead of the bulk they used. It now shows
--             yield - samples - bulk used by packaging issues. A fully packed
--             batch stays listed (with 0) because its packs still age.
-- ============================================================

begin;

alter table public.finished_product_batches add column if not exists yield_reason text;
comment on column public.finished_product_batches.yield_reason is
  'Why the batch yield is outside the MFR yield range (required by the app when it is). Shown to QC.';

-- oldest-stock-first check: a speck below 0.0005 does not count as stock
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

  perform pg_advisory_xact_lock(hashtext('fifo-item'), hashtext(v_item::text));

  select x.batch_number, x.remaining, x.unit, x.created_at into o
  from (
    select pl.batch_number, pl.live_remaining_qty as remaining, pl.unit, pl.created_at
      from public.purchase_lines pl
      join public.purchase_batch_status s on s.purchase_line_id = pl.id
     where pl.item_id = v_item
       and pl.active
       and pl.pushed_at is not null
       and pl.live_remaining_qty >= 0.0005
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
       and pb.live_remaining_qty >= 0.0005
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
                - coalesce(fpb.rnd_qty, 0)
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

commit;
