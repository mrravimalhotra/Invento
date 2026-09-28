-- ============================================================
-- SEC-07 (docs/AI_TESTING_SECURITY_PERFORMANCE_REFERENCE.md): role changes
-- are saved in one step, and the last System Admin can never be removed.
--
-- Before: setUserRoles() (lib/actions/user-roles.ts) deleted all of a
-- user's roles, then inserted the new set in a second request. A failure
-- between the two left the user with no roles at all. And nothing stopped
-- the last System Admin being removed (by un-ticking the box, by a direct
-- API call, or by deleting that user's account), after which nobody could
-- manage users or roles from the app.
--
-- 1. set_user_roles(p_user_id, p_roles): the only thing the User Roles &
--    Access screen now calls. System Admin only. One transaction: adds the
--    newly ticked roles, removes the un-ticked ones, leaves the rest alone
--    (so the audit log from 0072 shows only the roles that really changed,
--    not a delete-all + re-add of every role).
-- 2. A guard on user_roles itself: any statement that removes a
--    system_admin row (delete, update, or the cascade from deleting that
--    user's account) is refused if no System Admin would remain. It applies
--    to every path — the screen, a direct API call, the SQL editor — and
--    rolls back the whole change, so the user keeps their old roles.
--    Two admins removing each other at the same moment are serialised by a
--    transaction lock, so they cannot both succeed.
--
-- Unaffected: adding roles (createUserAccount inserts directly, as before —
-- still gated by the user_roles_write RLS policy), purge_test_data() (keeps
-- user_roles), and a fresh database with no admin yet (the guard only fires
-- when a statement actually removes a system_admin row).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Guard: at least one System Admin must remain
-- ------------------------------------------------------------
create or replace function public.trg_fn_keep_one_system_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from old_rows where role = 'system_admin') then
    -- Serialise with any other role change in flight, then look at the
    -- committed state (read committed: this query takes a fresh snapshot).
    perform pg_advisory_xact_lock(hashtext('public.user_roles'));
    if not exists (select 1 from public.user_roles where role = 'system_admin') then
      raise exception 'At least one System Admin must remain. Give System Admin to another user first.'
        using errcode = 'P0001';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_user_roles_keep_admin_delete on public.user_roles;
create trigger trg_user_roles_keep_admin_delete
  after delete on public.user_roles
  referencing old table as old_rows
  for each statement execute function public.trg_fn_keep_one_system_admin();

drop trigger if exists trg_user_roles_keep_admin_update on public.user_roles;
create trigger trg_user_roles_keep_admin_update
  after update on public.user_roles
  referencing old table as old_rows
  for each statement execute function public.trg_fn_keep_one_system_admin();

-- ------------------------------------------------------------
-- set_user_roles: replace a user's roles in one step
-- ------------------------------------------------------------
create or replace function public.set_user_roles(p_user_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valid constant text[] := array[
    'inventory_manager', 'system_admin', 'super_auditor',
    'quality_checker', 'qc_reviewer', 'mfr_manager'
  ];
  v_roles text[];
  v_bad   text;
begin
  if not public.has_role('system_admin') then
    raise exception 'Not authorized. Only System Admin can change user roles.'
      using errcode = '42501';
  end if;

  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct r), '{}')
    into v_roles
    from unnest(coalesce(p_roles, '{}'::text[])) as r
   where r is not null;

  select r into v_bad from unnest(v_roles) as r where r <> all (v_valid) limit 1;
  if v_bad is not null then
    raise exception 'Unknown role: %', v_bad using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.user_roles'));

  -- Add first, then remove, so a user is never briefly role-less.
  insert into public.user_roles (user_id, role)
  select p_user_id, r from unnest(v_roles) as r
  on conflict (user_id, role) do nothing;

  delete from public.user_roles
   where user_id = p_user_id
     and role <> all (v_roles);
end;
$$;

revoke all on function public.set_user_roles(uuid, text[]) from public, anon;
grant execute on function public.set_user_roles(uuid, text[]) to authenticated;

commit;
