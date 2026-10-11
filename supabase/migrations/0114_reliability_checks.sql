-- 0114: Reliability and speed (category 9 of the scan)
--
-- SCAN-P3-05: stock is kept in two places (the ledger, and the remaining quantity on each
--   batch) that nothing compared. stock_integrity_check() runs nine read-only checks over
--   them; the System Administrator reads the result on the new "Stock Integrity Check" page.
-- SCAN-P6-03: the New packaging issue page read every finished product batch, quality check,
--   packaging issue and item to work out which batches are approved and how much of each is
--   left. The view fp_batch_packing_options gives it one row per approved batch, with the
--   quantity left worked out by the database (same figure the packaging guard enforces).
-- SCAN-P10-07: seven functions and two views took "today" or the year from the session time
--   zone. The functions now carry the India time zone themselves; the views name it.
--
-- Nothing here changes data. Signed-in users keep every right they had.

begin;

-- ------------------------------------------------------------
-- 1. Stock integrity check (SCAN-P3-05)
-- ------------------------------------------------------------

-- Runs one check (a query written below, never user input) and returns how many rows it
-- found, plus the first 20 of them. Internal: not callable by signed-in users.
create or replace function public._integrity_run(p_sql text)
returns table(problems integer, sample jsonb)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query execute format(
    'select count(*)::int, coalesce(jsonb_agg(to_jsonb(t) - ''rn'') filter (where t.rn <= 20), ''[]''::jsonb)
       from (select q.*, row_number() over () as rn from (%s) q) t', p_sql);
end $$;
revoke all on function public._integrity_run(text) from public, anon, authenticated;
grant execute on function public._integrity_run(text) to service_role;

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

  -- S1: every ledger row type is counted in exactly one part of the Stock Position
  select * into r from public._integrity_run($q$
    select i.item_code, p.on_hand,
           p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
           - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected as parts_total
      from item_position p join items i on i.id = p.item_id
     where p.on_hand is distinct from
           p.received + p.yielded - p.held_qc - p.held_stability - p.held_rnd - p.consumed_by_fp - p.issued_packaging
           - p.wastage - p.consumed_by_packaging + p.packaged_yield - p.issued_store - p.issued_rnd + p.production_rm_yield - p.rejected
  $q$);
  code := 'S1'; title := 'An item''s On hand equals the sum of its parts on Stock Position'; problems := r.problems; sample := r.sample; return next;

  -- S2: each submitted purchase batch's remaining quantity equals what the ledger shows for it
  select * into r from public._integrity_run($q$
    with led as (
      select purchase_line_id, sum(case event_type when 'push' then quantity else -quantity end) as net
        from inventory_ledger where purchase_line_id is not null and reference_type is distinct from 'qc_rejected' group by 1)
    select i.item_code, pl.batch_number, pl.live_remaining_qty, coalesce(l.net, 0) as ledger_net,
           pl.live_remaining_qty - coalesce(l.net, 0) as difference
      from purchase_lines pl join items i on i.id = pl.item_id left join led l on l.purchase_line_id = pl.id
     where pl.pushed_at is not null and pl.live_remaining_qty is distinct from coalesce(l.net, 0)
     order by 1, 2
  $q$);
  code := 'S2'; title := 'A purchase batch''s remaining quantity equals what the ledger shows for it'; problems := r.problems; sample := r.sample; return next;

  -- S3: raw material issued to production, remaining equals quantity less what the ledger shows used
  select * into r from public._integrity_run($q$
    with led as (
      select production_batch_id, sum(case event_type when 'push' then quantity else -quantity end) as net
        from inventory_ledger where production_batch_id is not null group by 1)
    select i.item_code, pb.id as production_batch_id, pb.quantity, pb.live_remaining_qty, coalesce(l.net, 0) as ledger_net
      from production_issue_batches pb join items i on i.id = pb.item_id left join led l on l.production_batch_id = pb.id
     where pb.active and pb.live_remaining_qty is distinct from pb.quantity + coalesce(l.net, 0)
  $q$);
  code := 'S3'; title := 'A production-issued raw material batch''s remaining quantity equals what the ledger shows'; problems := r.problems; sample := r.sample; return next;

  -- S4: nothing is below zero
  select * into r from public._integrity_run($q$
    select 'item on hand below zero' as issue, i.item_code as ref, b.on_hand::text as value from stock_balance b join items i on i.id = b.item_id where b.on_hand < 0
    union all
    select 'batch remaining below zero', pl.batch_number, pl.live_remaining_qty::text from purchase_lines pl where pl.live_remaining_qty < 0
    union all
    select 'production batch remaining below zero', pb.id::text, pb.live_remaining_qty::text from production_issue_batches pb where pb.live_remaining_qty < 0
  $q$);
  code := 'S4'; title := 'No item or batch is below zero'; problems := r.problems; sample := r.sample; return next;

  -- S5: lines that are not submitted carry no purchase quantity in the ledger
  select * into r from public._integrity_run($q$
    select pl.batch_number, po.po_number, po.status,
           sum(case l.event_type when 'push' then l.quantity else -l.quantity end) as purchase_net
      from purchase_lines pl join purchase_orders po on po.id = pl.purchase_order_id
      join inventory_ledger l on l.purchase_line_id = pl.id and l.reference_type = 'purchase' and l.reference_id = pl.id
     where pl.pushed_at is null
     group by pl.batch_number, po.po_number, po.status
    having sum(case l.event_type when 'push' then l.quantity else -l.quantity end) <> 0
  $q$);
  code := 'S5'; title := 'A purchase line that is not submitted has no stock in the ledger'; problems := r.problems; sample := r.sample; return next;

  -- S6: ledger units and items agree with the item and its batch
  select * into r from public._integrity_run($q$
    select l.id, i.item_code, l.unit as ledger_unit, i.unit as item_unit, l.event_type, l.reference_type, l.quantity
      from inventory_ledger l join items i on i.id = l.item_id
     where l.unit is distinct from i.unit
    union all
    select l.id, i.item_code, null, null, l.event_type, 'item differs from batch item', l.quantity
      from inventory_ledger l join purchase_lines pl on pl.id = l.purchase_line_id join items i on i.id = l.item_id
     where pl.item_id <> l.item_id
  $q$);
  code := 'S6'; title := 'Every ledger row uses its item''s unit and its batch''s item'; problems := r.problems; sample := r.sample; return next;

  -- S7: finished product ledger On hand equals the bulk left on approved batches
  select * into r from public._integrity_run($q$
    with b as (
      select md.finished_product_item_id as item_id,
             sum(greatest(coalesce(fpb.batch_yield,0) - coalesce(fpb.qc_sample_qty,0) - coalesce(fpb.stability_qty,0)
                          - coalesce(fpb.rnd_qty,0) - coalesce(iss.bulk,0), 0)) as bulk
        from public.finished_product_batches fpb
        join public.mfr_definitions md on md.id = fpb.mfr_definition_id
        left join lateral (select sum(pi.fp_qty_consumed) as bulk from public.packaging_issues pi
                            where pi.finished_product_batch_id = fpb.id) iss on true
       where fpb.active and fpb.status = 'approved'
       group by 1)
    select i.item_code, round(coalesce(sb.on_hand,0),3) as ledger_on_hand, round(b.bulk,3) as batch_bulk
      from b join public.items i on i.id = b.item_id
      left join public.stock_balance sb on sb.item_id = i.id
     where abs(coalesce(sb.on_hand,0) - b.bulk) > 0.0005
  $q$);
  code := 'S7'; title := 'A finished product''s ledger On hand equals the bulk left on its approved batches'; problems := r.problems; sample := r.sample; return next;

  -- S8: no duplicate batch numbers
  select * into r from public._integrity_run($q$
    select 'purchase batch' as kind, pl.item_id, pl.batch_number, count(*) as n
      from public.purchase_lines pl where pl.active group by pl.item_id, pl.batch_number having count(*) > 1
    union all
    select 'finished product batch', null, fpb.batch_number, count(*)
      from public.finished_product_batches fpb where fpb.active group by fpb.batch_number having count(*) > 1
  $q$);
  code := 'S8'; title := 'No batch number is used twice for the same item'; problems := r.problems; sample := r.sample; return next;

  -- S9: no orphans
  select * into r from public._integrity_run($q$
    select 'submitted line without receipt push' as problem, pl.id::text as ref
      from public.purchase_lines pl join public.purchase_orders po on po.id = pl.purchase_order_id and po.status = 'submitted'
     where pl.active and pl.pushed_at is not null
       and not exists (select 1 from public.inventory_ledger l
                        where l.purchase_line_id = pl.id and l.event_type = 'push' and l.reference_type = 'purchase')
    union all
    select 'receipt push on a line that is not submitted', l.id::text
      from public.inventory_ledger l join public.purchase_lines pl on pl.id = l.purchase_line_id
      join public.purchase_orders po on po.id = pl.purchase_order_id
     where l.event_type = 'push' and l.reference_type = 'purchase' and (po.status <> 'submitted' or pl.pushed_at is null)
    union all
    select 'QC record with no batch', q.id::text
      from public.quality_checks q
     where q.purchase_line_id is null and q.production_batch_id is null and q.finished_product_batch_id is null
  $q$);
  code := 'S9'; title := 'Every submitted line has its receipt in the ledger, and every QC record has a batch'; problems := r.problems; sample := r.sample; return next;
end $$;
revoke all on function public.stock_integrity_check() from public, anon;
grant execute on function public.stock_integrity_check() to authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Packaging issue: approved batches with the quantity left (SCAN-P6-03)
-- ------------------------------------------------------------
-- left_qty: yield less samples (QC, stability, R&D), in the finished product's stock unit,
-- less what packaging issues already took: the same figure trg_fn_packaging_batch_balance
-- enforces. Null when the batch has no yield recorded (older data).
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
                   (fpb.batch_yield - coalesce(fpb.qc_sample_qty, 0) - coalesce(fpb.stability_qty, 0) - coalesce(fpb.rnd_qty, 0))
                   * coalesce(public.convert_unit(1, fpb.unit, coalesce(it.unit, fpb.unit)), 1)
                   - coalesce(iss.issued, 0), 0)
       end as left_qty
  from public.finished_product_batches fpb
  left join public.mfr_definitions md on md.id = fpb.mfr_definition_id
  left join public.items it on it.id = md.finished_product_item_id
  left join (select finished_product_batch_id, sum(fp_qty_consumed) as issued
               from public.packaging_issues group by finished_product_batch_id) iss
         on iss.finished_product_batch_id = fpb.id
 where fpb.active and fpb.status = 'approved';

revoke all on public.fp_batch_packing_options from public, anon;
grant select on public.fp_batch_packing_options to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.fp_batch_packing_options from authenticated;

-- ------------------------------------------------------------
-- 3. India time (SCAN-P10-07)
-- ------------------------------------------------------------
-- The function carries the zone itself, so the year in a batch number and "today" in the
-- expiry and retest rules are India's whatever the connection's setting is (a restored
-- backup, a new database role, a second environment).
alter function public.get_next_batch_number(uuid) set timezone = 'Asia/Kolkata';
alter function public.get_next_fp_batch_number(uuid) set timezone = 'Asia/Kolkata';
alter function public.get_next_production_batch_number(uuid) set timezone = 'Asia/Kolkata';
alter function public.get_next_coa_number() set timezone = 'Asia/Kolkata';
alter function public.check_batch_qc_approved() set timezone = 'Asia/Kolkata';
alter function public.start_retest(uuid, uuid, numeric, text) set timezone = 'Asia/Kolkata';
alter function public.trg_fn_fp_component_fifo() set timezone = 'Asia/Kolkata';

-- The two views name the zone in the expression (a view cannot carry the setting).

create or replace view public.current_qc_approvals
with (security_invoker = on) as
select q.id as quality_check_id,
       q.purchase_line_id,
       q.finished_product_batch_id,
       q.production_batch_id,
       q.retest_date
  from public.quality_checks q
 where q.status = 'approved'
   and (q.finished_product_batch_id is not null
        or q.retest_date is null
        or q.retest_date > (now() at time zone 'Asia/Kolkata')::date)
   and not exists (
         select 1 from public.quality_checks n
          where n.purchase_line_id = q.purchase_line_id
            and n.id <> q.id
            and (n.created_at > q.created_at or (n.created_at = q.created_at and n.id > q.id)))
   and not exists (
         select 1 from public.quality_checks n
          where n.finished_product_batch_id = q.finished_product_batch_id
            and n.id <> q.id
            and (n.created_at > q.created_at or (n.created_at = q.created_at and n.id > q.id)))
   and not exists (
         select 1 from public.quality_checks n
          where n.production_batch_id = q.production_batch_id
            and n.id <> q.id
            and (n.created_at > q.created_at or (n.created_at = q.created_at and n.id > q.id)));
revoke all on public.current_qc_approvals from public, anon;
grant select on public.current_qc_approvals to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.current_qc_approvals from authenticated;

create or replace view public.item_stock_status
with (security_invoker = on) as
with batches as (
  select pl.item_id, pl.live_remaining_qty as qty,
         q.status as qc_status, q.retest_date, q.expiry_date
    from public.purchase_lines pl
    join public.items i on i.id = pl.item_id and i.category = 'raw'
    left join lateral (
      select x.status, x.retest_date, x.expiry_date
        from public.quality_checks x
       where x.purchase_line_id = pl.id
       order by x.created_at desc, x.id desc limit 1
    ) q on true
   where pl.pushed_at is not null
     and pl.active
     and pl.live_remaining_qty > 0
  union all
  select pb.item_id, pb.live_remaining_qty,
         q.status, q.retest_date, q.expiry_date
    from public.production_issue_batches pb
    left join lateral (
      select x.status, x.retest_date, x.expiry_date
        from public.quality_checks x
       where x.production_batch_id = pb.id
       order by x.created_at desc, x.id desc limit 1
    ) q on true
   where pb.active
     and pb.live_remaining_qty > 0
), classified as (
  select item_id, qty,
         case
           when qc_status = 'approved' and expiry_date is not null and expiry_date < (now() at time zone 'Asia/Kolkata')::date then 'expired'
           when qc_status = 'approved' and retest_date is not null and retest_date <= (now() at time zone 'Asia/Kolkata')::date then 'retest_due'
           when qc_status = 'approved' then 'usable'
           when qc_status = 'rejected' then 'rejected'
           else 'awaiting_qc'
         end as state
    from batches
)
select item_id,
       coalesce(sum(qty) filter (where state = 'usable'), 0)      as usable,
       coalesce(sum(qty) filter (where state = 'awaiting_qc'), 0) as awaiting_qc,
       coalesce(sum(qty) filter (where state = 'retest_due'), 0)  as retest_due,
       coalesce(sum(qty) filter (where state = 'expired'), 0)     as expired
  from classified
 group by item_id;
revoke all on public.item_stock_status from public, anon;
grant select on public.item_stock_status to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.item_stock_status from authenticated;

commit;
