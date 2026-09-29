-- 0083_stock_position_reconciles.sql
-- Accuracy audit ACC-21 (29 Sept 2026): the Stock Position breakdown did not
-- add up to On hand.
--
-- item_position (0031, extended 0032/0050) counted only the original movement
-- kinds. Three kinds of movement changed On hand without touching any breakdown
-- column:
--
--   1. PO reopen (0078) takes the receipt back out of stock ('pull' with
--      reference 'purchase') — Received still showed the full receipt.
--   2. PO reopen also puts the QC / Stability / R&D samples back ('push' with
--      reference 'qc_sample' / 'stability_sample' / 'rnd_sample') — the
--      "held" columns still showed the samples as held.
--   3. Cancelling a draft FP batch puts its components back ('push' with
--      reference 'fp_draft_cancelled') — "FP use" still showed them as used.
--
-- Example from the audit: Received 1,000 − FP use 602.1 ≠ On hand 497.9.
--
-- Fix: those columns are now NET of their own reversals, so each one is what
-- is really outstanding:
--
--   received        = receipts − reopen reversals
--   held_qc/…/rnd   = samples taken − samples returned
--   consumed_by_fp  = components used − components returned by cancelled drafts
--
-- The breakdown then adds up to on_hand for every item:
--
--   on_hand = received + yielded + production_rm_yield + packaged_yield
--             − held_qc − held_stability − held_rnd − consumed_by_fp
--             − issued_packaging − consumed_by_packaging
--             − issued_store − issued_rnd − wastage
--
-- (production_rm_yield already existed as a column; the screens did not show
-- it, so raw material made from production issues showed "Received 0". The
-- screens now show it as "Produced".)
--
-- Same columns, names, types and order as 0050, so `create or replace` is
-- enough; on_hand keeps its exact expression (stock_balance agrees with it).
-- The view options and grants set in 0075 are re-applied to be safe.

create or replace view public.item_position as
select
  i.id as item_id,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'purchase' then -l.quantity
                    else 0 end), 0) as received,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'fp_yield' then l.quantity else 0 end), 0) as yielded,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample') then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'qc_sample' then -l.quantity
                    else 0 end), 0) as held_qc,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'stability_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'stability_sample' then -l.quantity
                    else 0 end), 0) as held_stability,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'rnd_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'rnd_sample' then -l.quantity
                    else 0 end), 0) as held_rnd,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'fp_draft_cancelled' then -l.quantity
                    else 0 end), 0) as consumed_by_fp,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaging' then l.quantity else 0 end), 0) as issued_packaging,
  coalesce(sum(case when l.event_type = 'wastage' then l.quantity else 0 end), 0) as wastage,
  coalesce(sum(case l.event_type when 'push' then l.quantity when 'wastage' then -l.quantity else -l.quantity end), 0) as on_hand,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'fp_packaging_pull' then l.quantity else 0 end), 0) as consumed_by_packaging,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'packaged_fp_yield' then l.quantity else 0 end), 0) as packaged_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then l.quantity else 0 end), 0) as issued_store,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then l.quantity else 0 end), 0) as issued_rnd,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'production_rm_yield' then l.quantity else 0 end), 0) as production_rm_yield
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;

alter view public.item_position set (security_invoker = on);
revoke all on public.item_position from anon;
revoke insert, update, delete, truncate, references, trigger on public.item_position from authenticated;
grant select on public.item_position to authenticated;
