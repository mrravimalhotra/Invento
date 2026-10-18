-- 0124: function access hardening (Ravi, 18 Oct 2026: "Lock only what no screen uses")
-- Supabase's security advisor flagged functions callable by people who are not
-- signed in, internal helpers callable by any signed-in user, and functions
-- without a fixed search_path. Nothing a screen does changes:
--   1. Trigger functions lose EXECUTE for public, anon and authenticated. A
--      trigger function cannot be called directly anyway, and PostgreSQL checks
--      EXECUTE only when a trigger is created, never when it fires.
--   2. Three internal helpers that no screen, policy, view or invoker function
--      calls (checked against the app's code and the live catalog) are kept for
--      the database itself: can_manage_coa_template, check_sufficient_stock,
--      stability_reserve_left. Security definer functions that use them run as
--      the owner and are unaffected.
--   3. Every public function without one gets search_path = public, extensions,
--      the same path the API sessions already use, so no result changes.
-- Functions created later are already closed to anon by 0113's default privileges.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

revoke execute on function public.can_manage_coa_template(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.check_sufficient_stock(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.stability_reserve_left(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_manage_coa_template(uuid, uuid), public.check_sufficient_stock(uuid, numeric),
  public.stability_reserve_left(uuid, uuid) to service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions', r.fn);
  end loop;
end $$;

-- Self-check: the migration stops if any of the three outcomes is not reached.
do $$
declare
  v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if v <> 0 then raise exception '0124 self-check: % public functions still executable by anon', v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if v <> 0 then raise exception '0124 self-check: % trigger functions still executable by authenticated', v; end if;

  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%');
  if v <> 0 then raise exception '0124 self-check: % public functions without a search_path', v; end if;
end $$;
