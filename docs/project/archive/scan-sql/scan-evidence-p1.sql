-- Scan evidence, Phase 1 (P1.2). Run on a SCRATCH copy of the local test database only (never on live).
-- Build: scripts/dev/auth_stub.sql + supabase/fresh-install.sql into a new database, then run the three parts in order.
-- Each t_ok line prints ALLOWED or REFUSED; 'result' lines show the stored values.

-- ===== PART 1: sections A to C (identity columns, two-person rule) =====
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

-- ===== PART 2: section E and F (decided record edits, direct inserts) =====
\pset footer off
set role authenticated;
\echo === E: Round-1 role (quality_checker a4) edits an already APPROVED record (f1)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('E1 change status approved -> rejected', $q$update quality_checks set status='rejected' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'E1 result status=' || status from quality_checks where id='00000000-0000-0000-0000-0000000000f1';
select t_ok('E2 change sample_qty on decided record', $q$update quality_checks set sample_qty=99 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_ok('E3 change ar_number on decided record', $q$update quality_checks set ar_number='AR-HACK' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_ok('E4 change reviewed_by after decision', $q$update quality_checks set reviewed_by='00000000-0000-0000-0000-0000000000a4' where id='00000000-0000-0000-0000-0000000000f1'$q$);
select 'E result: status=' || status || ' sample_qty=' || sample_qty || ' ar=' || ar_number || ' reviewed_by=' || reviewed_by from quality_checks where id='00000000-0000-0000-0000-0000000000f1';
\echo === F: mfr_manager inserts QC record directly
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('F1 inventory_manager inserts a QC row for line e2 already decided?', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status) values ('AR-T9','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.5,'kg','approved')$q$);
select t_ok('F2 inventory_manager inserts QC row already checker_approved', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status) values ('AR-T10','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.5,'kg','checker_approved')$q$);

-- ===== PART 3: section G (release by direct approved insert) =====
\pset footer off
reset role;
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-03/26',50,'kg',0,0,0);
set role authenticated;
\echo === G: inventory_manager (no QC role) releases a fresh batch e3 with no QC at all
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('G1 insert an APPROVED QC row directly', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_by,reviewed_at,retest_period_days,expiry_date) values ('AR-FAKE','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg','approved','00000000-0000-0000-0000-0000000000a5',now(),180,current_date+365)$q$);
select 'G result: batch qc status = ' || coalesce(qc_status,'none') from purchase_batch_status where purchase_line_id='00000000-0000-0000-0000-0000000000e3';

-- ===== PART 4: anonymous callers (section P1-10) =====
set role anon;
select public.get_next_po_number();
select public.get_next_po_number();
select public.get_next_vendor_code();
select public.get_next_coa_number();
select public.get_next_item_code('raw_material');
reset role;

-- ===== PART 5: anonymous callers of helper functions (SCAN-P1-13) =====
\pset footer off
reset role;
insert into items (id, item_code, name, category, unit, item_type_id) values ('00000000-0000-0000-0000-0000000000c9','FP-T0001','Test product','processed',null,null);
select 'before: unit=' || coalesce(unit,'NULL') from items where id='00000000-0000-0000-0000-0000000000c9';
set role anon;
select 'anon runs _item_stock_unit -> ' || coalesce(public._item_stock_unit('00000000-0000-0000-0000-0000000000c9','bogus-unit'),'NULL');
select 'anon runs check_sufficient_stock -> ' ;
select public.check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 9999);
reset role;
select 'after: unit=' || coalesce(unit,'NULL') from items where id='00000000-0000-0000-0000-0000000000c9';

set role anon;
select public._item_stock_unit('00000000-0000-0000-0000-0000000000c9','kg');
reset role;
