-- ============================================================
-- FB-0051 (1 Oct 2026, Namrata Gaikwad): "Issue start date missing" on Packaging.
-- Ravi: call it "Issue Date"; past dates allowed; future dates not; not added to
-- any printed document yet (decided later).
--
-- packaging_issues gets issue_date (a date, India time). Existing issues take the
-- day they were saved. New issues default to today and may be set to any earlier
-- day; create_packaging_issue() refuses a day after today (India time). The
-- date is purely informational: stock, FIFO and every other rule are unchanged.
-- ============================================================

begin;

alter table public.packaging_issues add column if not exists issue_date date;

update public.packaging_issues
   set issue_date = (created_at at time zone 'Asia/Kolkata')::date
 where issue_date is null;

alter table public.packaging_issues
  alter column issue_date set default ((now() at time zone 'Asia/Kolkata')::date),
  alter column issue_date set not null;

create or replace function public.create_packaging_issue(p_issue jsonb, p_materials jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  m jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_issue_date date := coalesce(nullif(p_issue->>'issue_date', '')::date, v_today);
begin
  if v_issue_date > v_today then
    raise exception 'Issue date cannot be in the future.' using errcode = '22023';
  end if;

  insert into public.packaging_issues
    (code, finished_product_batch_id, pack_size, pack_size_qty, pack_size_unit, fp_qty_consumed,
     unit_count, department, transaction_type, qc_qty, stability_qty, rnd_qty, issue_date)
  values
    (p_issue->>'code',
     (p_issue->>'finished_product_batch_id')::uuid,
     p_issue->>'pack_size',
     nullif(p_issue->>'pack_size_qty', '')::numeric,
     nullif(p_issue->>'pack_size_unit', ''),
     nullif(p_issue->>'fp_qty_consumed', '')::numeric,
     (p_issue->>'unit_count')::numeric,
     p_issue->>'department',
     'pack',
     nullif(p_issue->>'qc_qty', '')::numeric,
     nullif(p_issue->>'stability_qty', '')::numeric,
     nullif(p_issue->>'rnd_qty', '')::numeric,
     v_issue_date)
  returning id into v_id;

  for m in select * from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb))
  loop
    insert into public.packaging_issue_items (packaging_issue_id, item_id, quantity, unit)
    values (v_id, (m->>'item_id')::uuid, (m->>'quantity')::numeric, m->>'unit');
  end loop;

  return v_id;
end $$;

revoke all on function public.create_packaging_issue(jsonb, jsonb) from public, anon;
grant execute on function public.create_packaging_issue(jsonb, jsonb) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'packaging_issues'
                   and column_name = 'issue_date' and is_nullable = 'NO') then
    raise exception '0092 self-check failed: packaging_issues.issue_date missing or nullable.';
  end if;
  if position('Issue date cannot be in the future' in pg_get_functiondef('public.create_packaging_issue(jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '0092 self-check failed: create_packaging_issue lacks the future-date check.';
  end if;
end $$;

commit;
