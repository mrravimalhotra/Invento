-- ============================================================
-- DES-02 (docs/AI_TESTING_SECURITY_PERFORMANCE_REFERENCE.md): complete audit
-- trail, built on the existing one from 0058_audit_trail.sql.
--
-- What 0058 already provides, reused as-is: the audit_log table (full
-- before/after JSON snapshots, changed_by from the session, never writable
-- by clients), its three indexes, its admin/super_auditor-only RLS, and the
-- generic trg_fn_audit_log() trigger — attached then to only four tables
-- (quality_checks, finished_product_batches, purchase_orders,
-- mfr_definitions).
--
-- What this migration adds (Ravi, 28 Sept 2026: "make sure each
-- insert/edit/delete etc is being audited and everything is covered and not
-- missing anything, also make sure no adverse impact on performance"):
--
-- 1. EVERY business table is audited for INSERT, UPDATE and DELETE (28
--    tables; previously 4). inventory_ledger is the one partial case: it is
--    already an append-only audit record (event_by/event_at on every row),
--    so its INSERTs are not duplicated here — but any UPDATE or DELETE of a
--    ledger row (which the app can never do) IS logged.
-- 2. TRUNCATE (e.g. the admin Purge Test Data button) is logged: one row per
--    emptied table. It previously left no trace at all.
-- 3. user_roles is covered — the audit function now accepts the table's key
--    column as a trigger argument (user_roles has no "id"; it uses user_id).
-- 4. User accounts (auth.users): account creation, password changes,
--    the forced-password-change flag, email changes, bans and deletion are
--    logged, with the password hash never stored. Plain sign-ins are not
--    (they only move last_sign_in_at). System-admin actions are also
--    attributed to the admin through audit_account_action(), called by the
--    app — Supabase Auth itself does not know which admin asked.
-- 5. changed_via on every audit row: 'app' (a signed-in user through the
--    app/API), 'server' (the app's service-role key), 'auth service'
--    (Supabase Auth) or 'database' (SQL editor / migrations) — so a fix made
--    directly in the SQL editor is visibly labelled rather than anonymous.
-- 6. Noise and cost control: an UPDATE that changes nothing, or changes only
--    system-maintained columns (updated_at/updated_by everywhere, plus the
--    stock counters purchase_lines.live_remaining_qty,
--    production_issue_batches.live_remaining_qty and
--    finished_product_batches.packaged_qty that move on every stock
--    movement and are already recorded in inventory_ledger), is skipped.
-- 7. The audit log is tamper-proof: its rows cannot be updated, deleted or
--    truncated by anyone, including the SQL editor (the guard trigger would
--    have to be dropped deliberately first).
-- 8. Reliable "who created / who last changed" on every row: created_at,
--    created_by, updated_at, updated_by exist on every business table
--    (added where missing — existing rows stay NULL, their history is not
--    known) and are now filled by the database: created_by is always the
--    signed-in user (a client-supplied value is overwritten, so it cannot be
--    faked or forgotten — before this, most inserts left it empty) and
--    updated_at/updated_by use the existing set_updated_at() trigger.
-- 9. audit_coverage_report(): lists any table that is missing audit or
--    stamp triggers. Empty result = full coverage. Checked at the end of
--    this migration and usable any time (e.g. after a future migration).
--
-- Performance (measured on a local replay before shipping, see
-- known-issues.md Thirty-third pass): one small insert into audit_log per
-- changed row, done in the same transaction; no extra reads; no change to
-- any query the app runs. The existing audit_log indexes cover the Audit Log
-- screen.
--
-- Not covered, by design: reads (SELECTs) and schema changes (migrations —
-- tracked in git and claude/deployment-log.md).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- audit_log: new action value, new changed_via column
-- ------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in ('insert', 'update', 'delete', 'truncate'));
alter table public.audit_log add column if not exists changed_via text;

comment on column public.audit_log.changed_via is
  'How the change reached the database: app (signed-in user), server (service-role key), auth service (Supabase Auth), database (SQL editor / migration). Rows before 0072 are NULL.';

-- Where did this change come from? Reads the request claims PostgREST sets
-- for every API call; anything without them came from inside the database.
create or replace function public._audit_changed_via()
returns text language plpgsql stable set search_path = public as $$
declare
  v_role text;
begin
  v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if v_role is null then
    begin
      v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then
      v_role := null;
    end;
  end if;
  if v_role = 'authenticated' then return 'app'; end if;
  if v_role = 'service_role' then return 'server'; end if;
  if session_user = 'supabase_auth_admin' then return 'auth service'; end if;
  return 'database';
end $$;

-- ------------------------------------------------------------
-- The generic row trigger — same name and behaviour as 0058 for callers
-- with no arguments, extended with:
--   TG_ARGV[0]  key column holding the row id (default 'id')
--   TG_ARGV[1…] extra system-maintained columns to ignore on UPDATE
-- ------------------------------------------------------------
create or replace function public.trg_fn_audit_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text := coalesce(nullif(tg_argv[0], ''), 'id');
  v_ignore text[] := array['updated_at', 'updated_by'];
  v_old jsonb;
  v_new jsonb;
  v_row_id uuid;
  i int;
begin
  if tg_nargs > 1 then
    for i in 1 .. tg_nargs - 1 loop
      v_ignore := v_ignore || tg_argv[i];
    end loop;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' and (v_new - v_ignore) = (v_old - v_ignore) then
    return new;  -- nothing a person changed: skip (see header, point 6)
  end if;

  v_row_id := (coalesce(v_new, v_old) ->> v_key)::uuid;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
  values (tg_table_name, v_row_id, lower(tg_op), v_old, v_new, auth.uid(), public._audit_changed_via());

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Statement-level TRUNCATE logging (one row per emptied table).
create or replace function public.trg_fn_audit_truncate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
  values (tg_table_name, '00000000-0000-0000-0000-000000000000', 'truncate', null,
          jsonb_build_object('note', 'All rows in this table were removed (TRUNCATE).'),
          auth.uid(), public._audit_changed_via());
  return null;
end $$;

-- "Who created it": always the signed-in user when there is one — a
-- client-supplied created_by is overwritten, so it can't be faked or left
-- out. Inside the database (SQL editor, Supabase Auth) there is no signed-in
-- user and whatever was supplied is kept.
create or replace function public.trg_fn_stamp_created()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- Attach everything, table by table.
-- ------------------------------------------------------------
do $$
declare
  -- table name, key column, extra ignored columns (comma-separated)
  v_cfg text[][] := array[
    ['bmr_observations',               'id', ''],
    ['bmr_records',                    'id', ''],
    ['bmr_weighment_lines',            'id', ''],
    ['coa_records',                    'id', ''],
    ['coa_template_lines',             'id', ''],
    ['coa_templates',                  'id', ''],
    ['dead_stock_items',               'id', ''],
    ['documents',                      'id', ''],
    ['environmental_control_readings', 'id', ''],
    ['equipment',                      'id', ''],
    ['finished_product_batches',       'id', 'packaged_qty'],
    ['finished_product_components',    'id', ''],
    ['item_types',                     'id', ''],
    ['items',                          'id', ''],
    ['line_clearance_checks',          'id', ''],
    ['mfr_definitions',                'id', ''],
    ['mfr_lines',                      'id', ''],
    ['mfr_procedure_steps',            'id', ''],
    ['packaging_issue_items',          'id', ''],
    ['packaging_issues',               'id', ''],
    ['page_feedback',                  'id', ''],
    ['production_issue_batches',       'id', 'live_remaining_qty'],
    ['profiles',                       'id', ''],
    ['purchase_lines',                 'id', 'live_remaining_qty'],
    ['purchase_orders',                'id', ''],
    ['quality_checks',                 'id', ''],
    ['user_roles',                     'user_id', ''],
    ['vendors',                        'id', '']
  ];
  v_tbl text;
  v_key text;
  v_extra text;
  v_args text;
  i int;
begin
  for i in 1 .. array_length(v_cfg, 1) loop
    v_tbl := v_cfg[i][1];
    v_key := v_cfg[i][2];
    v_extra := v_cfg[i][3];
    v_args := quote_literal(v_key);
    if v_extra <> '' then
      v_args := v_args || ', ' || (select string_agg(quote_literal(trim(x)), ', ') from unnest(string_to_array(v_extra, ',')) x);
    end if;

    -- row-level audit (replaces the four 0058 triggers with identically
    -- named ones that pass the new arguments)
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || v_tbl, v_tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_fn_audit_log(%s)',
                   'trg_audit_' || v_tbl, v_tbl, v_args);

    -- truncate audit
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_truncate_' || v_tbl, v_tbl);
    execute format('create trigger %I after truncate on public.%I for each statement execute function public.trg_fn_audit_truncate()',
                   'trg_audit_truncate_' || v_tbl, v_tbl);

    -- standard who/when columns (nullable: existing rows' history is unknown)
    execute format('alter table public.%I add column if not exists created_at timestamptz', v_tbl);
    execute format('alter table public.%I alter column created_at set default now()', v_tbl);
    execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id)', v_tbl);
    execute format('alter table public.%I add column if not exists updated_at timestamptz', v_tbl);
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', v_tbl);

    execute format('drop trigger if exists %I on public.%I', 'trg_stamp_created_' || v_tbl, v_tbl);
    execute format('create trigger %I before insert on public.%I for each row execute function public.trg_fn_stamp_created()',
                   'trg_stamp_created_' || v_tbl, v_tbl);

    -- updated_at/updated_by via the existing set_updated_at(), only where a
    -- table doesn't already have it under its own name
    if not exists (
      select 1 from pg_trigger t
      where t.tgrelid = ('public.' || v_tbl)::regclass and not t.tgisinternal
        and t.tgfoid = 'public.set_updated_at'::regproc
    ) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                     'trg_stamp_updated_' || v_tbl, v_tbl);
    end if;
  end loop;
end $$;

-- inventory_ledger: its inserts are already the audit record; log only the
-- (never expected) updates/deletes, plus truncate.
drop trigger if exists trg_audit_inventory_ledger on public.inventory_ledger;
create trigger trg_audit_inventory_ledger
  after update or delete on public.inventory_ledger
  for each row execute function public.trg_fn_audit_log('id');
drop trigger if exists trg_audit_truncate_inventory_ledger on public.inventory_ledger;
create trigger trg_audit_truncate_inventory_ledger
  after truncate on public.inventory_ledger
  for each statement execute function public.trg_fn_audit_truncate();

-- ------------------------------------------------------------
-- audit_log is tamper-proof.
-- ------------------------------------------------------------
create or replace function public.trg_fn_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Audit log entries cannot be changed or deleted.' using errcode = '42501';
end $$;

drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.trg_fn_audit_log_immutable();
drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.trg_fn_audit_log_immutable();

-- ------------------------------------------------------------
-- User accounts (auth.users). The snapshot never includes the password hash.
-- ------------------------------------------------------------
create or replace function public._audit_account_snapshot(p_row jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'email', p_row ->> 'email',
    'full_name', p_row -> 'raw_user_meta_data' ->> 'full_name',
    'must_change_password', coalesce((p_row -> 'raw_app_meta_data' ->> 'must_change_password')::boolean, false),
    'email_confirmed', (p_row ->> 'email_confirmed_at') is not null,
    'banned_until', p_row ->> 'banned_until',
    'deleted_at', p_row ->> 'deleted_at'
  );
$$;

create or replace function public.trg_fn_audit_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_pw_changed boolean := false;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := public._audit_account_snapshot(to_jsonb(old)); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := public._audit_account_snapshot(to_jsonb(new)); end if;

  if tg_op = 'UPDATE' then
    v_pw_changed := (to_jsonb(new) ->> 'encrypted_password') is distinct from (to_jsonb(old) ->> 'encrypted_password');
    if not v_pw_changed and v_new = v_old then
      return new;  -- sign-ins and token refreshes only touch timestamps
    end if;
    v_new := v_new || jsonb_build_object('password_changed', v_pw_changed);
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
  values ('auth.users', case when tg_op = 'DELETE' then old.id else new.id end,
          lower(tg_op), v_old, v_new, auth.uid(), public._audit_changed_via());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- Creating a trigger on auth.users is normally allowed (0001 does it for
-- handle_new_user). If a future Supabase change refuses it, don't block the
-- rest of this migration — audit_coverage_report() will then list it.
do $$
begin
  execute 'drop trigger if exists trg_audit_auth_users on auth.users';
  execute 'create trigger trg_audit_auth_users after insert or update or delete on auth.users for each row execute function public.trg_fn_audit_auth_user()';
exception when insufficient_privilege then
  raise notice '0072: could not attach the account-change audit trigger to auth.users (%). Everything else is applied.', sqlerrm;
end $$;

-- Attribution for account actions done through Supabase Auth's admin API
-- (which does not know which System Admin asked). Called by the app right
-- after the action succeeds, with the admin's own session.
create or replace function public.audit_account_action(p_user_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if p_event not in ('account_created_by_admin', 'password_reset_by_admin', 'password_changed_by_user') then
    raise exception 'Unknown account event "%".', p_event;
  end if;
  if p_event = 'password_changed_by_user' then
    if auth.uid() is null or auth.uid() <> p_user_id then
      raise exception 'not authorized';
    end if;
  elsif not public.has_any_role('system_admin') then
    raise exception 'not authorized';
  end if;

  select email into v_email from auth.users where id = p_user_id;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
  values ('auth.users', p_user_id,
          case when p_event = 'account_created_by_admin' then 'insert' else 'update' end,
          null, jsonb_build_object('event', p_event, 'email', v_email),
          auth.uid(), public._audit_changed_via());
end $$;

revoke all on function public.audit_account_action(uuid, text) from public, anon;
grant execute on function public.audit_account_action(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- Coverage report: one row per gap. Empty = everything covered.
-- ------------------------------------------------------------
create or replace function public.audit_coverage_report()
returns table (table_name text, missing text)
language sql stable set search_path = public as $$
  with tbls as (
    select c.oid, c.relname::text as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'audit_log'
  ),
  trg as (
    select t.tgrelid, t.tgfoid, t.tgtype from pg_trigger t where not t.tgisinternal
  )
  select tbl, 'row audit for INSERT' from tbls
   where tbl <> 'inventory_ledger'
     and not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.trg_fn_audit_log'::regproc
                     and (tgtype & 1) = 1 and (tgtype & 4) = 4)
  union all
  select tbl, 'row audit for UPDATE' from tbls
   where not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.trg_fn_audit_log'::regproc
                     and (tgtype & 1) = 1 and (tgtype & 16) = 16)
  union all
  select tbl, 'row audit for DELETE' from tbls
   where not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.trg_fn_audit_log'::regproc
                     and (tgtype & 1) = 1 and (tgtype & 8) = 8)
  union all
  select tbl, 'TRUNCATE audit' from tbls
   where not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.trg_fn_audit_truncate'::regproc
                     and (tgtype & 32) = 32)
  union all
  select tbl, 'created_by stamp' from tbls
   where tbl <> 'inventory_ledger'
     and not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.trg_fn_stamp_created'::regproc)
  union all
  select tbl, 'updated_by stamp' from tbls
   where tbl <> 'inventory_ledger'
     and not exists (select 1 from trg where tgrelid = tbls.oid and tgfoid = 'public.set_updated_at'::regproc)
  union all
  select 'audit_log', 'tamper guard'
   where not exists (select 1 from trg where tgrelid = 'public.audit_log'::regclass
                     and tgfoid = 'public.trg_fn_audit_log_immutable'::regproc and (tgtype & 8) = 8 and (tgtype & 16) = 16)
  union all
  select 'auth.users', 'account-change audit'
   where not exists (select 1 from trg where tgrelid = 'auth.users'::regclass
                     and tgfoid = 'public.trg_fn_audit_auth_user'::regproc);
$$;

revoke all on function public.audit_coverage_report() from public, anon;
grant execute on function public.audit_coverage_report() to authenticated;

-- ------------------------------------------------------------
-- Self-check: every public table covered (auth.users is reported but, per
-- the guarded block above, does not abort the migration).
-- ------------------------------------------------------------
do $$
declare
  v_gaps text;
begin
  select string_agg(table_name || ': ' || missing, '; ') into v_gaps
  from public.audit_coverage_report()
  where table_name <> 'auth.users';
  if v_gaps is not null then
    raise exception '0072 self-check failed — audit coverage gaps: %', v_gaps;
  end if;
end $$;

commit;
