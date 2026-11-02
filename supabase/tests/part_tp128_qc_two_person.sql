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


create or replace function public.t_tr(p_kind text, p_id uuid) returns text language sql as $$
  select coalesce(string_agg(format('%s:%s:%s:%s', direction, depth, relation, coalesce(batch_label, ref_code, '')), ' | '), '') from public.trace_batch(p_kind, p_id) $$;
grant execute on function public.t_tr(text, uuid) to authenticated;
create or replace function public.t_trn(p_kind text, p_id uuid, p_rel text) returns bigint language sql as $$
  select count(*) from public.trace_batch(p_kind, p_id) where relation = p_rel $$;
grant execute on function public.t_trn(text, uuid, text) to authenticated;

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
select t_ok('QC approve B1 (round 1)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg'); update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
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
-- a6 holds both QC roles; three new Awaiting QC records on batch B1.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a6','both@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a6','quality_checker'),('00000000-0000-0000-0000-0000000000a6','qc_reviewer');
-- Three more raw material batches on a second order, so each test record has its own batch.
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d7','PO-T7','00000000-0000-0000-0000-0000000000c2','INV-7',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct)
  select v.id::uuid,'00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000c3',v.b,10,'kg',0,0,0,1,0
    from (values ('00000000-0000-0000-0000-0000000000e7','B7'),('00000000-0000-0000-0000-0000000000e8','B8'),('00000000-0000-0000-0000-0000000000e9','B9'),('00000000-0000-0000-0000-0000000000ea','B10')) v(id, b);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select submit_purchase_order('00000000-0000-0000-0000-0000000000d7');
select set_config('request.jwt.claim.sub','',false);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit)
  select v.id::uuid, v.ar, v.line::uuid, '00000000-0000-0000-0000-0000000000c3', 0, 'kg'
    from (values ('00000000-0000-0000-0000-0000000000a7','AR-T7','00000000-0000-0000-0000-0000000000e7'),
                 ('00000000-0000-0000-0000-0000000000a8','AR-T8','00000000-0000-0000-0000-0000000000e8'),
                 ('00000000-0000-0000-0000-0000000000a9','AR-T9','00000000-0000-0000-0000-0000000000e9')) v(id, ar, line);
create or replace function public.t_r1(p uuid, p_by uuid) returns void language plpgsql as $$
begin
  update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_by=p_by, checker_at=now(),
         checker_results='[{"seq":1,"test":"Assay","specification":"NLT 90%","result":"95%"}]'::jsonb where id = p;
end $$;
grant execute on function public.t_r1(uuid,uuid) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

\echo '===== 0128 (1): one person cannot make both QC decisions'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select t_ok('a6 makes Round 1 on AR-T7 but sends a colleague as checker_by', $q$select t_r1('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a4')$q$);
select t_check('the database recorded a6 as the Round 1 decider, not the colleague', (select checker_by = '00000000-0000-0000-0000-0000000000a6' from quality_checks where id='00000000-0000-0000-0000-0000000000a7'));
select t_fail('a6 cannot then make Round 2 by sending checker_by = null', $q$update quality_checks set status='approved', checker_by=null, review_comments='Final ok', expiry_date=current_date+300, retest_period_days=90 where id='00000000-0000-0000-0000-0000000000a7'$q$, 'different person');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('a4 makes Round 1 on AR-T8', $q$select t_r1('00000000-0000-0000-0000-0000000000a8','00000000-0000-0000-0000-0000000000a4')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select t_ok('a6 makes Round 2 on AR-T8 while sending checker_by = null', $q$update quality_checks set status='approved', checker_by=null, review_comments='Final ok', expiry_date=current_date+300, retest_period_days=90 where id='00000000-0000-0000-0000-0000000000a8'$q$);
select t_check('Round 1 decider stays a4 and Round 2 is recorded as a6', (select checker_by = '00000000-0000-0000-0000-0000000000a4' and reviewed_by = '00000000-0000-0000-0000-0000000000a6' and reviewed_at is not null from quality_checks where id='00000000-0000-0000-0000-0000000000a8'));
select t_fail('who decided cannot be changed afterwards', $q$update quality_checks set checker_by='00000000-0000-0000-0000-0000000000a5' where id='00000000-0000-0000-0000-0000000000a8'$q$, 'cannot be changed');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('System Admin may still make both rounds (exempt)', $q$select t_r1('00000000-0000-0000-0000-0000000000a9', null); update quality_checks set status='approved', review_comments='Final ok', expiry_date=current_date+300, retest_period_days=90 where id='00000000-0000-0000-0000-0000000000a9'$q$);

\echo '===== 0128 (2): a QC record cannot be created already decided'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('inserting a record already Approved is refused', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status) values ('AR-X1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg','approved')$q$, 'starts as Awaiting QC');
select t_fail('inserting a record at Round 1 approved is refused', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,checker_comments) values ('AR-X2','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg','checker_approved','ok ok')$q$, 'starts as Awaiting QC');
select t_fail('inserting an Awaiting QC record with results filled in is refused', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,checker_results) values ('AR-X3','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg','[]'::jsonb)$q$, 'starts as Awaiting QC');
select t_ok('a plain Awaiting QC record can still be created', $q$insert into quality_checks (ar_number,purchase_line_id,item_id,sample_qty,sample_unit,is_retest) values ('AR-X4','00000000-0000-0000-0000-0000000000ea','00000000-0000-0000-0000-0000000000c3',0,'kg',false)$q$);
