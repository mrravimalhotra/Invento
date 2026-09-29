-- ============================================================
-- purchase_line_qc — one row per purchase line with its item, PO status and
-- current QC status already joined (accuracy audit ACC-08, 29 Sept 2026).
--
-- Why: the QC page's "Awaiting QC" / "Due for retest" cards and the New AR
-- batch picker first fetched EVERY purchase line with a given QC status from
-- purchase_batch_status (packaging lines, draft-PO lines and all legacy
-- lines included — tens of thousands), then looked those ids up again in
-- purchase_lines with the real filters. Supabase returns at most 1,000 rows
-- per request, so the first step returned an arbitrary 1,000 and a batch
-- that had just arrived could be missing — and then couldn't be given an AR
-- number. (Passing thousands of ids back in the second request also makes
-- an over-long URL.)
--
-- This view lets those screens ask for exactly what they need in ONE
-- filtered request (e.g. qc_status = 'not_submitted', po_status =
-- 'submitted', item_category = 'raw'), with the filters applied in the
-- database before any row limit. QC status comes from purchase_batch_status,
-- so the "latest QC record" rule is unchanged.
--
-- security_invoker: the reader's own access rules apply (0075), and anon has
-- no access — same as the other reporting views.
-- ============================================================

begin;

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
  s.quality_check_id
from public.purchase_lines pl
join public.items i on i.id = pl.item_id
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.purchase_batch_status s on s.purchase_line_id = pl.id;

revoke all on public.purchase_line_qc from anon;
revoke insert, update, delete, truncate, references, trigger on public.purchase_line_qc from authenticated;
grant select on public.purchase_line_qc to authenticated;

commit;
