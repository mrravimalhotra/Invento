-- ============================================================
-- 0119 — QC test results, written reasons, and rejection control
--
-- Ravi, 12 Oct 2026. Three decisions come together here:
--
-- 1. SCAN-P4-11 (test results). While QC is done on a raw material or a
--    finished product, Round 1 (Quality Checker) fills in the result of every
--    test on the item's / MFR's COA template and gives a written reason for the
--    decision. Round 2 (QC Reviewer) can edit the results: if he edits nothing,
--    Round 1's results stand; if he edits any, his results are final. The
--    certificate takes the final results. Both sets stay on the record for audit.
--    A record that went through QC before this migration, or has no results,
--    keeps typing its results on the certificate (nothing is changed for it).
--
-- 2. SCAN-P4-01 (rejection). Every decision in both rounds needs a written
--    reason (at least 3 characters), in the database as well as on the screen.
--    A Quality Checker's rejection no longer rejects: it becomes "Rejection
--    proposed" (status checker_rejected) and the QC Reviewer confirms it (the
--    batch is then rejected) or sends it back to Awaiting QC with a reason.
--    A final rejection can be voided by a QC Reviewer or System Admin with a
--    written reason: the record returns to Awaiting QC, the stock comes back to
--    On hand, a finished product batch returns to "Submitted to QC". A rejection
--    cannot be voided once wastage has been written off against the batch.
--
-- 3. Audit. qc_decision_history keeps one row per decision event (round 1,
--    send back, round 2, void): who, when, reason, results. It is written by the
--    database from the QC record's own update, so it cannot be skipped.
--
-- Safe to run more than once. No existing row is changed.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Status "Rejection proposed" and the new columns
-- ------------------------------------------------------------
alter table public.quality_checks drop constraint if exists quality_checks_status_check;
alter table public.quality_checks
  add constraint quality_checks_status_check
  check (status in ('submitted', 'checker_approved', 'checker_rejected', 'approved', 'rejected'));

alter table public.quality_checks
  add column if not exists checker_results jsonb,
  add column if not exists reviewer_results jsonb,
  add column if not exists returned_reason text,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists voided_at timestamptz;

comment on column public.quality_checks.checker_results is
  'Round 1: [{seq, test, specification, result}] typed against the COA template (0119).';
comment on column public.quality_checks.reviewer_results is
  'Round 2: the full list again, only when the QC Reviewer edited any result; then these are the final results (0119).';

-- A batch with a decision still open (including a proposed rejection) cannot be given a second record.
drop index if exists public.quality_checks_purchase_line_pending_unique;
create unique index quality_checks_purchase_line_pending_unique
  on public.quality_checks (purchase_line_id)
  where status in ('submitted', 'checker_approved', 'checker_rejected');

drop index if exists public.quality_checks_production_batch_pending_unique;
create unique index quality_checks_production_batch_pending_unique
  on public.quality_checks (production_batch_id)
  where status in ('submitted', 'checker_approved', 'checker_rejected');

-- ------------------------------------------------------------
-- 2. Result lists: shape check used by the trigger
-- ------------------------------------------------------------
create or replace function public._qc_results_valid(p jsonb, p_every_result boolean)
returns boolean language sql immutable as $$
  select p is not null
     and jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) > 0
     and not exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'object'
           or length(btrim(coalesce(e ->> 'test', ''))) = 0
           or length(btrim(coalesce(e ->> 'specification', ''))) = 0
           or length(coalesce(e ->> 'result', '')) > 500
           or (p_every_result and length(btrim(coalesce(e ->> 'result', ''))) = 0)
     );
$$;

-- ------------------------------------------------------------
-- 3. History table (append-only, written only by the trigger below)
-- ------------------------------------------------------------
create table if not exists public.qc_decision_history (
  id               uuid primary key default gen_random_uuid(),
  quality_check_id uuid not null references public.quality_checks(id) on delete cascade,
  event            text not null check (event in
                     ('round1_approved', 'round1_rejected', 'sent_back', 'round2_approved', 'round2_rejected', 'voided')),
  reason           text not null,
  results          jsonb,
  results_edited   boolean not null default false,
  decided_by       uuid references auth.users(id),
  decided_at       timestamptz not null default now()
);
create index if not exists qc_decision_history_qc_idx on public.qc_decision_history (quality_check_id, decided_at);

alter table public.qc_decision_history enable row level security;
drop policy if exists qc_decision_history_select on public.qc_decision_history;
create policy qc_decision_history_select on public.qc_decision_history
  for select using ((select public.has_app_access()));

-- who/when stamps and audit, like every other business table (0072)
do $$
declare
  v_tbl text := 'qc_decision_history';
begin
  execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || v_tbl, v_tbl);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_fn_audit_log(%L)',
                 'trg_audit_' || v_tbl, v_tbl, 'id');
  execute format('drop trigger if exists %I on public.%I', 'trg_audit_truncate_' || v_tbl, v_tbl);
  execute format('create trigger %I after truncate on public.%I for each statement execute function public.trg_fn_audit_truncate()',
                 'trg_audit_truncate_' || v_tbl, v_tbl);
  execute format('alter table public.%I add column if not exists created_at timestamptz', v_tbl);
  execute format('alter table public.%I alter column created_at set default now()', v_tbl);
  execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id)', v_tbl);
  execute format('alter table public.%I add column if not exists updated_at timestamptz', v_tbl);
  execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', v_tbl);
  execute format('drop trigger if exists %I on public.%I', 'trg_stamp_created_' || v_tbl, v_tbl);
  execute format('create trigger %I before insert on public.%I for each row execute function public.trg_fn_stamp_created()',
                 'trg_stamp_created_' || v_tbl, v_tbl);
  execute format('drop trigger if exists %I on public.%I', 'trg_stamp_updated_' || v_tbl, v_tbl);
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                 'trg_stamp_updated_' || v_tbl, v_tbl);
end $$;

-- ------------------------------------------------------------
-- 4. The rules of every QC status change
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_enforce_review_stages()
returns trigger language plpgsql as $$
declare
  v_is_admin boolean := public.has_any_role('system_admin');
  v_needs_results boolean := (new.purchase_line_id is not null or new.finished_product_batch_id is not null);
  v_line_wastage boolean;
begin
  -- Results can only be saved together with a decision.
  if new.status = old.status then
    if new.checker_results is distinct from old.checker_results
       or new.reviewer_results is distinct from old.reviewer_results then
      raise exception 'Test results can only be saved together with a QC decision.';
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
    return new;
  end if;

  -- Round 2: a QC Reviewer, a different person from the Quality Checker (System Admin exempt).
  if old.status in ('checker_approved', 'checker_rejected') and new.status in ('approved', 'rejected', 'submitted') then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer (or System Admin) can make the final QC decision.';
    end if;
    if new.checker_by is not null and auth.uid() = new.checker_by and not v_is_admin then
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

-- ------------------------------------------------------------
-- 5. Decision history, written by the database
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_decision_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_reason text;
  v_results jsonb;
  v_edited boolean := false;
begin
  if old.status = 'submitted' and new.status = 'checker_approved' then
    v_event := 'round1_approved'; v_reason := new.checker_comments; v_results := new.checker_results;
  elsif old.status = 'submitted' and new.status = 'checker_rejected' then
    v_event := 'round1_rejected'; v_reason := new.checker_comments; v_results := new.checker_results;
  elsif old.status = 'checker_rejected' and new.status = 'submitted' then
    v_event := 'sent_back'; v_reason := new.returned_reason;
  elsif old.status in ('checker_approved', 'checker_rejected') and new.status = 'approved' then
    v_event := 'round2_approved'; v_reason := new.review_comments;
    v_results := coalesce(new.reviewer_results, new.checker_results); v_edited := new.reviewer_results is not null;
  elsif old.status in ('checker_approved', 'checker_rejected') and new.status = 'rejected' then
    v_event := 'round2_rejected'; v_reason := new.review_comments;
    v_results := coalesce(new.reviewer_results, new.checker_results); v_edited := new.reviewer_results is not null;
  elsif old.status = 'rejected' and new.status = 'submitted' then
    v_event := 'voided'; v_reason := new.void_reason;
  else
    return new;
  end if;
  insert into public.qc_decision_history (quality_check_id, event, reason, results, results_edited, decided_by)
  values (new.id, v_event, btrim(v_reason), v_results, v_edited, auth.uid());
  return new;
end $$;

drop trigger if exists trg_qc_decision_history on public.quality_checks;
create trigger trg_qc_decision_history
  after update of status on public.quality_checks
  for each row when (old.status is distinct from new.status)
  execute function public.trg_fn_qc_decision_history();

-- ------------------------------------------------------------
-- 6. Finished product batch follows the final decision (and a void)
-- ------------------------------------------------------------
drop trigger if exists trg_qc_review_finished_product on public.quality_checks;
create trigger trg_qc_review_finished_product
  after update on public.quality_checks
  for each row
  when (new.finished_product_batch_id is not null
        and old.status in ('submitted', 'checker_approved', 'checker_rejected')
        and new.status in ('approved', 'rejected'))
  execute function public.trg_fn_qc_review_finished_product();

create or replace function public.trg_fn_qc_void_finished_product()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.finished_product_batches
     set status = 'submitted_to_qc'
   where id = new.finished_product_batch_id and status = 'rejected';
  return new;
end $$;

drop trigger if exists trg_qc_void_finished_product on public.quality_checks;
create trigger trg_qc_void_finished_product
  after update on public.quality_checks
  for each row
  when (new.finished_product_batch_id is not null and old.status = 'rejected' and new.status = 'submitted')
  execute function public.trg_fn_qc_void_finished_product();

-- ------------------------------------------------------------
-- 7. Raw material: a voided rejection brings the stock back to On hand
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_rejected_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_item uuid;
  v_unit text;
  v_net numeric;
begin
  if new.purchase_line_id is null and new.production_batch_id is null then
    return new;   -- finished product: never in the ledger
  end if;

  select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0)
    into v_net
    from public.inventory_ledger l
   where l.reference_type = 'qc_rejected'
     and ((new.purchase_line_id is not null and l.purchase_line_id = new.purchase_line_id)
       or (new.production_batch_id is not null and l.production_batch_id = new.production_batch_id));

  if new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    if v_net > 0 then
      return new;   -- already moved out
    end if;
    if new.purchase_line_id is not null then
      select pl.live_remaining_qty, pl.item_id, pl.unit into v_remaining, v_item, v_unit
        from public.purchase_lines pl
       where pl.id = new.purchase_line_id and pl.pushed_at is not null;
    else
      select pb.live_remaining_qty, pb.item_id, pb.unit into v_remaining, v_item, v_unit
        from public.production_issue_batches pb
       where pb.id = new.production_batch_id;
    end if;
    if coalesce(v_remaining, 0) > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit,
         reference_type, reference_id, event_by)
      values ('pull', v_item, new.purchase_line_id, new.production_batch_id, v_remaining, v_unit,
              'qc_rejected', coalesce(new.purchase_line_id, new.production_batch_id), auth.uid());
    end if;
  elsif (new.status = 'approved' or (tg_op = 'UPDATE' and old.status = 'rejected' and new.status = 'submitted')) and v_net > 0 then
    if new.purchase_line_id is not null then
      select pl.item_id, pl.unit into v_item, v_unit from public.purchase_lines pl where pl.id = new.purchase_line_id;
    else
      select pb.item_id, pb.unit into v_item, v_unit from public.production_issue_batches pb where pb.id = new.production_batch_id;
    end if;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit,
       reference_type, reference_id, event_by)
    values ('push', v_item, new.purchase_line_id, new.production_batch_id, v_net, v_unit,
            'qc_rejected', coalesce(new.purchase_line_id, new.production_batch_id), auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_qc_rejected_stock on public.quality_checks;
create trigger trg_qc_rejected_stock
  after insert or update of status on public.quality_checks
  for each row
  when (new.status in ('rejected', 'approved', 'submitted'))
  execute function public.trg_fn_qc_rejected_stock();

commit;
