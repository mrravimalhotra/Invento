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
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to anon, authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a6','norole@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');
insert into items (id,item_code,name,category,unit) values ('00000000-0000-0000-0000-0000000000c4','FP-T0001','Finished A','processed',null);

\echo '===== the privileges themselves'
select t_check('the anonymous role has no privilege on any table or view in public', (select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public') = 0);
select t_check('the anonymous role can execute no ordinary function in public (test helpers aside)', (
  select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and p.proname not like 't\_%' and p.prorettype <> 'pg_catalog.trigger'::regtype
     and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
     and has_function_privilege('anon', p.oid, 'execute')) = 0);
select t_check('the anonymous role has no sequence privilege', (with s as materialized (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S') select count(*) from s where has_sequence_privilege('anon', s.oid, 'usage')) = 0);
select t_check('signed-in users can still execute the number generators', has_function_privilege('authenticated','public.get_next_po_number()','execute') and has_function_privilege('authenticated','public.get_next_vendor_code()','execute'));
select t_check('no view can be written by signed-in users', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))) = 0);
create table public.t_new_table (id int);
create function public.t_new_fn() returns int language sql as 'select 1';
select t_check('a table created from now on is not open to the anonymous role', not has_table_privilege('anon','public.t_new_table','select') and not has_table_privilege('anon','public.t_new_table','insert'));
select t_check('a function created from now on is not executable by the anonymous role', not has_function_privilege('anon','public.t_new_fn()','execute'));
select t_check('...but signed-in users can use it', has_function_privilege('authenticated','public.t_new_fn()','execute') and has_table_privilege('authenticated','public.t_new_table','select'));

\echo '===== SCAN-P1-10 / P1-12 / P1-13: the anonymous caller'
set role anon;
select set_config('request.jwt.claim.role','anon',false);
select set_config('request.jwt.claim.sub','',false);
select t_fail('anonymous: get_next_po_number refused', $q$select get_next_po_number()$q$, 'permission denied');
select t_fail('anonymous: get_next_coa_number refused', $q$select get_next_coa_number()$q$, 'permission denied');
select t_fail('anonymous: peek_next_item_code refused', $q$select peek_next_item_code('raw')$q$, 'permission denied');
select t_fail('anonymous: the number sequence is closed', $q$select nextval('public.item_code_seq_raw')$q$, 'permission denied');
select t_fail('anonymous: _item_stock_unit refused', $q$select _item_stock_unit('00000000-0000-0000-0000-0000000000c4','kg')$q$, 'permission denied');
select t_fail('anonymous: check_sufficient_stock refused', $q$select check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 9999)$q$, 'permission denied');
select t_fail('anonymous: stability_reserve_left refused', $q$select stability_reserve_left('00000000-0000-0000-0000-0000000000e1', null)$q$, 'permission denied');
select t_fail('anonymous: cannot read items', $q$select count(*) from items$q$, 'permission denied');
select t_fail('anonymous: cannot read a reporting view', $q$select count(*) from coa_template_register$q$, 'permission denied');
select t_fail('anonymous: cannot insert a vendor', $q$insert into vendors (vendor_code, name) values ('V-ANON','x')$q$, 'permission denied');
reset role;
select t_check('the FP item still has no unit (the anonymous call changed nothing)', (select unit from items where id='00000000-0000-0000-0000-0000000000c4') is null);

\echo '===== a signed-in user with no role'
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select t_fail('no role: _item_stock_unit refused', $q$select _item_stock_unit('00000000-0000-0000-0000-0000000000c4','kg')$q$, 'Not allowed');
select t_fail('no role: check_sufficient_stock refused (0124: internal only)', $q$select check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 1)$q$, 'permission denied for function check_sufficient_stock');
reset role;
select t_check('the FP item still has no unit (the no-role call changed nothing)', (select unit from items where id='00000000-0000-0000-0000-0000000000c4') is null);

\echo '===== a user with a role keeps every right'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('get_next_po_number works', $q$select get_next_po_number()$q$);
select t_ok('peek_next_item_code works', $q$select peek_next_item_code('raw')$q$);
select t_fail('check_sufficient_stock is internal since 0124 (no screen calls it)', $q$select check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 0)$q$, 'permission denied for function check_sufficient_stock');
reset role;
select t_fail('check_sufficient_stock still says what is short (as the owner, as the packaging triggers call it)', $q$select check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 5)$q$, 'Not enough stock');
set role authenticated;
select t_ok('_item_stock_unit sets a blank unit as before', $q$select _item_stock_unit('00000000-0000-0000-0000-0000000000c4','kg')$q$);
select t_ok('a vendor can be added', $q$insert into vendors (vendor_code, name) values ('V-OK','Vendor OK')$q$);
select t_fail('no writing through the current approvals view (insert)', $q$insert into current_qc_approvals (quality_check_id) values (gen_random_uuid())$q$, 'permission denied');
select t_fail('no writing through the current approvals view (update)', $q$update current_qc_approvals set quality_check_id = gen_random_uuid()$q$, 'permission denied');
select t_fail('no writing through the current approvals view (delete)', $q$delete from current_qc_approvals$q$, 'permission denied');

\echo '===== SCAN-P1-02: the idle sign-out setting'
select t_check('every signed-in user can read it, default 60 minutes', (select idle_timeout_minutes from company_settings) = 60);
select t_fail('Inventory Manager cannot change it', $q$select set_idle_timeout(30)$q$, 'Only the System Administrator');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('System Admin sets 30 minutes', $q$select set_idle_timeout(30)$q$);
select t_check('it is saved', (select idle_timeout_minutes from company_settings) = 30);
select t_fail('under 5 minutes refused', $q$select set_idle_timeout(3)$q$, 'from 5 to 480');
select t_fail('over 480 minutes refused', $q$select set_idle_timeout(500)$q$, 'from 5 to 480');
select t_fail('blank refused', $q$select set_idle_timeout(null)$q$, 'from 5 to 480');
select t_ok('0 switches it off', $q$select set_idle_timeout(0)$q$);
select t_check('and is saved as 0', (select idle_timeout_minutes from company_settings) = 0);
select t_ok('60 again', $q$select set_idle_timeout(60)$q$);
select t_ok('a direct table update by a System Admin changes nothing (no write policy)', $q$update company_settings set idle_timeout_minutes = 5 where singleton$q$);
select t_check('the setting is still 60', (select idle_timeout_minutes from company_settings) = 60);
reset role;
select t_check('the change is in the audit log', (select count(*) from audit_log where table_name='company_settings' and action='update') >= 1);
