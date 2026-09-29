-- ============================================================
-- Part A form fixes (29 Sept 2026): A5 and A6 of the master list.
--
-- A5 (FB-0025, rest): a batch could be completed with a finish date earlier
-- than its start date. The app now checks this; this CHECK is the backstop
-- for a direct API call. NOT VALID, the project's usual idiom (0016, 0036,
-- 0044): it applies to new writes only and never scans or rejects a row
-- that already exists. The comparison ignores rows where either date is
-- missing.
--
-- A6: "Submit to QC" for a finished product batch was two separate writes
-- (insert the QC record, then set the batch status). If the second failed,
-- the batch stayed "Complete - Awaiting QC" with a QC record already made
-- and a retry said "already submitted". submit_fp_batch_to_qc() does the AR
-- number, the QC insert and the status change in one transaction.
-- SECURITY INVOKER: it runs as the signed-in user, so row-level security
-- and the workflow guards (0070) apply exactly as they did for the two
-- separate calls. Any error rolls back all three steps.
-- ============================================================

alter table public.finished_product_batches
  drop constraint if exists fp_finish_not_before_start;
alter table public.finished_product_batches
  add constraint fp_finish_not_before_start
  check (finish_date is null or batch_start_date is null or finish_date >= batch_start_date) not valid;

create or replace function public.submit_fp_batch_to_qc(p_batch_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  b record;
  v_ar text;
  v_qc uuid;
begin
  select status, batch_yield, finish_date, qc_sample_qty, unit, expiry_month
    into b
    from public.finished_product_batches
   where id = p_batch_id
   for update;
  if not found then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;
  if b.status <> 'complete_awaiting_qc' then
    raise exception 'Only a batch that has been completed (Complete - Awaiting QC) can be submitted to QC.'
      using errcode = 'P0001';
  end if;
  if b.batch_yield is null or b.batch_yield <= 0 or b.finish_date is null then
    raise exception 'Complete the batch (batch yield, finish date, expiry date, sample quantities) before submitting to QC.'
      using errcode = 'P0001';
  end if;

  v_ar := public.get_next_ar_number();

  insert into public.quality_checks
    (ar_number, finished_product_batch_id, sample_qty, sample_unit, expiry_date, created_by)
  values
    (v_ar, p_batch_id, b.qc_sample_qty, b.unit, b.expiry_month, auth.uid())
  returning id into v_qc;

  update public.finished_product_batches
     set status = 'submitted_to_qc'
   where id = p_batch_id;

  return v_qc;
end;
$$;

revoke all on function public.submit_fp_batch_to_qc(uuid) from public, anon;
grant execute on function public.submit_fp_batch_to_qc(uuid) to authenticated;
