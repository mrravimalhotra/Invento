-- 0122: Stock Integrity Check S9 compares the net receipt (LW-11)
-- S9 flagged any purchase receipt row on a line that is not submitted, so a
-- purchase order that was submitted and then reopened (receipt plus its reversal,
-- net 0) showed as a difference. S9 now flags such a line only when its purchase
-- receipts do not net to zero. The rest of the function is unchanged from 0120.

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
    select 'The ledger still counts a receipt for a line that is not submitted', i.item_code, pl.batch_number
      from public.purchase_lines pl
      join public.purchase_orders po on po.id = pl.purchase_order_id
      join public.items i on i.id = pl.item_id
      join public.inventory_ledger l on l.purchase_line_id = pl.id and l.reference_type = 'purchase'
     where po.status <> 'submitted' or pl.pushed_at is null
     group by pl.id, i.item_code, pl.batch_number
    having sum(case l.event_type when 'push' then l.quantity else -l.quantity end) <> 0
    union all
    select 'This QC record points to no batch', null, q.ar_number
      from public.quality_checks q
     where q.purchase_line_id is null and q.production_batch_id is null and q.finished_product_batch_id is null
  $q$);
  code := 'S9'; title := 'Every submitted line has its receipt in the ledger, and every QC record has a batch'; problems := r.problems; sample := r.sample; return next;
end $$;
revoke all on function public.stock_integrity_check() from public, anon;
grant execute on function public.stock_integrity_check() to authenticated, service_role;
