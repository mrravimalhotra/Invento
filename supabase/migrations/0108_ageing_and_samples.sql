-- ============================================================
-- Two inventory reports (Ravi, 10 Oct 2026: inventory reporting
-- recommendations 4 and 5).
--
-- batch_ageing: every approved batch that still has something to
--   age: raw material (bought), raw material made from a production
--   issue, and finished product. One row per batch with the latest
--   approved QC's retest date and expiry date, the quantity still
--   in stock (raw material: live remaining; finished product: bulk
--   not yet packed or sampled) and the AR number.
--
-- retained_samples: the QC, Stability and R&D samples taken from each
--   batch (raw, production raw material, finished product), with the
--   stability reserve still unused for raw material, and the batch's
--   QC status.
--
-- Views only, security invoker; nothing is stored.
-- ============================================================

begin;

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
   and pl.live_remaining_qty > 0
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
   and pb.live_remaining_qty > 0
   and (s.retest_date is not null or s.expiry_date is not null)
union all
select 'fp',
       fpb.id,
       i.id,
       i.item_code,
       coalesce(i.name, md.name),
       fpb.batch_number || coalesce(' (' || fpb.short_batch_no || ')', ''),
       fpb.unit,
       greatest(coalesce(fpb.batch_yield, 0) - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0)
                - coalesce(fpb.rnd_qty, 0) - coalesce(fpb.packaged_qty, 0), 0),
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
       null::numeric,
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

grant select on public.batch_ageing, public.retained_samples to authenticated;
revoke all on public.batch_ageing, public.retained_samples from anon;

commit;
