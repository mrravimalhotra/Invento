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
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo '===== ACC-01: repeated submit / reopen cycles'
select t_ok('PO: 100 kg line, samples 1/2/3 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',1,2,3)$q$);
select t_ok('submit 1', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after submit 1: 94', t_oh('00000000-0000-0000-0000-0000000000c3') = 94);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('reopen 1', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after reopen 1: 0', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_ok('submit 2', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after submit 2: 94', t_oh('00000000-0000-0000-0000-0000000000c3') = 94);
select t_ok('reopen 2', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after reopen 2: 0 (was -94 before the fix)', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_ok('edit draft line to 120 kg, submit 3', $q$update purchase_lines set quantity=120 where id='00000000-0000-0000-0000-0000000000e1'; select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after submit 3: 114 (was 0 before the fix)', t_oh('00000000-0000-0000-0000-0000000000c3') = 114);
select t_ok('reopen 3', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after reopen 3: 0', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_ok('submit 4', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after submit 4: 114; batch live remaining 114 and ledger agree', t_oh('00000000-0000-0000-0000-0000000000c3') = 114 and (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-0000000000e1') = 114);
select t_check('sample pulls net = 6 kg outstanding (not double-returned)',
  (select sum(case event_type when 'pull' then quantity else -quantity end) from inventory_ledger where purchase_line_id='00000000-0000-0000-0000-0000000000e1' and reference_type in ('qc_sample','stability_sample','rnd_sample')) = 6);

\echo '===== approve the batch'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',1,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2 approve', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR (batch 10 kg, 2 kg Raw A) approved', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);

\echo '===== ACC-27: reopen refused once a batch has been used'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('FP draft consumes 6 kg of B1', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b1', b.batch_number, b.short_batch_no, m.id, 1, 30, 'kg', current_date from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b; insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',6)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('reopen refused: batch used', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'batch B1 has already been used (6 kg');
select t_check('stock unchanged after refusal: 108', t_oh('00000000-0000-0000-0000-0000000000c3') = 108);
select t_ok('cancel the FP draft (gives the 6 kg back)', $q$update finished_product_batches set status='cancelled' where id='00000000-0000-0000-0000-0000000000b1'$q$);
select t_check('back to 114 after cancel', t_oh('00000000-0000-0000-0000-0000000000c3') = 114);
select t_ok('reopen allowed again after the cancel', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('after reopen: 0 (never negative)', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);

\echo '===== ACC-06: batch on a reopened PO cannot be used'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('QC status still approved on the reopened batch', (select qc_status from purchase_batch_status where purchase_line_id='00000000-0000-0000-0000-0000000000e1') = 'approved');
select t_fail('using the reopened batch is refused', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b2', b.batch_number, b.short_batch_no, m.id, 1, 30, 'kg', current_date from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b; insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',6)$q$, 'isn''t submitted');
select t_check('stock still 0, not -6', t_oh('00000000-0000-0000-0000-0000000000c3') = 0);
select t_ok('submit again', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('back to 114 after re-submit', t_oh('00000000-0000-0000-0000-0000000000c3') = 114);
select t_ok('batch usable again after re-submit', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b3', b.batch_number, b.short_batch_no, m.id, 1, 30, 'kg', current_date from (select id from mfr_definitions where name='Test MFR') m, get_next_fp_batch_number(m.id) b; insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',6)$q$);
select t_check('stock 108', t_oh('00000000-0000-0000-0000-0000000000c3') = 108);

\echo '===== wastage also blocks reopen'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('second PO: 10 kg, submit, write off 1 kg', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B2',10,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2'); select record_wastage('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e2', 1, 'kg', 'spill')$q$);
select t_fail('reopen refused: batch written off', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$, 'batch B2 has already been used (1 kg');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('non-admin cannot reopen', $q$select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'Not authorized');
