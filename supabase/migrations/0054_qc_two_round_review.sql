-- ============================================================
-- QC two-round review (20 Sept 2026).
--
-- Ravi: "In QC, the first round of approval will be given by Quality
-- Checker, He will put his comments and will hit on approve or reject
-- button. If rejected, Raw Material Batch will be Rejected. If approved,
-- it will show as approved - Awaiting Review and will be moved from QC
-- Checker's queue to QC Reviewer's queue. It will go through same cycle
-- and One QC Reviewer approves it, the batch will be shown as Fully QC
-- approved and will be added to Inventory." Confirmed via AskUserQuestion
-- (then a follow-up correction) before building:
--   - Applies to every QC record, Raw Material or Finished Product alike
--     (matches Ravi's earlier maker/checker instruction's own scope).
--   - A Retest AR goes through the same two-round cycle, not a shortened
--     one — it's still a real QC decision on a batch already in use.
--   - No separate "assignee/maker" identity to enforce any more — Ravi's
--     own correction: "there is no need for the assignee role, 2 roles
--     suffice: Reviewer 1 - QC Checker (dont call it maker), Reviewer 2 -
--     QC Reviewer (dont call it checker)." This RETIRES
--     0049_qc_maker_checker.sql's created_by-vs-reviewer rule entirely —
--     whoever assigned/created the AR may now go on to be its own Round 1
--     QC Checker. The real separation-of-duties rule going forward is
--     Round 1 (QC Checker) actor ≠ Round 2 (QC Reviewer) actor.
--
-- Design, reusing as much of the existing single-decision shape as
-- possible rather than a bigger rebuild:
--   - `status` gains one new intermediate value, 'checker_approved' ("
--     Approved - Awaiting Review"), sitting between 'submitted' and the
--     existing terminal 'approved'/'rejected'. 'approved' KEEPS its
--     existing meaning ("fully, finally cleared") unchanged — this is
--     deliberate: check_batch_qc_approved() (the trigger that gates FP
--     composition/BMR consumption), purchase_batch_status, the RM Report's
--     computeBatchQcState(), retest eligibility, and every place across
--     the app that already reads status = 'approved' to mean "usable
--     stock" all keep working correctly with ZERO changes, since that's
--     still exactly when a batch actually becomes usable — now just one
--     step later in the flow (after Round 2, not Round 1).
--   - Round 1 (QC Checker) writes NEW columns `checker_by` / `checker_at`
--     / `checker_comments` — mirrors the shape `reviewed_by`/`reviewed_at`
--     /`review_comments` already had for the single decision.
--   - Round 2 (QC Reviewer) reuses the EXISTING `reviewed_by`/`reviewed_at`
--     /`review_comments`/`retest_period_days`/`retest_date` columns —
--     they already meant "the final decision," which remains true; this
--     avoids renaming columns half the app already reads (finished-
--     product.ts trigger, reports, the retest workflow's own
--     trg_fn_qc_compute_retest_date). Retest period is only asked at
--     Round 2 now (matches Ravi's description — the Checker's round just
--     approves/rejects with comments, no retest period field), which also
--     naturally fixes the earlier design's slight mismatch: the batch
--     isn't actually usable/retestable until Round 2 clears it anyway.
-- ============================================================

-- 1. Widen the status check constraint to allow the new intermediate value.
alter table public.quality_checks
  drop constraint quality_checks_status_check;
alter table public.quality_checks
  add constraint quality_checks_status_check
  check (status in ('submitted', 'checker_approved', 'approved', 'rejected'));

-- 2. Round 1 (QC Checker) decision columns — additive, nullable, no
--    backfill: every quality_checks row that predates this migration went
--    through the old single-decision flow and has nothing meaningful to
--    put here.
alter table public.quality_checks
  add column checker_by uuid references auth.users(id),
  add column checker_at timestamptz,
  add column checker_comments text;

-- 3. Widen the "at most one active (unresolved) AR per batch" partial
--    unique index (0025_qc_retest_workflow.sql) to also cover
--    'checker_approved' — a batch sitting in Round 1 limbo shouldn't be
--    startable as a second concurrent AR any more than a freshly
--    'submitted' one should.
drop index if exists public.quality_checks_purchase_line_pending_unique;
create unique index quality_checks_purchase_line_pending_unique
  on public.quality_checks (purchase_line_id)
  where status in ('submitted', 'checker_approved');

-- 4. Retire the old maker≠checker trigger (0049_qc_maker_checker.sql) —
--    Ravi's correction above: no assignee-identity rule any more. Replace
--    with the real two-round rule: each round needs its own matching
--    role, and Round 2's actor must differ from Round 1's (System Admin
--    exempt from the distinctness half, same exemption 0049 already had).
--    Deliberately a trigger, not just an RLS/app check, for the same
--    "database constraint, not UI convention" reason 0049's own header
--    comment gives — auth.uid() (the row's *acting* user) isn't something
--    a plain CHECK constraint or RLS USING clause can reference per-row.
drop trigger if exists trg_qc_enforce_maker_checker on public.quality_checks;
drop function if exists public.trg_fn_qc_enforce_maker_checker();

create or replace function public.trg_fn_qc_enforce_review_stages()
returns trigger language plpgsql as $$
begin
  -- Round 1: submitted -> checker_approved/rejected. Needs the Quality
  -- Checker role (System Admin exempt-in, same as everywhere else in this
  -- app's role model).
  if old.status = 'submitted' and new.status in ('checker_approved', 'rejected') then
    if not public.has_any_role('system_admin', 'quality_checker') then
      raise exception 'Only a Quality Checker (or System Admin) can make the first QC decision.';
    end if;
  end if;

  -- Round 2: checker_approved -> approved/rejected. Needs the QC Reviewer
  -- role, and must be a different person from whoever made the Round 1
  -- decision (System Admin exempt from the distinctness half only).
  if old.status = 'checker_approved' and new.status in ('approved', 'rejected') then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer (or System Admin) can make the final QC decision.';
    end if;
    if new.checker_by is not null
       and auth.uid() = new.checker_by
       and not public.has_any_role('system_admin') then
      raise exception 'The QC Reviewer who makes the final decision must be a different person from the Quality Checker who made the first one.';
    end if;
  end if;

  return new;
end $$;

create trigger trg_qc_enforce_review_stages
  before update on public.quality_checks
  for each row execute function public.trg_fn_qc_enforce_review_stages();

-- 5. trg_qc_review_finished_product (0030_finished_product_ledger.sql)
--    only fired its ledger-push/status-sync when the PREVIOUS status was
--    'submitted' — correct back when 'submitted' was the only status a
--    real decision could be made from. Now the real (Round 2, final)
--    decision can also be made from 'checker_approved'. Function body is
--    unchanged (it already only pushes to inventory_ledger when
--    new.status = 'approved', and already no-ops otherwise) — only the
--    WHEN clause needs widening so it actually fires on that second
--    transition. Round 1's own submitted -> checker_approved transition
--    still correctly never fires this (new.status isn't in
--    ('approved','rejected')), so finished_product_batches.status is
--    untouched during Round 1 — it stays 'complete_awaiting_qc'/
--    'submitted_to_qc' throughout, only flipping at the real final
--    verdict, same as the RM side's purchase_batch_status behavior.
drop trigger if exists trg_qc_review_finished_product on public.quality_checks;
create trigger trg_qc_review_finished_product
  after update on public.quality_checks
  for each row
  when (new.finished_product_batch_id is not null and old.status in ('submitted', 'checker_approved') and new.status in ('approved', 'rejected'))
  execute function public.trg_fn_qc_review_finished_product();

-- No changes needed to: check_batch_qc_approved() / trg_fp_component_qc_gate
-- (already keys off qc_status = 'approved', which still means exactly
-- "fully, finally cleared"); purchase_batch_status (a plain view over
-- quality_checks.status — 'checker_approved' just flows through as a new
-- possible value, already excluded from qc/new's "open for QC" picker
-- since it isn't 'not_submitted'); trg_fn_qc_compute_retest_date (still
-- fires correctly off reviewed_at/retest_period_days, now set at Round 2
-- instead of the old single decision); trg_qc_sample_pull (fires at AR
-- creation, before either round, untouched); computeBatchQcState()
-- (lib/batch-qc-status.ts — its catch-all "anything that isn't literally
-- approved/rejected reads as qc_pending" already folds 'checker_approved'
-- into the correct bucket with no code change).
