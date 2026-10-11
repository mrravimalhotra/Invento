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
-- 0110: yield reason column, tiny leftovers ignored by oldest-first, finished product stock on Ageing.
-- Users: a1 admin, a2 inventory manager (composes), a3 MFR manager, a4 QC checker, a5 QC reviewer.
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c4','RM-T0002','Raw B','raw','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== three batches of Raw A: O (oldest), M, N (newest), all submitted'
select t_ok('PO1 batch O 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','O',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_ok('PO2 batch M 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','M',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$);
select t_ok('PO3 batch N 10 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d3','PO-T3','00000000-0000-0000-0000-0000000000c2','INV-3',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','N',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d3')$q$);
reset role;
update purchase_lines set created_at = now() - interval '3 days' where id='00000000-0000-0000-0000-0000000000e1';
update purchase_lines set created_at = now() - interval '2 days' where id='00000000-0000-0000-0000-0000000000e2';
update purchase_lines set created_at = now() - interval '1 day'  where id='00000000-0000-0000-0000-0000000000e3';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

\echo '===== approve M and N only (O stays un-reviewed)'
select t_ok('QC M + N round 1', $q$
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f2',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0.1,'kg'),('00000000-0000-0000-0000-0000000000f3',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0.1,'kg');
  update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id in ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC M + N approved', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id in ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f3')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR approved (2 kg Raw A)', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

reset role;
-- helper to start a draft FP batch
create or replace function public.t_fp(p_id uuid) returns void language sql security invoker as $$
  insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date)
  select p_id, b.batch_number, b.short_batch_no, m.id, 1, 10, 'kg', current_date
  from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b $$;
grant execute on function public.t_fp(uuid) to authenticated;
create or replace function public.t_comp(p_fp uuid, p_line uuid, p_qty numeric) returns void language sql security invoker as $$
  insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity)
  values (p_fp,'00000000-0000-0000-0000-0000000000c3',p_line,p_qty) $$;
grant execute on function public.t_comp(uuid,uuid,numeric) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== approve O as well; then O is the oldest approved batch'
select t_ok('QC O round 1', $q$
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.1,'kg');
  update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC O approved', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== P5-08: a leftover below 0.0005 kg does not block newer batches'
reset role;
update purchase_lines set live_remaining_qty = 0.0003 where id='00000000-0000-0000-0000-0000000000e1';
update purchase_lines set live_remaining_qty = 0 where id='00000000-0000-0000-0000-0000000000e2';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('start draft 1', $q$select t_fp('00000000-0000-0000-0000-0000000000b1')$q$);
select t_ok('N may be used while O has only 0.0003 kg', $q$select t_comp('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e3',2)$q$);
select t_check('O with 0.0003 kg is not listed on Expiry and Retest Ageing', not exists (select 1 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000e1'));
reset role;
update purchase_lines set live_remaining_qty = 0.001 where id='00000000-0000-0000-0000-0000000000e1';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('start draft 2', $q$select t_fp('00000000-0000-0000-0000-0000000000b2')$q$);
select t_fail('with 0.001 kg left O still blocks N', $q$select t_comp('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e3',2)$q$, 'Oldest stock must be used first');
select t_ok('O itself can be used', $q$select t_comp('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e1',0.001)$q$);

\echo '===== P5-05: yield reason is stored with the batch'
reset role;
select t_ok('yield_reason stored', $q$update finished_product_batches set yield_reason = 'Spillage while filling' where id='00000000-0000-0000-0000-0000000000b1'$q$);
select t_check('yield_reason reads back', (select yield_reason from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1') = 'Spillage while filling');
select t_check('batches without a reason keep it empty', (select yield_reason is null from finished_product_batches where id='00000000-0000-0000-0000-0000000000b2'));

\echo '===== P6-06: finished product "in stock" on Ageing = yield - samples - bulk used by packaging issues'
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('a litre product: MFR approved', $q$
  select create_mfr_definition('Liquid MFR', 100, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic');
  select approve_mfr_definition((select id from mfr_definitions where name='Liquid MFR'))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_ok('two approved 60 L and 10 L batches with their packing', $q$
  insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,status,batch_yield,qc_sample_qty)
   select '00000000-0000-0000-0000-0000000000b8','FP-L1','PR-L1',id,1,60,'ltr','approved',60,1 from mfr_definitions where name='Liquid MFR';
  insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,status,batch_yield)
   select '00000000-0000-0000-0000-0000000000b9','FP-L2','PR-L2',id,1,10,'ltr','approved',10 from mfr_definitions where name='Liquid MFR';
  insert into quality_checks (id,ar_number,finished_product_batch_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,expiry_date)
   select '00000000-0000-0000-0000-0000000000f8','AR-L1',b.id,m.finished_product_item_id,1,'ltr','approved',now(),365,current_date+300 from finished_product_batches b join mfr_definitions m on m.id=b.mfr_definition_id where b.batch_number='FP-L1';
  insert into quality_checks (id,ar_number,finished_product_batch_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,expiry_date)
   select '00000000-0000-0000-0000-0000000000f9','AR-L2',b.id,m.finished_product_item_id,0,'ltr','approved',now(),365,current_date+300 from finished_product_batches b join mfr_definitions m on m.id=b.mfr_definition_id where b.batch_number='FP-L2';
  insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason)
   select 'push', finished_product_item_id, 69, 'ltr', 'fp_yield', 'test stock' from mfr_definitions where name='Liquid MFR';
  insert into packaging_issues (code,finished_product_batch_id,pack_size,pack_size_qty,pack_size_unit,fp_qty_consumed,unit_count,department,transaction_type,issue_date)
   values ('PKG-L1','00000000-0000-0000-0000-0000000000b8','200 ml',200,'ml',20,100,'store','pack',current_date),
          ('PKG-L2','00000000-0000-0000-0000-0000000000b9','500 ml',500,'ml',10,20,'store','pack',current_date)$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('60 L batch, 1 L sample, 100 bottles of 200 ml (20 L) packed: 39 L left (not 0)', (select remaining_qty = 39 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000b8'));
select t_check('fully packed batch stays listed with 0', (select remaining_qty = 0 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000b9'));

\echo '===== access'
select t_check('anon cannot read batch_ageing', not has_table_privilege('anon','public.batch_ageing','select'));
select t_check('signed-in users can', has_table_privilege('authenticated','public.batch_ageing','select'));
