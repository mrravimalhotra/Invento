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
create or replace function public.t_ss(p_item uuid) returns table(packaging numeric, samples numeric, produced numeric, other_in numeric, other_out numeric)
  language sql security definer as $$
  select s.packaging, s.samples, s.produced, s.other_in, s.other_out
    from public.stock_statement((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date) s where s.item_id = p_item $$;
grant execute on function public.t_ss(uuid) to authenticated;
-- A QC record started on the production batch, so the void has one to mark.
insert into quality_checks (id,ar_number,production_batch_id,item_id,sample_qty,sample_unit)
  select '00000000-0000-0000-0000-0000000000f9','AR-PB-V',id,item_id,0,'kg' from production_issue_batches;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== 0127 (3): the Stock Statement nets a void inside its own columns'
select t_ok('void PKG-1 (Store, 10 jars, 5 kg bulk)', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-1'), 'Wrong pack size')$q$);
select t_check('jars: Packaging is 0 and Other in is 0 for today', (select packaging = 0 and other_in = 0 from t_ss('00000000-0000-0000-0000-0000000000c5')));
select t_check('packaged item: nothing produced or moved out today (it nets to zero, so it is not listed)', coalesce((select produced = 0 and other_out = 0 from t_ss((select packaged_item_id from items where id = (select finished_product_item_id from mfr_definitions where name='Test MFR')))), true));

\echo '===== 0127 (1, 5, 6): Production void keeps QC history and tags each batch'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('void the Production issue', $q$select void_packaging_issue((select packaging_issue_id from production_issue_batches limit 1), 'Issued the wrong batch')$q$);
select t_check('the QC record is voided but keeps its own void fields (none before)', (select status = 'voided' and void_reason is null and voided_at is null from quality_checks where id='00000000-0000-0000-0000-0000000000f9'));
select t_check('decision history has the void: who, and the reason', (select count(*) = 1 from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f9' and event='voided_with_issue' and decided_by='00000000-0000-0000-0000-0000000000a1' and reason like 'Void of %: Issued the wrong batch'));
select t_check('the RM yield reversal is booked against the RM-FP batch', (select count(*) = 1 from inventory_ledger where reference_type='production_rm_yield' and event_type='pull' and production_batch_id is not null));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a new QC record on the voided RM-FP batch is refused', $q$insert into quality_checks (ar_number,production_batch_id,item_id,sample_qty,sample_unit) select 'AR-PB-X',id,item_id,0,'kg' from production_issue_batches limit 1$q$, 'takes no QC');

\echo '===== 0127 (2): material returned to a batch QC has since rejected stays out'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('a new Store issue PKG-2 with 10 jars', $q$select create_packaging_issue(jsonb_build_object('code','PKG-2','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',2,'unit_count',2,'department','store'), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c5','quantity',10,'unit','nos')))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at)
  values ('00000000-0000-0000-0000-0000000000fb','AR-J1','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000c5',0,'nos','rejected',now());
create table t_j as select t_oh('00000000-0000-0000-0000-0000000000c5') as oh,
  (select rejected from item_position where item_id='00000000-0000-0000-0000-0000000000c5') as rej;
grant select on t_j to authenticated;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('void PKG-2', $q$select void_packaging_issue((select id from packaging_issues where code='PKG-2'), 'Packed by mistake')$q$);
select t_check('jars on hand do not go up (the returned 10 stay rejected)', t_oh('00000000-0000-0000-0000-0000000000c5') = (select oh from t_j));
select t_check('the rejected figure for jars goes up by 10', (select rejected from item_position where item_id='00000000-0000-0000-0000-0000000000c5') = (select rej from t_j) + 10);
