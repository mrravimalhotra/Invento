-- ============================================================
-- Ravi (17 Sept 2026): "Every QC (Raw material or Finished Product) done
-- should go through maker/checker check — that means should be approved
-- by two people. The Id of both should be captured from the app and the
-- login credentials they have used." Design confirmed via AskUserQuestion
-- before building: maker + one independent checker (not two checkers),
-- System Admin exempt from the maker != checker rule, no re-authentication
-- step (the existing logged-in session is enough).
--
-- The Assign ("maker") / Review ("checker") two-step already existed
-- (0001_init.sql) and quality_checks.created_by already existed in the
-- schema — it was just never written to by any of the three insert paths
-- (RM assign, FP submit-to-QC, retest), so there was no recorded maker
-- identity and nothing stopped the same person from assigning an AR and
-- then reviewing/approving that same AR. This migration adds the
-- database-level backstop; lib/actions/qc.ts and
-- lib/actions/finished-product.ts (this same pass) start actually writing
-- created_by, and lib/actions/qc.ts adds a matching app-level check ahead
-- of it for a clean error message.
--
-- Deliberately a trigger, not a CHECK constraint or RLS WITH CHECK clause:
-- the rule needs to compare the *acting* user (auth.uid(), i.e. whoever is
-- actually running this UPDATE right now) against created_by, which a
-- plain CHECK constraint can't reference (auth.uid() isn't a column of
-- the row) and which — unlike the qc_update RLS policy's static role
-- check — is a per-row, data-dependent decision. Same "database
-- constraint, not a UI convention" posture this module's docs already
-- describe for the QC-gates-consumption trigger.
create or replace function public.trg_fn_qc_enforce_maker_checker()
returns trigger language plpgsql as $$
begin
  -- Only fires on the actual review decision (submitted -> approved/rejected).
  -- created_by is left untouched by this trigger for legacy rows that
  -- predate this fix (no created_by recorded) — there's nothing to compare
  -- against, so those are let through exactly as before rather than
  -- guessing at an identity that was never captured.
  if new.status in ('approved', 'rejected')
     and new.created_by is not null
     and auth.uid() = new.created_by
     and not public.has_any_role('system_admin') then
    raise exception 'The Quality Checker/Reviewer who approves or rejects an AR must be a different person from whoever assigned it.';
  end if;
  return new;
end $$;

create trigger trg_qc_enforce_maker_checker
  before update on public.quality_checks
  for each row execute function public.trg_fn_qc_enforce_maker_checker();
