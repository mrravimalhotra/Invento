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
create or replace function public.t_oh(p uuid) returns numeric language sql security definer as $$ select coalesce((select on_hand from stock_balance where item_id=p),0) $$;
grant execute on function public.t_oh(uuid) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1');


set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== set-up: raw batch B1 (100 kg, approved), jars J1 (50), MFR, FP-1 (20 kg, 4 kg of B1)'
select t_ok('POs: RM B1 100 kg, jars J1 50', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',1,0.5,0);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c5','J1',50,'nos',0,0,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC approve B1 (round 1)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR 10 kg batch (2 kg Raw A), approved', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('FP-1 20 kg with 4 kg B1', $q$select create_finished_product_batch(jsonb_build_object('batch_number','FP-1','short_batch_no','PR-1','mfr_definition_id',(select id from mfr_definitions where name='Test MFR'),'mfr_version',1,'target_qty',20,'unit','kg','batch_start_date',current_date::text), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c3','purchase_line_id','00000000-0000-0000-0000-0000000000e1','quantity',4,'unit','kg')))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('FP-1 approved, yield 20 kg, 0.5 kg QC sample; QC record and COA', $q$
 update finished_product_batches set status='approved', batch_yield=20, qc_sample_qty=0.5, stability_qty=0, rnd_qty=0 where batch_number='FP-1';
 insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason) select 'push', finished_product_item_id, 19.5, 'kg', 'fp_yield', 'test stock' from mfr_definitions where name='Test MFR';
 insert into quality_checks (id,ar_number,finished_product_batch_id,item_id,sample_qty,sample_unit,status,reviewed_at) select '00000000-0000-0000-0000-0000000000f2','AR-FP1',f.id,m.finished_product_item_id,0.5,'kg','approved',now() from finished_product_batches f join mfr_definitions m on m.id=f.mfr_definition_id where f.batch_number='FP-1';
 insert into coa_records (coa_number,quality_check_id,finished_product_batch_id) select 'COA-1','00000000-0000-0000-0000-0000000000f2',id from finished_product_batches where batch_number='FP-1'$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('Store packaging issue: 5 x 1 kg with 10 jars', $q$select create_packaging_issue(jsonb_build_object('code','PKG-1','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',5,'unit_count',5,'department','store'), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c5','quantity',10,'unit','nos')))$q$);
select t_ok('Production issue: 6 kg of FP-1', $q$select create_production_issues(jsonb_build_object('issue_date', to_char((now() at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD')), jsonb_build_array(jsonb_build_object('finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','6 kg','fp_qty_consumed',6,'unit_count',6,'qc_qty',0,'stability_qty',0,'rnd_qty',0)))$q$);
select t_check('a production raw material batch exists', (select count(*) from production_issue_batches) = 1);

reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('FP-2 (second finished product batch) used 3 kg of that production batch', $q$
 insert into quality_checks (id,ar_number,production_batch_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days) select '00000000-0000-0000-0000-0000000000f3','AR-PB1',id,item_id,0,'kg','approved',now(),365 from production_issue_batches;
 insert into finished_product_batches (id, batch_number, short_batch_no, mfr_definition_id, mfr_version, target_qty, unit, status, batch_yield)
   select '00000000-0000-0000-0000-0000000000b2','FP-2','PR-2',mfr_definition_id,1,10,'kg','approved',10 from finished_product_batches where batch_number='FP-1';
 insert into finished_product_components (finished_product_batch_id,item_id,production_batch_id,quantity)
   select '00000000-0000-0000-0000-0000000000b2', item_id, id, 3 from production_issue_batches$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);


\echo '===== extra batches: B2 rejected, B3 fully written off'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('give B1 and FP-1 an expiry date', $q$
  update quality_checks set expiry_date = current_date + 200 where id in ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2')$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('POs: B2 20 kg, B3 10 kg', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B2',20,'kg',0,0,0),('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B3',10,'kg',0,0,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$);
select t_ok('B3 written off completely', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e3',10,'kg','spill')$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('QC records: B2 rejected, B3 approved', $q$
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,expiry_date) values
   ('00000000-0000-0000-0000-0000000000f4','AR-B2','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0,'kg','rejected',now(),null,null),
   ('00000000-0000-0000-0000-0000000000f5','AR-B3','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now(),365,current_date + 100)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;

\echo '===== batch_ageing'
select t_check('B1 is listed with its retest and expiry dates and what is left', (select retest_date is not null and expiry_date = current_date + 200 and remaining_qty = (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-0000000000e1') and ar_number is not null from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000e1' and kind='raw'));
select t_check('rejected B2 is not listed', not exists (select 1 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000e2'));
select t_check('B3, approved but nothing left, is not listed', not exists (select 1 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000e3'));
select t_check('packaging (jars) are never listed', not exists (select 1 from batch_ageing where item_code = 'PK-T0001'));
select t_check('FP-1 listed with bulk left = yield 20 - samples 0.5 - packed', (select remaining_qty = 20 - 0.5 - (select packaged_qty from finished_product_batches where batch_number='FP-1') and expiry_date = current_date + 200 and kind='fp' from batch_ageing where batch_id=(select id from finished_product_batches where batch_number='FP-1')));
select t_check('FP-2 has no approved QC: not listed', not exists (select 1 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000b2'));
select t_check('production raw material batch is listed with what is left', (select remaining_qty = (select live_remaining_qty from production_issue_batches) and kind='production_raw' from batch_ageing where batch_id=(select id from production_issue_batches)));
select t_check('item name and code come with the row', (select item_code = 'RM-T0001' and item_name = 'Raw A' from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000e1'));

\echo '===== retained_samples'
select t_check('B1: QC 1, Stability 0.5, R&D 0, reserve left 0.5', (select qc_qty = 1 and stability_qty = 0.5 and rnd_qty = 0 and stability_left = 0.5 from retained_samples where batch_id='00000000-0000-0000-0000-0000000000e1'));
select t_check('B1 carries its QC status and expiry', (select qc_status = 'approved' and expiry_date = current_date + 200 from retained_samples where batch_id='00000000-0000-0000-0000-0000000000e1'));
select t_check('FP-1: QC sample 0.5 kept', (select qc_qty = 0.5 and kind = 'fp' and qc_status = 'approved' from retained_samples where batch_id=(select id from finished_product_batches where batch_number='FP-1')));
select t_check('batches with no sample taken are not listed (B2, jars, FP-2, production batch)', not exists (select 1 from retained_samples where batch_id in ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000b2') or kind = 'production_raw'));

\echo '===== access'
select t_check('anon cannot read the views', not has_table_privilege('anon','public.batch_ageing','select') and not has_table_privilege('anon','public.retained_samples','select'));
select t_check('signed-in users can', has_table_privilege('authenticated','public.batch_ageing','select') and has_table_privilege('authenticated','public.retained_samples','select'));
