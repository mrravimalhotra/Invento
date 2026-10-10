-- ============================================================
-- Stock statement for a date range (Ravi, 10 Oct 2026: inventory
-- reporting recommendation 2).
--
-- stock_statement(from, to, category) returns one row per item that
-- had stock at the start of the range or any movement in it:
--
--   opening   stock on hand at the start of the From day (India time)
--   in:       purchased, produced (batch yields), other in
--   out:      used in production, packaging and issues, samples,
--             wastage, rejected by QC, other out
--   closing   opening + in - out = stock on hand at the end of the To day
--
-- Same arithmetic as stock_balance (push adds; pull and wastage take
-- away), so closing for a To date of today equals On hand on Stock
-- Position. The ledger is append-only, so a past date gives the same
-- answer every time. Nothing is stored. Security invoker.
-- ============================================================

begin;

drop function if exists public.stock_statement(date, date, text);

create or replace function public.stock_statement(p_from date, p_to date, p_category text default null)
returns table (
  item_id uuid,
  item_code text,
  item_name text,
  category text,
  unit text,
  opening numeric,
  purchased numeric,
  produced numeric,
  other_in numeric,
  used_in_production numeric,
  packaging numeric,
  samples numeric,
  wastage numeric,
  rejected numeric,
  other_out numeric,
  closing numeric
)
language plpgsql stable as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_from is null or p_to is null then
    raise exception 'Choose both a From and a To date.' using errcode = 'P0001';
  end if;
  if p_from > p_to then
    raise exception 'The From date cannot be after the To date.' using errcode = 'P0001';
  end if;
  if p_to > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The To date cannot be in the future.' using errcode = 'P0001';
  end if;
  if p_category is not null and p_category not in ('raw', 'processed', 'packaging', 'packaged_fp') then
    raise exception 'Unknown category.' using errcode = 'P0001';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';

  return query
  with m as (
    select l.item_id,
           sum(case when l.event_at < v_from then (case when l.event_type = 'push' then l.quantity else -l.quantity end) else 0 end) as opening,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity else 0 end) as purchased,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and l.reference_type in ('fp_yield', 'packaged_fp_yield', 'production_rm_yield') then l.quantity else 0 end) as produced,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and coalesce(l.reference_type, '') not in ('purchase', 'fp_yield', 'packaged_fp_yield', 'production_rm_yield') then l.quantity else 0 end) as other_in,
           sum(case when l.event_at >= v_from and l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity else 0 end) as used_in_production,
           sum(case when l.event_at >= v_from and l.event_type = 'pull' and l.reference_type in ('packaging', 'fp_packaging_pull', 'packaged_fp_issue') then l.quantity else 0 end) as packaging,
           sum(case when l.event_at >= v_from and l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample', 'stability_sample', 'rnd_sample') then l.quantity else 0 end) as samples,
           sum(case when l.event_at >= v_from and l.event_type = 'wastage' then l.quantity else 0 end) as wastage,
           sum(case when l.event_at >= v_from and l.event_type = 'pull' and l.reference_type = 'qc_rejected' then l.quantity else 0 end) as rejected,
           sum(case when l.event_at >= v_from and l.event_type = 'pull'
                     and coalesce(l.reference_type, '') not in ('finished_product', 'packaging', 'fp_packaging_pull', 'packaged_fp_issue', 'qc', 'qc_sample', 'stability_sample', 'rnd_sample', 'qc_rejected')
                    then l.quantity else 0 end) as other_out
      from public.inventory_ledger l
     where l.event_at < v_to
     group by l.item_id
  )
  select i.id, i.item_code, i.name, i.category, i.unit,
         m.opening, m.purchased, m.produced, m.other_in,
         m.used_in_production, m.packaging, m.samples, m.wastage, m.rejected, m.other_out,
         m.opening + m.purchased + m.produced + m.other_in
           - m.used_in_production - m.packaging - m.samples - m.wastage - m.rejected - m.other_out
    from m
    join public.items i on i.id = m.item_id
   where (p_category is null or i.category = p_category)
     and (m.opening <> 0 or m.purchased <> 0 or m.produced <> 0 or m.other_in <> 0
          or m.used_in_production <> 0 or m.packaging <> 0 or m.samples <> 0
          or m.wastage <> 0 or m.rejected <> 0 or m.other_out <> 0)
   order by i.item_code, i.id;
end $$;

revoke all on function public.stock_statement(date, date, text) from public, anon;
grant execute on function public.stock_statement(date, date, text) to authenticated;

commit;
