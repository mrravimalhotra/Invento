-- ============================================================
-- Page feedback / tester observations
--
-- Standalone, additive migration — run this ON ITS OWN in the SQL
-- Editor against the already-live project. Unlike 0001_init.sql this
-- does NOT reset the public schema; it only creates one new table.
-- Safe to re-run: it drops and recreates just page_feedback.
--
-- Depends on objects created by 0001_init.sql (public.is_signed_in(),
-- public.has_role(), public.set_updated_at()) — run 0001-0003 first
-- on a fresh project.
-- ============================================================

drop table if exists public.page_feedback cascade;

create table public.page_feedback (
  id uuid primary key default gen_random_uuid(),
  -- normalized page identity, e.g. "/purchase" (dynamic segments like
  -- /purchase/[id] are stripped client-side before insert) — this is
  -- what the per-page widget filters by.
  page_path text not null,
  page_label text not null,
  -- the exact URL the tester was on, kept for context even though
  -- page_path is what groups the changelog.
  url_path text not null,
  observation text not null,
  submitted_by uuid references auth.users(id) on delete set null,
  -- denormalized so the changelog still shows who reported something
  -- even if that account is later removed.
  submitted_by_name text not null,
  -- set on triage (by Claude/system_admin), null until then.
  category text check (category in ('bug', 'enhancement', 'invalid', 'user_education', 'duplicate', 'other')),
  status text not null default 'new' check (status in ('new', 'awaiting_implementation', 'implemented', 'rejected')),
  claude_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);

create index page_feedback_page_path_idx on public.page_feedback (page_path);
create index page_feedback_status_idx on public.page_feedback (status);
create index page_feedback_created_at_idx on public.page_feedback (created_at desc);

alter table public.page_feedback enable row level security;

-- Any signed-in user can read the changelog on any page.
create policy page_feedback_select on public.page_feedback
  for select using (public.is_signed_in());

-- Any signed-in user (any role — "testers" broadly) can submit
-- feedback, but only as themselves.
create policy page_feedback_insert on public.page_feedback
  for insert with check (public.is_signed_in() and submitted_by = auth.uid());

-- Only System Admin can triage (set category/status/notes) or delete
-- (e.g. spam/test rows). This is where Claude's classification pass
-- writes, acting through a system_admin account.
create policy page_feedback_update on public.page_feedback
  for update using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

create policy page_feedback_delete on public.page_feedback
  for delete using (public.has_role('system_admin'));

create trigger page_feedback_set_updated_at
  before update on public.page_feedback
  for each row execute function public.set_updated_at();
