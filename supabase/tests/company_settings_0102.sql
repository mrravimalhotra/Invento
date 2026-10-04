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
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager');

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== defaults and who may change'
select t_check('one row, name and slash-form licence as agreed',
  (select count(*) = 1 and min(company_name) = 'Atharva Nature Healthcare Pvt. Ltd.' and min(licence_no) = 'PD/AYU/111' and min(licence_label) = 'Mfg. Lic. No.' from company_settings));
select t_fail('inventory manager cannot change it', $q$select set_company_settings('X Ltd','Pune','Mfg. Lic. No.','PD/AYU/222')$q$, 'Only the System Administrator');
select t_ok('a direct update changes nothing (no update policy)', $q$update company_settings set licence_no = 'HACK'$q$);
select t_check('licence unchanged after the refused attempts', (select licence_no = 'PD/AYU/111' from company_settings));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo '===== System Administrator changes it'
select t_ok('admin changes the licence number', $q$select set_company_settings('Atharva Nature Healthcare Pvt. Ltd.','Wagholi, Pune','Mfg. Lic. No.','  PD/AYU/112  ')$q$);
select t_check('new licence saved, trimmed', (select licence_no = 'PD/AYU/112' from company_settings));
select t_fail('blank company name refused', $q$select set_company_settings('  ','Pune','Mfg. Lic. No.','PD/AYU/112')$q$, 'Company name is required');
select t_fail('blank licence refused', $q$select set_company_settings('A','Pune','Mfg. Lic. No.','')$q$, 'Licence number is required');
select t_fail('blank label refused', $q$select set_company_settings('A','Pune',' ','PD/AYU/112')$q$, 'Licence label is required');
select t_fail('too long refused', $q$select set_company_settings(repeat('x',121),'Pune','Mfg. Lic. No.','PD/AYU/112')$q$, 'too long');
select t_check('still one row, stamped', (select count(*) = 1 and bool_and(updated_by is not null) from company_settings));
reset role;
select t_check('the change is in the audit log', (select count(*) >= 1 from audit_log where table_name = 'company_settings'));
