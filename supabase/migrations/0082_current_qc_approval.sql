-- ============================================================
-- A COA only for a batch's CURRENT approval (accuracy audit ACC-15 —
-- claude/app-accuracy-audit-2026-09-28.md; Ravi, 29 Sept 2026: "Start
-- Implementation").
--
-- The New COA picker offered every QC record that had EVER been approved.
-- So a certificate could be issued for a batch that is now rejected, has a
-- retest in progress, or is past its retest date — quoting an approval that
-- no longer stands.
--
-- current_qc_approvals lists the QC records that are a batch's standing
-- approval today:
--   - status approved;
--   - the LATEST QC record for its batch (a later retest, pending or
--     decided, supersedes it);
--   - for raw-material and production batches, retest date not yet reached
--     (finished products have no retest workflow, so their retest date
--     doesn't retire the approval).
--
-- The New COA picker lists only these; saving a COA re-checks it, and the
-- database refuses a COA for any other QC record (backstop).
-- ============================================================

begin;

create index if not exists quality_checks_production_batch_id_idx
  on public.quality_checks (production_batch_id);

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
        or q.retest_date > current_date)
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

create or replace function public.qc_is_current_approval(p_quality_check_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.current_qc_approvals where quality_check_id = p_quality_check_id);
$$;

revoke all on function public.qc_is_current_approval(uuid) from public, anon;
grant execute on function public.qc_is_current_approval(uuid) to authenticated;

-- Backstop: a new COA must quote a batch's current approval.
create or replace function public.trg_fn_coa_current_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ar text;
begin
  if new.quality_check_id is null then
    return new;
  end if;
  if not public.qc_is_current_approval(new.quality_check_id) then
    select ar_number into v_ar from public.quality_checks where id = new.quality_check_id;
    raise exception 'A COA can''t be issued against AR % — it is no longer this batch''s current approval (the batch was retested, rejected or is due for retest).',
      coalesce(v_ar, new.quality_check_id::text)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_coa_current_approval on public.coa_records;
create trigger trg_coa_current_approval
  before insert on public.coa_records
  for each row execute function public.trg_fn_coa_current_approval();

commit;
