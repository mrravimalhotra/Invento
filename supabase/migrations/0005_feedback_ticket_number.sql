-- ============================================================
-- Tester feedback — unique ticket identifier
--
-- Standalone, additive migration — run this ON ITS OWN in the SQL Editor
-- against the already-live project, after 0001-0004. Unlike 0004_feedback.sql
-- this does NOT drop/recreate page_feedback (that would destroy every
-- submission already on file) — it only adds a column and backfills it.
-- Safe to re-run: every statement is idempotent (if not exists / if null).
--
-- Why: testers and Ravi need a short, stable identifier for each piece of
-- feedback ("implement FB-0003") — the uuid `id` isn't practical to read
-- back over chat. Follows the same nextval()+lpad() convention already
-- used for po_number/ar_number/vendor_code/etc. in 0001_init.sql.
-- ============================================================

create sequence if not exists public.feedback_ticket_seq start 1;

create or replace function public.get_next_feedback_ticket()
returns text language sql as $$
  select 'FB-' || lpad(nextval('public.feedback_ticket_seq')::text, 4, '0');
$$;

alter table public.page_feedback add column if not exists ticket_number text;

-- Backfill existing rows (oldest first, so ticket numbers read in the same
-- order feedback was originally submitted) before the column is made
-- required, then advance the sequence past whatever we just assigned so
-- the next live get_next_feedback_ticket() call doesn't collide.
with ordered as (
  select id, row_number() over (order by created_at) as rn
  from public.page_feedback
  where ticket_number is null
)
update public.page_feedback pf
set ticket_number = 'FB-' || lpad(ordered.rn::text, 4, '0')
from ordered
where pf.id = ordered.id;

select setval('public.feedback_ticket_seq', greatest((select count(*) from public.page_feedback), 1), true);

alter table public.page_feedback alter column ticket_number set not null;
alter table public.page_feedback drop constraint if exists page_feedback_ticket_number_unique;
alter table public.page_feedback add constraint page_feedback_ticket_number_unique unique (ticket_number);
