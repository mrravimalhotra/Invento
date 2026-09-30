-- ============================================================
-- A System Admin cannot remove their OWN System Admin role (Ravi, 30 Sept 2026:
-- "own System Admin option should be disabled for System Admins so they can
-- not degrade their own access. Only another system admin can degrade other
-- system admins access/role").
--
-- One row-level guard on user_roles, so it holds on every path: the User Roles
-- & Access screen (set_user_roles, 0073), a direct API call, or disabling an
-- account. It refuses a delete of the signed-in user's own system_admin row,
-- or an update that changes that row's role or owner.
--
-- Not affected: another System Admin changing this user's roles (the existing
-- "at least one System Admin must remain" guard from 0073 still applies);
-- changes to a user's other roles; the SQL editor / service role (no signed-in
-- user, auth.uid() is null); adding roles.
-- ============================================================

begin;

create or replace function public.trg_fn_no_self_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'system_admin'
     and old.user_id is not null
     and old.user_id = auth.uid()
     and (tg_op = 'DELETE' or new.role is distinct from old.role or new.user_id is distinct from old.user_id)
  then
    raise exception 'You cannot remove your own System Admin role. Ask another System Admin to do it.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_user_roles_no_self_admin_removal on public.user_roles;
create trigger trg_user_roles_no_self_admin_removal
  before delete or update on public.user_roles
  for each row execute function public.trg_fn_no_self_admin_removal();

commit;
