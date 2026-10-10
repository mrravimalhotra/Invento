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

\echo '===== forward from the raw material batch B1'
select t_check('B1 root row, then FP-1 forward', t_tr('purchase','00000000-0000-0000-0000-0000000000e1') like 'root:0:Batch:B1 | %');
select t_check('B1 forward: used in FP-1 (4 kg)', (select quantity from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1') where relation='Used in finished product batch' and depth=1) = 4);
select t_check('B1 forward: FP-1 QC record, COA, packed issue, packing jars', t_trn('purchase','00000000-0000-0000-0000-0000000000e1','QC record') = 1 and t_trn('purchase','00000000-0000-0000-0000-0000000000e1','COA issued') = 1 and t_trn('purchase','00000000-0000-0000-0000-0000000000e1','Packed') = 2 and t_trn('purchase','00000000-0000-0000-0000-0000000000e1','Packing material used') = 1);
select t_check('B1 forward reaches the second finished product batch through the production batch', t_trn('purchase','00000000-0000-0000-0000-0000000000e1','Became production raw material') = 1 and (select count(*) from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1') where relation='Used in finished product batch') = 2);
select t_check('B1 forward shows samples held (1.5 kg)', (select quantity from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1') where relation='Samples held' and depth=1) = 1.5);
select t_check('vendor and invoice are on the root row', (select note from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1') where depth=0) = 'Vendor: Vendor · Invoice INV-1');

\echo '===== backward from FP-2: production batch, its packaging issue, FP-1, then B1'
select t_check('FP-2 backward: production raw material, its issue, FP-1, B1', t_trn('fp','00000000-0000-0000-0000-0000000000b2','Production raw material used') = 1 and t_trn('fp','00000000-0000-0000-0000-0000000000b2','Made in packaging issue') = 1 and t_trn('fp','00000000-0000-0000-0000-0000000000b2','Bulk finished product used') = 1 and t_trn('fp','00000000-0000-0000-0000-0000000000b2','Raw material used') = 1);
select t_check('FP-2 backward ends at B1', (select batch_label from trace_batch('fp','00000000-0000-0000-0000-0000000000b2') where relation='Raw material used') = 'B1');

\echo '===== backward from FP-1 and the production batch'
select t_check('FP-1 backward: B1 4 kg', (select quantity from trace_batch('fp',(select id from finished_product_batches where batch_number='FP-1')) where relation='Raw material used') = 4);
select t_check('production batch backward: issue, FP-1, B1', t_trn('production',(select id from production_issue_batches),'Made in packaging issue') = 1 and t_trn('production',(select id from production_issue_batches),'Raw material used') = 1);
select t_check('production batch forward: used in FP-2', t_trn('production',(select id from production_issue_batches),'Used in finished product batch') = 1);

\echo '===== packaging material batch: forward shows the issue and the finished product batch'
select t_check('jar batch J1 forward: packaging issue PKG-1 and FP-1', t_trn('purchase','00000000-0000-0000-0000-000000000011','Used in packaging issue') = 1 and t_trn('purchase','00000000-0000-0000-0000-000000000011','Packed finished product batch') = 1);

\echo '===== wastage and rejected'
select t_ok('write off 2 kg of B1', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',2,'kg','spill')$q$);
select t_check('wastage row 2 kg', (select quantity from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1') where relation='Written off as wastage') = 2);

\echo '===== guards'
select t_fail('unknown kind refused', $q$select * from trace_batch('vendor','00000000-0000-0000-0000-0000000000e1')$q$, 'Batch kind must be');
select t_check('unknown id returns nothing', (select count(*) from trace_batch('purchase','00000000-0000-0000-0000-00000000ffff')) = 0);
select t_check('anon cannot call it', not has_function_privilege('anon', 'public.trace_batch(text,uuid)', 'execute'));
select t_check('signed-in users can', has_function_privilege('authenticated', 'public.trace_batch(text,uuid)', 'execute'));

\echo '===== loop safety: FP-1 also lists a production batch that came from FP-1 itself'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('FP-1 made from its own production batch (impossible in the app, a loop in the data)', $q$
 insert into finished_product_components (finished_product_batch_id,item_id,production_batch_id,quantity)
   select f.id, p.item_id, p.id, 1 from finished_product_batches f, production_issue_batches p where f.batch_number='FP-1'$q$);
select t_check('trace still finishes, and stays within 200 rows', (select count(*) from trace_batch('fp',(select id from finished_product_batches where batch_number='FP-1'))) between 1 and 200);
select t_check('trace from B1 still finishes', (select count(*) from trace_batch('purchase','00000000-0000-0000-0000-0000000000e1')) between 1 and 200);
