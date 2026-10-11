-- 0113: Close the doors the public (anonymous) key could still reach, and add the idle sign-out setting
--
-- SCAN-P1-10: anyone holding the public key (it is in the web page) could call the
--   number generators (get_next_* / peek_next_*) and use up PO, COA, vendor, item,
--   MFR, packaging, equipment, dead-stock and feedback numbers, leaving gaps.
-- SCAN-P1-12: the anonymous role still held privileges on every table, and signed-in
--   users could write through views such as current_qc_approvals.
-- SCAN-P1-13: three helper functions (_item_stock_unit, check_sufficient_stock,
--   stability_reserve_left) run with full rights and were callable without signing in;
--   one of them could set an item's unit.
-- SCAN-P1-02 (setting only): the idle sign-out period lives in company_settings, set by
--   the System Administrator. 60 minutes by default, 0 switches it off. The sign-out itself
--   is done by the app and never applies to a System Admin.
--
-- Row-level security already stopped anonymous reads and writes of table rows; this removes
-- the grants and the execute rights underneath it, so one future table or policy written
-- carelessly is not open to the internet. Signed-in users keep every right they had.

begin;

-- ------------------------------------------------------------
-- 1. Helper functions: only a signed-in user with a role (SCAN-P1-13)
-- ------------------------------------------------------------
create or replace function public._item_stock_unit(p_item_id uuid, p_unit text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
begin
  if current_setting('role', true) in ('anon', 'authenticated') and not public.has_app_access() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select unit into v_unit from public.items where id = p_item_id;
  if v_unit is null and p_unit is not null then
    update public.items set unit = p_unit where id = p_item_id and unit is null;
    v_unit := p_unit;
  end if;
  return v_unit;
end $$;

create or replace function public.check_sufficient_stock(p_item_id uuid, p_quantity numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_name text;
  v_unit text;
  v_available numeric;
begin
  if current_setting('role', true) in ('anon', 'authenticated') and not public.has_app_access() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select item_code, name, unit into v_code, v_name, v_unit from public.items where id = p_item_id for update;

  select on_hand into v_available from public.stock_balance where item_id = p_item_id;
  v_available := coalesce(v_available, 0);

  if p_quantity > v_available then
    raise exception 'Not enough stock for %: % % available, % % needed.',
      case when v_code is null then 'this item' else v_code || ' · ' || coalesce(v_name, '') end,
      trim_scale(round(v_available, 6)), coalesce(v_unit, ''),
      trim_scale(round(p_quantity, 6)), coalesce(v_unit, '');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Functions: no execute for the public or anonymous role (SCAN-P1-10, P1-13)
--    Every ordinary function in the public schema (trigger functions and extension
--    functions are left alone). Signed-in users and the service role keep exactly the
--    execute rights they had.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           has_function_privilege('service_role', p.oid, 'execute') as svc_ok
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    -- keep exactly what signed-in users and the service role could do before (some
    -- internal functions were already closed to them on purpose); only the public
    -- and anonymous rights go.
    begin
      execute format('revoke all on function %s from public, anon', r.fn);
      if r.auth_ok then execute format('grant execute on function %s to authenticated', r.fn); end if;
      if r.svc_ok then execute format('grant execute on function %s to service_role', r.fn); end if;
    exception when others then
      raise notice '0113: could not change %: %', r.fn, sqlerrm;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 3. Number sequences and tables: nothing for the anonymous role (SCAN-P1-10, P1-12)
-- ------------------------------------------------------------
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from anon;

-- A relation that is only a view is read-only for signed-in users too (SCAN-P1-12).
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as rel
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    begin
      execute format('revoke insert, update, delete, truncate, references, trigger on %s from authenticated', r.rel);
    exception when others then
      raise notice '0113: could not change %: %', r.rel, sqlerrm;
    end;
  end loop;
end $$;

-- Objects created from now on: not open to the anonymous role either.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
do $$
begin
  -- Supabase creates some objects as its own admin role; this only works when allowed.
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on functions from anon';
exception when others then
  raise notice '0113: default privileges of supabase_admin not changed (%).', sqlerrm;
end $$;

-- ------------------------------------------------------------
-- 4. Idle sign-out setting (SCAN-P1-02, Ravi 12 Oct 2026)
--    0 = switched off; otherwise 5 to 480 minutes. Default 60. Never applied to System Admin.
-- ------------------------------------------------------------
alter table public.company_settings
  add column if not exists idle_timeout_minutes integer not null default 60;
alter table public.company_settings drop constraint if exists company_settings_idle_timeout_check;
alter table public.company_settings
  add constraint company_settings_idle_timeout_check
  check (idle_timeout_minutes = 0 or idle_timeout_minutes between 5 and 480);

create or replace function public.set_idle_timeout(p_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can change the automatic sign-out.' using errcode = 'P0001';
  end if;
  if p_minutes is null or not (p_minutes = 0 or p_minutes between 5 and 480) then
    raise exception 'Enter 0 to switch automatic sign-out off, or a number of minutes from 5 to 480.' using errcode = 'P0001';
  end if;
  update public.company_settings set idle_timeout_minutes = p_minutes where singleton;
end $$;
revoke all on function public.set_idle_timeout(integer) from public, anon;
grant execute on function public.set_idle_timeout(integer) to authenticated, service_role;

commit;
