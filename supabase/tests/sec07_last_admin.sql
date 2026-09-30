\set ON_ERROR_STOP on
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS  | ok      | % (as %)', p_label, current_user;
exception when others then raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'FAIL  | blocked | % (as %) -> statement was ALLOWED', p_label, current_user;
exception when others then
  if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % (as %) -> %', p_label, current_user, sqlerrm;
  else raise notice 'FAIL  | blocked | % (as %) -> wrong error: %', p_label, current_user, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if p_cond then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;
create or replace function public.t_roles(u uuid) returns text language sql security definer as $$
  select coalesce(string_agg(role, ',' order by role), '') from public.user_roles where user_id = u $$;
grant execute on function public.t_roles(uuid) to authenticated;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin1@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),
 ('00000000-0000-0000-0000-0000000000a6','admin2@t'),('00000000-0000-0000-0000-0000000000a7','new@t');

\echo '===== fresh database: no admin yet ====='
select t_ok('no admin exists: add + remove a non-admin role directly', $q$insert into user_roles(user_id,role) values ('00000000-0000-0000-0000-0000000000a7','mfr_manager'); delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a7'$q$);
insert into public.user_roles(user_id, role) values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000a6','system_admin');

\echo '===== non-admin ====='
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select set_config('request.jwt.claim.role','authenticated',false);
select t_fail('inventory manager calls set_user_roles', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['system_admin'])$q$, 'Only System Admin');
select t_check('IM roles unchanged', t_roles('00000000-0000-0000-0000-0000000000a2') = 'inventory_manager');

\echo '===== admin1 edits roles ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('add QC Checker to IM user', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['inventory_manager','quality_checker'])$q$);
select t_check('now IM + QC Checker', t_roles('00000000-0000-0000-0000-0000000000a2') = 'inventory_manager,quality_checker');
select t_ok('remove IM, keep QC Checker', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['quality_checker'])$q$);
select t_check('now QC Checker only', t_roles('00000000-0000-0000-0000-0000000000a2') = 'quality_checker');
select t_ok('duplicates and nulls ignored', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['quality_checker','quality_checker',null,'mfr_manager'])$q$);
select t_check('QC Checker + MFR Manager', t_roles('00000000-0000-0000-0000-0000000000a2') = 'mfr_manager,quality_checker');
select t_fail('unknown role', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['quality_checker','god_mode'])$q$, 'Unknown role: god_mode');
select t_check('roles unchanged after unknown role', t_roles('00000000-0000-0000-0000-0000000000a2') = 'mfr_manager,quality_checker');
select t_fail('user does not exist', $q$select set_user_roles('00000000-0000-0000-0000-0000000000ff', array['mfr_manager'])$q$, 'User not found');
select t_ok('new user given a role', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a7', array['super_auditor'])$q$);
select t_check('new user = super_auditor', t_roles('00000000-0000-0000-0000-0000000000a7') = 'super_auditor');
select t_ok('clear all roles of a user (empty set)', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a7', array[]::text[])$q$);
select t_check('new user now has no roles', t_roles('00000000-0000-0000-0000-0000000000a7') = '');
select t_ok('same set saved again (no change)', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a2', array['mfr_manager','quality_checker'])$q$);
reset role;
select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_check('audit: only real role changes logged for user a2 (2 inserts QC+MFR, 1 delete IM)',
  (select count(*) filter (where action='insert') = 2 and count(*) filter (where action='delete') = 1 and count(*) = 3
     from audit_log where table_name='user_roles' and row_id='00000000-0000-0000-0000-0000000000a2' and changed_via='app'));
select t_check('audit: changes attributed to admin1',
  not exists (select 1 from audit_log where table_name='user_roles' and changed_via='app' and changed_by is distinct from '00000000-0000-0000-0000-0000000000a1'));

\echo '===== last System Admin guard ====='
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select set_config('request.jwt.claim.role','authenticated',false);
select t_ok('admin1 gives admin2 MFR Manager too', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a6', array['system_admin','mfr_manager'])$q$);
select t_ok('admin1 removes own admin while admin2 remains', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a1', array['inventory_manager'])$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select t_fail('admin2 (last admin) removes own admin via screen', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a6', array['mfr_manager'])$q$, 'At least one System Admin must remain');
select t_check('admin2 keeps admin + MFR (whole change rolled back)', t_roles('00000000-0000-0000-0000-0000000000a6') = 'mfr_manager,system_admin');
select t_fail('last admin: clear all roles', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a6', array[]::text[])$q$, 'At least one System Admin must remain');
select t_fail('last admin: direct API delete of admin row', $q$delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a6' and role='system_admin'$q$, 'At least one System Admin must remain');
select t_fail('last admin: direct API delete of all their rows', $q$delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a6'$q$, 'At least one System Admin must remain');
select t_fail('last admin: direct API update role to super_auditor', $q$update user_roles set role='super_auditor' where user_id='00000000-0000-0000-0000-0000000000a6' and role='system_admin'$q$, 'At least one System Admin must remain');
select t_ok('last admin: removing a non-admin role still fine', $q$delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a6' and role='mfr_manager'$q$);
select t_ok('give admin back to admin1', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a1', array['inventory_manager','system_admin'])$q$);
select t_ok('with two admins, admin2 may step down', $q$select set_user_roles('00000000-0000-0000-0000-0000000000a6', array['super_auditor'])$q$);
reset role;
select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_fail('SQL editor: delete last admin row', $q$delete from user_roles where role='system_admin'$q$, 'At least one System Admin must remain');
select t_fail('SQL editor: delete the last admin''s account (cascade)', $q$delete from auth.users where id='00000000-0000-0000-0000-0000000000a1'$q$, 'At least one System Admin must remain');
select t_check('admin1 account and admin role intact', t_roles('00000000-0000-0000-0000-0000000000a1') = 'inventory_manager,system_admin' and exists (select 1 from auth.users where id='00000000-0000-0000-0000-0000000000a1'));
select t_ok('SQL editor: deleting a non-admin account still fine', $q$delete from auth.users where id='00000000-0000-0000-0000-0000000000a7'$q$);
select t_check('anon cannot execute set_user_roles', not has_function_privilege('anon','public.set_user_roles(uuid,text[])','execute'));
select t_check('authenticated can execute set_user_roles', has_function_privilege('authenticated','public.set_user_roles(uuid,text[])','execute'));
select t_check('coverage report still empty', not exists (select 1 from audit_coverage_report()));
-- set up for the concurrency test: two admins
insert into user_roles(user_id, role) values ('00000000-0000-0000-0000-0000000000a6','system_admin');
