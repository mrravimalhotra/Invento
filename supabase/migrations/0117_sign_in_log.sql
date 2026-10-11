-- 0117: Sign-ins, sign-outs and failed sign-ins in the Audit Log (SCAN-P1-16)
--
-- The Audit Log already records what a System Admin does to accounts and a
-- password changed on the forced first-sign-in screen. This adds, in the same
-- place (table "User Account"):
--   sign_in, sign_out          recorded for the signed-in person themselves
--   sign_in_failed             recorded by the app server (service role only), with
--                              the e-mail that was typed, never the password
--   sign_in_failed_suppressed  one marker line when too many failed attempts came
--                              in an hour (so the log cannot be flooded)
-- Recording must never stop anyone signing in: the app ignores a failure here.

begin;

create or replace function public.audit_account_action(p_user_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if p_event not in ('account_created_by_admin', 'password_reset_by_admin', 'password_changed_by_user',
                     'account_disabled_by_admin', 'account_enabled_by_admin', 'sign_in', 'sign_out') then
    raise exception 'Unknown account event "%".', p_event;
  end if;
  if p_event in ('password_changed_by_user', 'sign_in', 'sign_out') then
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

-- A failed sign-in has no signed-in person, so the app server records it with the
-- service-role key. The public (anon) key cannot call this, so nobody can forge
-- failed attempts through the API.
create or replace function public.audit_sign_in_failed(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := left(lower(btrim(coalesce(p_email, ''))), 200);
  v_user uuid;
  v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_email = '' then return; end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;

  -- At most 20 failed attempts per e-mail and 200 in all per hour are written;
  -- after that one marker line says so, and nothing more until the hour is over.
  if (select count(*) from public.audit_log
       where table_name = 'auth.users' and new_data->>'event' = 'sign_in_failed'
         and new_data->>'email' = v_email and changed_at > now() - interval '1 hour') >= 20
     or (select count(*) from public.audit_log
          where table_name = 'auth.users' and new_data->>'event' = 'sign_in_failed'
            and changed_at > now() - interval '1 hour') >= 200 then
    if not exists (select 1 from public.audit_log
                    where table_name = 'auth.users' and new_data->>'event' = 'sign_in_failed_suppressed'
                      and changed_at > now() - interval '1 hour') then
      insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
      values ('auth.users', v_nil, 'update', null,
              jsonb_build_object('event', 'sign_in_failed_suppressed'), null, 'server');
    end if;
    return;
  end if;

  insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by, changed_via)
  values ('auth.users', coalesce(v_user, v_nil), 'update', null,
          jsonb_build_object('event', 'sign_in_failed', 'email', v_email, 'account_found', v_user is not null),
          null, 'server');
end $$;

revoke all on function public.audit_sign_in_failed(text) from public, anon, authenticated;
grant execute on function public.audit_sign_in_failed(text) to service_role;

commit;
