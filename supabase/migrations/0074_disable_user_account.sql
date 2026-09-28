-- ============================================================
-- Disable / re-enable a user account (Ravi, 28 Sept 2026: "add functionality
-- to disable user if user leaves").
--
-- An account that has ever made a change cannot be deleted — audit_log
-- (and the created_by/updated_by columns) still point to it, which is what
-- keeps the history attributable. So a leaver is DISABLED instead, from User
-- Roles & Access (lib/actions/admin-users.ts):
--   1. all their roles are removed with set_user_roles() (0073) — one
--      transaction, and refused if they are the last System Admin;
--   2. Supabase Auth bans the account (no sign-in, no session refresh);
--   3. the app (proxy) signs out any session they still have open on their
--      next request.
-- Re-enabling lifts the ban; the System Admin then ticks their roles again.
--
-- The ban itself is recorded automatically by 0072's account-change audit
-- (banned_until), but Supabase Auth does not know which admin asked. This
-- migration only lets audit_account_action() record two more events so the
-- Audit Log names the admin: account_disabled_by_admin and
-- account_enabled_by_admin. Nothing else changes.
-- ============================================================

begin;

create or replace function public.audit_account_action(p_user_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if p_event not in ('account_created_by_admin', 'password_reset_by_admin', 'password_changed_by_user',
                     'account_disabled_by_admin', 'account_enabled_by_admin') then
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

commit;
