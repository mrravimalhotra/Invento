\set ON_ERROR_STOP on
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS  | ok      | %', p_label;
exception when others then raise notice 'FAIL  | ok      | % -> %', p_label, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'FAIL  | blocked | % -> statement was ALLOWED', p_label;
exception when others then
  if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm;
  else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1','admin@example.com'),
  ('00000000-0000-0000-0000-0000000000a2','maker@example.com');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager');

\echo '===== SCAN-P1-16: sign-in and sign-out are recorded for the person themselves'
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('a user records their own sign-in', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a2','sign_in')$q$);
select t_ok('a user records their own sign-out', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a2','sign_out')$q$);
select t_fail('a user cannot record a sign-in for someone else', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a1','sign_in')$q$, 'not authorized');
select t_fail('a user cannot record an admin action', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a1','password_reset_by_admin')$q$, 'not authorized');
select t_fail('an unknown event is refused', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a2','logged_in_somehow')$q$, 'Unknown account event');
select t_fail('a signed-in user cannot call the failed-attempt recorder', $q$select public.audit_sign_in_failed('x@example.com')$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.role','',false); select set_config('request.jwt.claim.sub','',false);
select t_check('sign-in row is attributed to the user with their e-mail', exists (select 1 from audit_log where table_name='auth.users' and new_data->>'event'='sign_in' and changed_by='00000000-0000-0000-0000-0000000000a2' and new_data->>'email'='maker@example.com'));
select t_check('sign-out row exists', exists (select 1 from audit_log where table_name='auth.users' and new_data->>'event'='sign_out' and changed_by='00000000-0000-0000-0000-0000000000a2'));

\echo '===== SCAN-P1-16: failed sign-ins (server only)'
set role anon;
select t_fail('the public key cannot record failed attempts', $q$select public.audit_sign_in_failed('x@example.com')$q$, 'permission denied');
reset role;
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
select t_ok('the server records a failed attempt for a known e-mail (typed in capitals)', $q$select public.audit_sign_in_failed('  Maker@Example.com ')$q$);
select t_ok('the server records a failed attempt for an unknown e-mail', $q$select public.audit_sign_in_failed('nobody@example.com')$q$);
select t_ok('an empty e-mail is ignored', $q$select public.audit_sign_in_failed('   ')$q$);
reset role;
select set_config('request.jwt.claim.role','',false);
select t_check('known e-mail: row points at the account and says it was found', exists (select 1 from audit_log where new_data->>'event'='sign_in_failed' and new_data->>'email'='maker@example.com' and row_id='00000000-0000-0000-0000-0000000000a2' and (new_data->>'account_found')::boolean and changed_by is null and changed_via='server'));
select t_check('unknown e-mail: row recorded with account_found false', exists (select 1 from audit_log where new_data->>'event'='sign_in_failed' and new_data->>'email'='nobody@example.com' and not (new_data->>'account_found')::boolean));
select t_check('no row stores a password field', not exists (select 1 from audit_log where table_name='auth.users' and new_data ? 'password'));
select t_check('the empty e-mail wrote nothing', (select count(*) from audit_log where new_data->>'event'='sign_in_failed') = 2);

\echo '===== SCAN-P1-16: flood protection'
set role service_role;
select public.audit_sign_in_failed('spam@example.com') from generate_series(1,30);
reset role;
select t_check('only 20 failed attempts per e-mail per hour are written', (select count(*) from audit_log where new_data->>'event'='sign_in_failed' and new_data->>'email'='spam@example.com') = 20);
select t_check('one marker line says further attempts were not recorded', (select count(*) from audit_log where new_data->>'event'='sign_in_failed_suppressed') = 1);
set role service_role;
select public.audit_sign_in_failed('u'||g||'@example.com') from generate_series(1,250) g;
reset role;
select t_check('at most 200 failed attempts in all per hour', (select count(*) from audit_log where new_data->>'event'='sign_in_failed') = 200);
select t_check('the marker is not repeated within the hour', (select count(*) from audit_log where new_data->>'event'='sign_in_failed_suppressed') = 1);

\echo '===== SCAN-P1-16: the log stays tamper-proof'
select t_fail('a sign-in entry cannot be edited', $q$update audit_log set changed_by = null where new_data->>'event'='sign_in'$q$, 'cannot be changed or deleted');
