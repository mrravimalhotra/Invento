\set ON_ERROR_STOP off
\pset footer off
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'ALLOWED | % (as %)', p_label, current_user;
exception when others then raise notice 'REFUSED | % -> %', p_label, sqlerrm; end $$;
grant execute on function public.t_ok(text,text) to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),
 ('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t'),
 ('00000000-0000-0000-0000-0000000000a6','both@t');
insert into public.user_roles values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer'),
 ('00000000-0000-0000-0000-0000000000a6','quality_checker'),('00000000-0000-0000-0000-0000000000a6','qc_reviewer');
insert into public.item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into public.vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Test Vendor');
insert into public.items (id, item_code, name, category, unit, item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Test Oil','raw','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-01/26',10,'kg',0.5,0.5,1),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-02/26',10,'kg',0.5,0.5,1);
select public.submit_purchase_order('00000000-0000-0000-0000-0000000000d1');

\echo === A: Quality Checker records Round 1 naming ANOTHER person (a1 admin) as the checker
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,created_by) values ('00000000-0000-0000-0000-0000000000f1','AR-T1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.5,'kg','00000000-0000-0000-0000-0000000000a4');
select t_ok('A Round 1 with checker_by = someone else', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a1', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'A result: checker_by=' || checker_by || ' (actual caller was a4)' from quality_checks where id='00000000-0000-0000-0000-0000000000f1';

\echo === B: QC Reviewer approves naming ANOTHER person as reviewer
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('B Round 2 with reviewed_by = someone else', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a2', reviewed_at=now(), retest_period_days=180 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'B result: reviewed_by=' || reviewed_by || ' (actual caller was a5)' from quality_checks where id='00000000-0000-0000-0000-0000000000f1';

\echo === C: one person holding both QC roles does Round 1 and Round 2 on the same record
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,created_by) values ('00000000-0000-0000-0000-0000000000f2','AR-T2','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.5,'kg','00000000-0000-0000-0000-0000000000a6');
select t_ok('C1 Round 1 honest', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a6', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_ok('C2 Round 2 same person, honest', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a6', reviewed_at=now(), retest_period_days=180 where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_ok('C3 Round 2 same person, checker_by blanked in the same update', $q$update quality_checks set status='approved', checker_by=null, reviewed_by='00000000-0000-0000-0000-0000000000a6', reviewed_at=now(), retest_period_days=180 where id='00000000-0000-0000-0000-0000000000f2'$q$);
select 'C result: status=' || status || ' checker_by=' || coalesce(checker_by::text,'NULL') || ' reviewed_by=' || coalesce(reviewed_by::text,'NULL') from quality_checks where id='00000000-0000-0000-0000-0000000000f2';

\echo === D: System Admin does both rounds
reset role;
update quality_checks set status='submitted', checker_by=null, reviewed_by=null where false;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
