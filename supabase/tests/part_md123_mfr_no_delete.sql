\set ON_ERROR_STOP on
\pset footer off
-- ---------- helpers (invoker rights: they run as whoever calls them) ----------
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS  | ok      | % (as %)', p_label, current_user;
exception when others then
  raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm;
end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'FAIL  | blocked | % (as %) -> statement was ALLOWED', p_label, current_user;
exception when others then
  if position(p_expect in sqlerrm) > 0 then
    raise notice 'PASS  | blocked | % (as %) -> %', p_label, current_user, sqlerrm;
  else
    raise notice 'FAIL  | blocked | % (as %) -> wrong error: %', p_label, current_user, sqlerrm;
  end if;
end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if;
end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;

-- ---------- seed (as postgres) ----------
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),
 ('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),
 ('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into public.user_roles values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),
 ('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into public.item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into public.vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Test Vendor');
insert into public.items (id, item_code, name, category, unit, item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Test Oil','raw','kg','00000000-0000-0000-0000-0000000000c1');

\echo '===== 0123: an approved MFR cannot be deleted ====='
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('create and approve an MFR', $q$select public.create_mfr_definition('Approved MFR', 10, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select public.approve_mfr_definition((select id from mfr_definitions where name='Approved MFR'))$q$);
select t_ok('create a draft MFR', $q$select public.create_mfr_definition('Draft MFR', 5, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb, 'domestic')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('System Admin cannot delete the approved MFR', $q$delete from mfr_definitions where name='Approved MFR'$q$, 'is approved, so it cannot be deleted. Deactivate it instead.');
select t_check('the approved MFR, its recipe and its finished product item are still there',
  exists (select 1 from mfr_definitions d join mfr_lines l on l.mfr_definition_id = d.id join items i on i.id = d.finished_product_item_id where d.name = 'Approved MFR'));
select t_ok('it can still be deactivated and reactivated', $q$update mfr_definitions set active = false where name='Approved MFR'; update mfr_definitions set active = true where name='Approved MFR'$q$);
select t_ok('a draft MFR can still be deleted', $q$delete from mfr_definitions where name='Draft MFR'$q$);
select t_check('the draft and its recipe lines are gone',
  not exists (select 1 from mfr_definitions where name = 'Draft MFR')
  and not exists (select 1 from mfr_lines l left join mfr_definitions d on d.id = l.mfr_definition_id where d.id is null));
reset role;
select t_fail('not even the database owner can delete it', $q$delete from mfr_definitions where name='Approved MFR'$q$, 'cannot be deleted');
