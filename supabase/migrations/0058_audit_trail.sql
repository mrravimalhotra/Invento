-- ============================================================
-- Audit trail for approval/status-gated records.
--
-- Ravi (21 Sept 2026): "lets fix the audit trail issue" — following up on
-- claude/open-requirements-log.md's own "Still open" note: "Every table
-- still only carries created/created_by/updated/updated_by/active —
-- there is still no separate audit-log/history table... no way to see a
-- row's prior values before an edit, only who last touched it and when."
--
-- Notably, user_roles (0001_init.sql) already defines a 'super_auditor'
-- role — it's in ROLES/ROLE_LABELS (lib/constants/roles.ts) too — but
-- nothing in the app has ever granted it a permission or a page. This
-- migration is the first thing that actually uses it: audit_log's SELECT
-- policy below grants it (alongside system_admin) read access to the
-- history this migration starts capturing.
--
-- Scope, confirmed with Ravi via AskUserQuestion: "approval/status gates
-- only" — the tables where a status flip or approval decision is the
-- thing you'd need to prove later, not every table in the schema. That's:
--   - quality_checks        (QC decision: submitted/checker_approved/
--                             approved/rejected — the two-round review
--                             gate, 0054_qc_two_round_review.sql)
--   - finished_product_batches (batch status through to approved/rejected)
--   - purchase_orders       (draft/submitted — the Final Submit gate,
--                             0019_purchase_submit_workflow.sql)
--   - mfr_definitions       (approved_by/approved_at — the recipe
--                             approval gate, 0041_mfr_deferred_approval.sql)
--
-- One table from that original candidate list is deliberately left out,
-- narrowing what was proposed — flagging it here rather than silently:
--   - line_clearance_checks: every column check (lib/actions/
--     line-clearance.ts) is a plain insert, nothing ever updates or
--     deletes a row after it's created. Its own checked_by/checked_at
--     columns are already a complete, immutable record of who decided
--     what and when — an audit trail exists to answer "what did this
--     look like before it changed," and a row that never changes has no
--     before/after to capture. Revisit if that ever stops being true
--     (e.g. an edit/void flow gets added to that page).
--
-- Design: one generic table + one generic trigger function, attached per
-- table — the same "shared helper trigger, attach per table" shape this
-- schema already uses for updated_at/updated_by (set_updated_at(),
-- 0001_init.sql), rather than a bespoke history table per subject. Each
-- row change writes ONE audit_log row via to_jsonb(old)/to_jsonb(new) —
-- full row snapshots, not a computed field-level diff, so nothing about
-- a table's shape needs to be taught to this migration and a future
-- column added to any of the four tables is automatically captured with
-- no further change needed here.
-- ============================================================

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

-- "History for this record" (row_id) and "everything that happened
-- recently" (changed_at, and changed_at scoped to one table for the
-- Audit Log page's table filter) are the two access patterns this needs.
create index audit_log_table_row_idx on public.audit_log (table_name, row_id, changed_at desc);
create index audit_log_table_changed_at_idx on public.audit_log (table_name, changed_at desc);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log for select
  using (public.has_any_role('system_admin', 'super_auditor'));

-- Same "no direct write" shape as inventory_ledger's ledger_no_direct_write
-- policy (0001_init.sql) — this table is written exclusively by
-- trg_fn_audit_log() below (SECURITY DEFINER, bypasses this), never by a
-- client insert/update/delete. Nothing should ever UPDATE or DELETE an
-- audit_log row at all — that would defeat the point — so those aren't
-- given a policy either, which for RLS-enabled tables means "denied."
create policy audit_log_no_direct_write on public.audit_log for insert with check (false);

create or replace function public.trg_fn_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, action, new_data, changed_by)
    values (tg_table_name, new.id, 'insert', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'update', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (table_name, row_id, action, old_data, changed_by)
    values (tg_table_name, old.id, 'delete', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end $$;

-- auth.uid() reads a per-request JWT claim (request.jwt.claims), not the
-- calling function's own privilege level — it resolves to the real
-- signed-in user whether the row change happened via a plain client
-- .update() (qc.ts, finished-product.ts, purchase.ts) or from inside a
-- SECURITY DEFINER RPC (submit_purchase_order(), approve_mfr_definition(),
-- the QC two-round-review functions in 0054). Confirmed by the fact that
-- updated_by already relies on exactly this same behavior, through the
-- exact same call paths, today.
create trigger trg_audit_quality_checks
  after insert or update or delete on public.quality_checks
  for each row execute function public.trg_fn_audit_log();

create trigger trg_audit_finished_product_batches
  after insert or update or delete on public.finished_product_batches
  for each row execute function public.trg_fn_audit_log();

create trigger trg_audit_purchase_orders
  after insert or update or delete on public.purchase_orders
  for each row execute function public.trg_fn_audit_log();

create trigger trg_audit_mfr_definitions
  after insert or update or delete on public.mfr_definitions
  for each row execute function public.trg_fn_audit_log();
