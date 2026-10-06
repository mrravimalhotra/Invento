-- ============================================================
-- Stock Position by QC status (Ravi, 6 Oct 2026: inventory reporting,
-- recommendation 1 — "how much can production actually use?").
--
-- On hand mixes batches production can use with batches it cannot (awaiting
-- QC, due for retest, past expiry). The item page already split them; Stock
-- Position did not. item_stock_status gives the same split for every raw
-- material item, so Stock Position can show it in four columns.
--
-- Same rule as Compose and the database QC gate (lib/usable-stock.ts,
-- check_batch_qc_approved):
--   usable      QC-approved, retest date not reached, not past expiry, on a
--               submitted purchase order (or made from a production issue)
--   awaiting_qc no QC decision yet, or only Round 1 done
--   retest_due  approved, but the retest date has arrived
--   expired     approved, but past its expiry date
-- A batch QC rejected is not here: since 0104 it is out of On hand and is
-- listed under Rejected Materials.
--
-- Quantity is each batch's live_remaining_qty. For raw material the four
-- figures add up to On hand; whatever is on hand outside a batch (old
-- imported ledger rows) is shown on screen as "Not in a batch".
-- ============================================================

begin;

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
           when qc_status = 'approved' and expiry_date is not null and expiry_date < current_date then 'expired'
           when qc_status = 'approved' and retest_date is not null and retest_date <= current_date then 'retest_due'
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

commit;
