-- ============================================================
-- FB-0012 (1 Sept 2026): "there should be option to edit/delete the
-- feedback throughout the app" — a tester couldn't fix a typo or retract
-- their own submitted observation; 0004_feedback.sql only ever gave
-- system_admin write access past the initial insert.
--
-- Adds two new RLS policies alongside (not replacing) the existing
-- system_admin-only page_feedback_update/page_feedback_delete policies —
-- Postgres OR's multiple permissive policies together, so either the
-- admin path or this owner path can authorize a given statement.
--
-- Scoped to `status = 'new'` on purpose: once a ticket has been triaged
-- (category/status/notes set — see triageFeedback() in
-- lib/actions/feedback.ts), it's part of the project's record of what
-- was found and fixed (referenced from claude/known-issues.md,
-- feedback-status.md, commit messages, ...). Letting the original
-- submitter edit or delete it out from under that record after the fact
-- would be confusing at best. While it's still 'new' (untouched by triage)
-- it's entirely the tester's own note and safe to fix or retract freely.
--
-- RLS is row-level, not column-level: these policies only gate *which
-- rows* an owner's UPDATE/DELETE can touch, not *which columns* an
-- UPDATE may set. Column restriction (owners may only ever change
-- `observation`, never category/status/claude_notes) is enforced in
-- application code — updateOwnFeedback() in lib/actions/feedback.ts only
-- ever builds an update of `observation` — the same convention
-- triageFeedback()'s system_admin check already uses (app-level check,
-- RLS as the backstop), not a new pattern.
-- ============================================================

create policy page_feedback_owner_update on public.page_feedback
  for update
  using (submitted_by = auth.uid() and status = 'new')
  with check (submitted_by = auth.uid() and status = 'new');

create policy page_feedback_owner_delete on public.page_feedback
  for delete
  using (submitted_by = auth.uid() and status = 'new');
