-- 0128: close the two two-person gaps found by the spec-to-code compliance review (1 Nov 2026,
-- REQ-16 and REQ-13). Ravi: "close the two two-person gaps".
--
--  1. Approving alone: the same-person check compared the signed-in user with the checker_by value
--     the caller sent, so a user holding both QC roles could approve alone by sending
--     checker_by = null or a colleague's id. Now, for direct writes from the app's side, the
--     database stamps Round 1's checker_by/checker_at and Round 2's reviewed_by/reviewed_at itself,
--     keeps Round 1's decider through Round 2, checks the rule against the recorded Round 1 decider,
--     and refuses any later change of who decided.
--  2. Creating an already-approved record: a Quality Checker could insert a QC record with status
--     approved (or any decision filled in), skipping both rounds. Now a QC record created directly
--     from the app's side must start as Awaiting QC with no decision, reason, results or retest
--     period. A proposed expiry date is allowed: Submit to QC (submit_fp_batch_to_qc) pre-fills the
--     batch's expiry for the QC Reviewer to confirm in Round 2.
--
-- The database's own functions (opening-stock loads, retests, the packaging void) are not direct
-- writes (_is_direct_client_write() is false inside them) and keep working as before. The app's
-- screens already send exactly what the database now records, so nothing on screen changes.

begin;

create or replace function public.trg_fn_qc_enforce_review_stages()
returns trigger language plpgsql as $$
declare
  v_is_admin boolean := public.has_any_role('system_admin');
  v_needs_results boolean := (new.purchase_line_id is not null or new.finished_product_batch_id is not null);
  v_line_wastage boolean;
begin
  -- 0126 (P6-01): a QC record of an RM-FP batch becomes "voided" only through
  -- void_packaging_issue(), which sets invento.voiding for its own transaction.
  -- A voided record never changes again.
  if old.status = 'voided' then
    raise exception 'This QC record was voided with its packaging issue and cannot change.';
  end if;
  if new.status = 'voided' then
    if coalesce(current_setting('invento.voiding', true), '') <> 'on' then
      raise exception 'A QC record can only be voided together with its packaging issue.';
    end if;
    return new;
  end if;

  -- Results can only be saved together with a decision.
  if new.status = old.status then
    if new.checker_results is distinct from old.checker_results
       or new.reviewer_results is distinct from old.reviewer_results then
      raise exception 'Test results can only be saved together with a QC decision.';
    end if;
    -- 0128: who made a QC decision is recorded by the database and cannot be changed afterwards.
    if public._is_direct_client_write()
       and (new.checker_by is distinct from old.checker_by or new.checker_at is distinct from old.checker_at
            or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at) then
      raise exception 'Who made a QC decision, and when, cannot be changed.';
    end if;
    return new;
  end if;

  -- Round 1: Awaiting QC -> Approved by checker / Rejection proposed.
  if old.status = 'submitted' and new.status in ('checker_approved', 'checker_rejected') then
    if not public.has_any_role('system_admin', 'quality_checker') then
      raise exception 'Only a Quality Checker (or System Admin) can make the first QC decision.';
    end if;
    if length(btrim(coalesce(new.checker_comments, ''))) < 3 then
      raise exception 'A reason is required for the first QC decision.';
    end if;
    if new.status = 'checker_approved' and v_needs_results
       and not public._qc_results_valid(new.checker_results, true) then
      raise exception 'Enter the result of every test on the COA template before approving.';
    end if;
    if new.status = 'checker_rejected' and new.checker_results is not null
       and not public._qc_results_valid(new.checker_results, false) then
      raise exception 'The test results could not be read.';
    end if;
    if new.reviewer_results is not null then
      raise exception 'Only the QC Reviewer can edit the results.';
    end if;
    -- 0128: the database records who made Round 1, whatever the caller sends.
    if public._is_direct_client_write() then
      new.checker_by := auth.uid();
      new.checker_at := now();
    end if;
    return new;
  end if;

  -- Round 2: a QC Reviewer, a different person from the Quality Checker (System Admin exempt).
  if old.status in ('checker_approved', 'checker_rejected') and new.status in ('approved', 'rejected', 'submitted') then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer (or System Admin) can make the final QC decision.';
    end if;
    -- 0128: Round 1's decider stays as recorded and Round 2's is the signed-in user, so the
    -- different-person rule cannot be dodged by sending another checker_by with the decision.
    if public._is_direct_client_write() then
      new.checker_by := old.checker_by;
      new.checker_at := old.checker_at;
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    if old.checker_by is not null and auth.uid() = old.checker_by and not v_is_admin then
      raise exception 'The QC Reviewer who makes the final decision must be a different person from the Quality Checker who made the first one.';
    end if;

    if new.status = 'submitted' then
      -- Send back: only a proposed rejection can be sent back.
      if old.status <> 'checker_rejected' then
        raise exception 'Only a proposed rejection can be sent back to the Quality Checker.';
      end if;
      if length(btrim(coalesce(new.returned_reason, ''))) < 3 then
        raise exception 'A reason is required to send a proposed rejection back.';
      end if;
      -- The record starts again at Round 1; what was recorded stays in the decision history.
      new.checker_by := null; new.checker_at := null; new.checker_comments := null;
      new.checker_results := null; new.reviewer_results := null;
      return new;
    end if;

    if old.status = 'checker_rejected' and new.status = 'approved' then
      raise exception 'A proposed rejection cannot be approved. Confirm the rejection, or send it back to the Quality Checker.';
    end if;
    if length(btrim(coalesce(new.review_comments, ''))) < 3 then
      raise exception 'A reason is required for the final QC decision.';
    end if;
    if new.reviewer_results is not null then
      if old.checker_results is null then
        raise exception 'This record has no first-round results to edit.';
      end if;
      if not public._qc_results_valid(new.reviewer_results, new.status = 'approved') then
        raise exception 'Enter the result of every test before approving.';
      end if;
      if jsonb_array_length(new.reviewer_results) <> jsonb_array_length(old.checker_results) then
        raise exception 'The edited results must list the same tests as the first round.';
      end if;
    end if;
    return new;
  end if;

  -- Void: a final rejection returns to Awaiting QC.
  if old.status = 'rejected' and new.status = 'submitted' then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer or System Admin can void a rejection.';
    end if;
    if length(btrim(coalesce(new.void_reason, ''))) < 3 then
      raise exception 'A written reason is required to void a rejection.';
    end if;
    select exists (
      select 1 from public.inventory_ledger l
       where l.event_type = 'wastage'
         and ((new.purchase_line_id is not null and l.purchase_line_id = new.purchase_line_id)
           or (new.production_batch_id is not null and l.production_batch_id = new.production_batch_id))
    ) into v_line_wastage;
    if v_line_wastage then
      raise exception 'Wastage has already been written off against this batch, so its rejection cannot be voided.';
    end if;
    new.voided_by := auth.uid();
    new.voided_at := now();
    new.checker_by := null; new.checker_at := null; new.checker_comments := null;
    new.checker_results := null; new.reviewer_results := null;
    new.reviewed_by := null; new.reviewed_at := null; new.review_comments := null;
    new.expiry_date := null; new.retest_period_days := null; new.retest_date := null;
    return new;
  end if;

  raise exception 'A QC record cannot move from "%" to "%".', old.status, new.status;
end $$;

alter function public.trg_fn_qc_enforce_review_stages() set search_path = public, extensions;

create or replace function public.trg_fn_qc_insert_starts_awaiting()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if not public._is_direct_client_write() then
    return new;
  end if;
  if new.status is distinct from 'submitted'
     or new.checker_by is not null or new.checker_at is not null or new.checker_comments is not null
     or new.checker_results is not null
     or new.reviewed_by is not null or new.reviewed_at is not null or new.review_comments is not null
     or new.reviewer_results is not null
     or new.retest_period_days is not null
     or new.returned_reason is not null
     or new.void_reason is not null or new.voided_by is not null or new.voided_at is not null then
    raise exception 'A new QC record starts as Awaiting QC; its decisions are made on the QC screen.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.trg_fn_qc_insert_starts_awaiting() from public, anon, authenticated;
drop trigger if exists trg_00_qc_insert_starts_awaiting on public.quality_checks;
create trigger trg_00_qc_insert_starts_awaiting
  before insert on public.quality_checks
  for each row execute function public.trg_fn_qc_insert_starts_awaiting();

do $$
begin
  if position('new.checker_by := old.checker_by' in pg_get_functiondef('public.trg_fn_qc_enforce_review_stages()'::regprocedure)) = 0 then
    raise exception '0128 self-check failed: Round 2 does not keep the recorded Round 1 decider.';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_00_qc_insert_starts_awaiting') then
    raise exception '0128 self-check failed: insert guard missing.';
  end if;
end $$;

commit;
