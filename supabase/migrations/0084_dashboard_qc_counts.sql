-- ACC-26 (29 Sept 2026): the Dashboard's "Pending QC" card and "QC by status"
-- chart need to honour the app-wide "Hide legacy data" switch, like every
-- list does. A QC record is legacy if the item, or the purchase / finished
-- product / production batch it was raised against, carries a LEG- code
-- (the same rule as app/(dashboard)/qc/qc-table.tsx). That spans four tables,
-- so the counts are done here in one query instead of paging thousands of QC
-- rows to the browser.
--
-- One row per QC status: how many records there are in total, and how many of
-- those are not legacy. Read-only, runs as the caller (row-level security
-- applies), so it can show nothing a signed-in user could not already list.

create or replace function public.dashboard_qc_counts()
returns table (status text, total bigint, non_legacy bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    q.status,
    count(*)::bigint as total,
    (count(*) filter (
      where not (
        coalesce(i.item_code, '') like 'LEG-%'
        or coalesce(pl.batch_number, '') like 'LEG-%'
        or coalesce(fp.batch_number, '') like 'LEG-%'
        or coalesce(pb.batch_number, '') like 'LEG-%'
      )
    ))::bigint as non_legacy
  from public.quality_checks q
  left join public.items i on i.id = q.item_id
  left join public.purchase_lines pl on pl.id = q.purchase_line_id
  left join public.finished_product_batches fp on fp.id = q.finished_product_batch_id
  left join public.production_issue_batches pb on pb.id = q.production_batch_id
  group by q.status
$$;

revoke all on function public.dashboard_qc_counts() from public, anon;
grant execute on function public.dashboard_qc_counts() to authenticated;
