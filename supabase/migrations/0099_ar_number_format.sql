-- 0099: Analytical Report No. format by product type (FB-0059)
--
-- Ravi, 3 Oct 2026: Raw material  ARRM-0001/26
--                    Finished product ARFP-0001/26
-- (prefix, 4-digit running number, / and the 2-digit year). Each type has its own
-- counter and each counter starts again at 0001 every year (India time), like batch
-- numbers. Numbers already issued (AR-001-DDMMYYYY) keep their form.
--
-- The number never overflows: padding is a minimum width (_pad_seq_code, 0069), so
-- after ARRM-9999/26 comes ARRM-10000/26, never a truncated or repeated number.
-- A sequence per type and year hands the numbers out, so two people assigning an AR at
-- the same moment cannot get the same one (a failed save may leave a gap).
--
-- get_next_ar_number() is what every raw-material path already calls (purchase QC,
-- production QC, retest), so it now returns the ARRM form. Finished product batches
-- get their number from get_next_fp_ar_number(), used by submit_fp_batch_to_qc().

begin;

-- One sequence per type and year (ar_rm_26_seq, ar_fp_26_seq, ...), created the first
-- time it is needed. A sequence hands out a number atomically, so two people assigning an
-- AR at the same moment cannot get the same one (a failed save may leave a gap).
create or replace function public._next_ar_number(p_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yy   text := to_char(now() at time zone 'Asia/Kolkata', 'YY');
  v_seq  text;
  v_n    bigint;
begin
  if p_kind not in ('RM', 'FP') then
    raise exception 'Unknown AR type %', p_kind using errcode = 'P0001';
  end if;
  v_seq := 'ar_' || lower(p_kind) || '_' || v_yy || '_seq';
  begin
    execute format('create sequence if not exists public.%I start 1', v_seq);
  exception when duplicate_object or unique_violation then
    null; -- another session created it at the same moment
  end;
  execute format('select nextval(%L)', 'public.' || v_seq) into v_n;
  return 'AR' || p_kind || '-' || public._pad_seq_code(v_n::text, 4) || '/' || v_yy;
end $$;
revoke all on function public._next_ar_number(text) from public, anon, authenticated;

create or replace function public.get_next_ar_number()
returns text
language sql
security definer
set search_path = public
as $$ select public._next_ar_number('RM'); $$;

create or replace function public.get_next_fp_ar_number()
returns text
language sql
security definer
set search_path = public
as $$ select public._next_ar_number('FP'); $$;

revoke all on function public.get_next_ar_number() from public, anon;
revoke all on function public.get_next_fp_ar_number() from public, anon;
grant execute on function public.get_next_ar_number() to authenticated;
grant execute on function public.get_next_fp_ar_number() to authenticated;

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

  v_ar := public.get_next_fp_ar_number();

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

commit;
