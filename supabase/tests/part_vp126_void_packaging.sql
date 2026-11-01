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
create or replace function public.t_problems() returns int language sql security definer as $$
  select coalesce(sum(problems), 0)::int from public.stock_integrity_check() $$;
create or replace function public.t_bulk(p_no text) returns numeric language sql security definer as $$
  select public.fp_bulk_left(id) from finished_product_batches where batch_number = p_no $$;
create or replace function public.t_parts_ok(p uuid) returns boolean language sql security definer as $$
  select coalesce((select on_hand = received + yielded - held_qc - held_stability - held_rnd - consumed_by_fp - issued_packaging
         - wastage - consumed_by_packaging + packaged_yield - issued_store - issued_rnd + production_rm_yield - rejected
         from item_position where item_id = p), true) $$;
grant execute on function public.t_problems(), public.t_bulk(text), public.t_parts_ok(uuid) to authenticated;

reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
-- Remember the figures before any void.
create table t_before as select
  (select t_bulk('FP-1')) as bulk,
  (select live_remaining_qty from purchase_lines where id = '00000000-0000-0000-0000-000000000011') as jars_left,
  (select packaged_qty from finished_product_batches where batch_number = 'FP-1') as packed,
  (select t_oh(finished_product_item_id) from mfr_definitions where name = 'Test MFR') as fp_oh,
  (select t_oh('00000000-0000-0000-0000-0000000000c5')) as jars_oh;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
create table t_prob as select t_problems() as n;
select set_config('request.jwt.claim.sub','',false);
grant select on t_before, t_prob to authenticated;
-- A QC record started on the production batch (open, Round 1 pending).
insert into quality_checks (id,ar_number,production_batch_id,item_id,sample_qty,sample_unit)
  select '00000000-0000-0000-0000-0000000000f9','AR-PB-V',id,item_id,0,'kg' from production_issue_batches;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

\echo '===== 0126: who may void, and the reason'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_fail('an MFR Manager cannot void', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-1'), 'Wrong pack size')$q$, 'Only an Inventory Manager or System Administrator');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('a reason under 3 characters is refused', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-1'), ' x ')$q$, 'at least 3 characters');
update packaging_issues set voided_at = now(), active = false where code='PKG-1';
select t_check('editing the table directly changes nothing', (select voided_at is null and active from packaging_issues where code='PKG-1'));

\echo '===== 0126: void a Store issue'
select t_ok('Inventory Manager voids PKG-1 (Store, 5 x 1 kg, 10 jars)', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-1'), 'Wrong pack size entered')$q$);
select t_check('PKG-1 is marked void with who, when and why', (select voided_at is not null and voided_by = '00000000-0000-0000-0000-0000000000a2' and void_reason = 'Wrong pack size entered' and not active from packaging_issues where code='PKG-1'));
select t_check('its bulk used moved to voided_fp_qty (5) and no longer counts', (select fp_qty_consumed is null and voided_fp_qty = 5 from packaging_issues where code='PKG-1'));
select t_check('5 kg of bulk is back on FP-1', t_bulk('FP-1') = (select bulk from t_before) + 5);
select t_check('the 10 jars are back on their purchase batch', (select live_remaining_qty from purchase_lines where id = '00000000-0000-0000-0000-000000000011') = (select jars_left from t_before) + 10);
select t_check('jars on hand are back up by 10', t_oh('00000000-0000-0000-0000-0000000000c5') = (select jars_oh from t_before) + 10);
select t_check('finished product on hand is back up by 5 kg', (select t_oh(finished_product_item_id) from mfr_definitions where name='Test MFR') = (select fp_oh from t_before) + 5);
select t_check('the packed count on FP-1 went down by 5', (select packaged_qty from finished_product_batches where batch_number='FP-1') = (select packed from t_before) - 5);
select t_check('one opposite ledger row per original row, each with the reason', (select count(*) from inventory_ledger where reason like 'Void of PKG-1: %') = (select count(*) from inventory_ledger where reference_id = (select id from packaging_issues where code='PKG-1') and coalesce(reason,'') not like 'Void of%'));
select t_check('Stock Position parts still add up for the finished product, packaged item and jars',
  (select t_parts_ok(finished_product_item_id) and t_parts_ok((select packaged_item_id from items where id = finished_product_item_id)) from mfr_definitions where name='Test MFR')
  and t_parts_ok('00000000-0000-0000-0000-0000000000c5'));
select t_fail('voiding it again is refused', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-1'), 'Again')$q$, 'already void');
select t_check('Batch Trace from FP-1 no longer lists PKG-1', not exists (select 1 from trace_batch('fp',(select id from finished_product_batches where batch_number='FP-1')) where ref_code = 'PKG-1'));
select t_check('Batch Trace from the jar batch no longer lists PKG-1', not exists (select 1 from trace_batch('purchase','00000000-0000-0000-0000-000000000011') where ref_code = 'PKG-1'));

\echo '===== 0126: void a Production issue whose RM-FP batch is unused'
reset role;
select t_fail('a QC record cannot be set to voided directly', $q$update quality_checks set status='voided' where id='00000000-0000-0000-0000-0000000000f9'$q$, 'only be voided together');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('System Admin voids the 6 kg Production issue', $q$select void_packaging_issue((select pi.id from packaging_issues pi join production_issue_batches pb on pb.packaging_issue_id = pi.id limit 1), 'Issued the wrong batch')$q$);
select t_check('its RM-FP batch left stock (inactive, nothing remaining)', (select not active and live_remaining_qty = 0 from production_issue_batches limit 1));
select t_check('the RM-FP item has nothing on hand', (select t_oh(item_id) from production_issue_batches limit 1) = 0);
select t_check('its open QC record is now voided, with the reason', (select status = 'voided' and void_reason like 'Void of %: Issued the wrong batch' from quality_checks where id='00000000-0000-0000-0000-0000000000f9'));
select t_check('all 11 kg of bulk is back on FP-1', t_bulk('FP-1') = (select bulk from t_before) + 11);
select t_check('Stock Position parts add up for the RM-FP item', (select t_parts_ok(item_id) from production_issue_batches limit 1));
select t_fail('a voided QC record cannot change again', $q$update quality_checks set status='approved', review_comments='late' where id='00000000-0000-0000-0000-0000000000f9'$q$, 'voided with its packaging issue');
select t_check('Stock Integrity Check finds no more problems than before the voids', t_problems() <= (select n from t_prob));

\echo '===== 0126: a Production issue whose RM-FP batch was used cannot be voided'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('a second Production issue: 2 kg of FP-1', $q$select create_production_issues(jsonb_build_object('issue_date', to_char((now() at time zone 'Asia/Kolkata')::date,'YYYY-MM-DD')), jsonb_build_array(jsonb_build_object('finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','2 kg','fp_qty_consumed',2,'unit_count',2,'qc_qty',0,'stability_qty',0,'rnd_qty',0)))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
insert into finished_product_batches (id, batch_number, short_batch_no, mfr_definition_id, mfr_version, target_qty, unit, status, batch_yield)
  select '00000000-0000-0000-0000-0000000000b9','FP-9','PR-9',mfr_definition_id,1,10,'kg','approved',10 from finished_product_batches where batch_number='FP-1';
insert into quality_checks (id,ar_number,production_batch_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days)
  select '00000000-0000-0000-0000-0000000000fa','AR-PB-U',id,item_id,0,'kg','approved',now(),365 from production_issue_batches where active;
insert into finished_product_components (finished_product_batch_id,item_id,production_batch_id,quantity)
  select '00000000-0000-0000-0000-0000000000b9', item_id, id, 1 from production_issue_batches where active;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('voiding it is refused and names the batch', $q$select void_packaging_issue((select packaging_issue_id from production_issue_batches where active limit 1), 'Too late')$q$, 'has already been used. Nothing was changed.');
select t_check('nothing changed on that issue', (select voided_at is null and active from packaging_issues where id = (select packaging_issue_id from production_issue_batches where active limit 1)));
