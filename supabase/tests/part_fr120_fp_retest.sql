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
-- 0120: finished product retest (SCAN-P4-04).
-- Users: a1 admin, a2 inventory manager, a3 MFR manager, a4 QC checker, a5 QC reviewer.
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('a litre product: MFR approved', $q$
  select create_mfr_definition('Liquid MFR', 100, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic');
  select approve_mfr_definition((select id from mfr_definitions where name='Liquid MFR'))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
create or replace function public.t_fpitem() returns uuid language sql security definer as $$ select finished_product_item_id from mfr_definitions where name='Liquid MFR' $$;
grant execute on function public.t_fpitem() to authenticated;
select t_ok('a 60 L batch (1 L QC, 2 L stability, 1 L R&D samples) completed and waiting for QC', $q$
  insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,status,batch_start_date,batch_yield,finish_date,expiry_month,qc_sample_qty,stability_qty,rnd_qty)
   select '00000000-0000-0000-0000-0000000000b1','FP-R1','PR-R1',id,1,60,'ltr','complete_awaiting_qc',current_date-3,60,current_date-2,current_date+400,1,2,1 from mfr_definitions where name='Liquid MFR'$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

\echo '===== first QC: two rounds, the yield is posted once'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('submitted to QC', $q$select submit_fp_batch_to_qc('00000000-0000-0000-0000-0000000000b1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('round 1', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and not is_retest$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('round 2 approved (retest period 30 days, expiry in 100 days)', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=30, expiry_date=current_date+100 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and not is_retest$q$);
select t_check('batch Approved; On hand = 60 - 1 - 2 - 1 = 56', (select status from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1')='approved' and t_oh(t_fpitem()) = 56);
select t_check('the old one-record-per-batch rule is gone', not exists (select 1 from pg_constraint where conname='quality_checks_fp_batch_unique'));

\echo '===== not due yet'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('retest before the retest date is refused', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 1, 'ltr')$q$, 'has not arrived');
select t_check('the batch is not listed as due', not exists (select 1 from fp_due_for_retest where batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_check('it can be packed', public.fp_batch_block_reason('00000000-0000-0000-0000-0000000000b1') is null);

\echo '===== the retest date arrives'
reset role;
update quality_checks set reviewed_at = now() - interval '40 days' where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_check('listed as due with 2 L stability sample and 56 L bulk', (select stability_reserve_left = 2 and bulk_left = 56 from fp_due_for_retest where batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_check('the block reason names the retest date', public.fp_batch_block_reason('00000000-0000-0000-0000-0000000000b1') like '%past its retest date%');
reset role;
select t_fail('packing a batch past its retest date is refused', $q$insert into packaging_issues (code,finished_product_batch_id,pack_size,pack_size_qty,pack_size_unit,fp_qty_consumed,unit_count,department,transaction_type,issue_date) values ('PKG-X1','00000000-0000-0000-0000-0000000000b1','200 ml',200,'ml',1,5,'store','pack',current_date)$q$, 'past its retest date');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select t_check('bulk left for many batches at once agrees (56 L)', (select bulk_left = 56 from fp_bulk_left_many(array['00000000-0000-0000-0000-0000000000b1'::uuid])));
select t_check('the label search helper reports the batch as blocked', exists (select 1 from fp_batch_block_reasons(array['00000000-0000-0000-0000-0000000000b1'::uuid]) where reason like '%retest date%'));
select t_check('it is not offered on the packaging list', not exists (select 1 from fp_batch_packing_options where id='00000000-0000-0000-0000-0000000000b1'));
select t_fail('a sample bigger than reserve + bulk is refused', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 100, 'ltr')$q$, 'not enough');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('a retest sample of zero is refused', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 0, 'ltr')$q$, 'Enter the retest sample');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_fail('an MFR manager cannot start a retest', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 1, 'ltr')$q$, 'Not authorized');

\echo '===== retest 1: 1.5 L, all from the stability sample'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('start retest 1', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 1.5, 'ltr')$q$);
select t_check('a retest record with an ARFP number, 1.5 L from stability and nothing from bulk', exists (select 1 from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and ar_number like 'ARFP-%' and stability_reserve_used=1.5 and stock_sample_used=0 and status='submitted'));
select t_check('On hand unchanged (56) and no bulk taken', t_oh(t_fpitem()) = 56 and (select retest_sample_qty=0 from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select t_fail('a second retest cannot be started while one is open', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 0.1, 'ltr')$q$, 'not due for retest');
select t_check('the batch is blocked: retest in progress', public.fp_batch_block_reason('00000000-0000-0000-0000-0000000000b1') like '%retest in progress%');
reset role;
select t_fail('packing is refused while the retest is open', $q$insert into packaging_issues (code,finished_product_batch_id,pack_size,pack_size_qty,pack_size_unit,fp_qty_consumed,unit_count,department,transaction_type,issue_date) values ('PKG-X2','00000000-0000-0000-0000-0000000000b1','200 ml',200,'ml',1,5,'store','pack',current_date)$q$, 'retest in progress');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select t_check('no longer listed as due', not exists (select 1 from fp_due_for_retest where batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_check('the samples report shows 0.5 L of stability sample left', (select stability_left = 0.5 from retained_samples where kind='fp' and batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_fail('a second open QC record for the batch is refused by the database', $q$insert into quality_checks (ar_number,finished_product_batch_id,sample_qty,sample_unit) values ('ARFP-DUP/26','00000000-0000-0000-0000-0000000000b1',1,'ltr')$q$, 'quality_checks_fp_batch_pending_unique');

\echo '===== the retest period cannot run past the expiry date'
select t_ok('round 1', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='submitted'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('180-day retest period with the expiry 100 days away is refused', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=180, expiry_date=current_date+100 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='checker_approved'$q$, 'would fall after the expiry date');
select t_ok('60-day period with the same expiry is accepted', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=60, expiry_date=current_date+100 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='checker_approved'$q$);
select t_check('retest approved: batch Approved, the yield is NOT posted again (On hand 56)', (select status from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1')='approved' and t_oh(t_fpitem()) = 56);
select t_check('the new retest date is 60 days away and the batch can be packed', (select retest_date = current_date + 60 from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest) and public.fp_batch_block_reason('00000000-0000-0000-0000-0000000000b1') is null);

\echo '===== retest 2: the stability sample runs out, the rest comes from the bulk'
reset role;
update quality_checks set reviewed_at = now() - interval '70 days' where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('start retest 2 with 2 L (0.5 L stability sample left)', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 2, 'ltr')$q$);
select t_check('1.5 L taken from the bulk: On hand 54.5, retest_sample_qty 1.5', t_oh(t_fpitem()) = 54.5 and (select retest_sample_qty = 1.5 from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select t_check('the retest record shows 0.5 L from stability and 1.5 L from stock', exists (select 1 from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='submitted' and stability_reserve_used=0.5 and stock_sample_used=1.5));
select t_check('the stock movement is recorded as Retest sample', exists (select 1 from inventory_ledger where reference_id='00000000-0000-0000-0000-0000000000b1' and reference_type='qc_sample' and reason='Retest sample' and quantity=1.5));

\echo '===== retest 2 rejected: the bulk leaves On hand; voiding brings it back'
select t_ok('round 1', $q$update quality_checks set status='checker_approved', checker_comments='Fails assay', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"90%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='submitted'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('round 2 rejects', $q$update quality_checks set status='rejected', review_comments='Assay below specification', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='checker_approved'$q$);
select t_check('batch Rejected and the 54.5 L of bulk is out of On hand', (select status from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1')='rejected' and t_oh(t_fpitem()) = 0);
select t_ok('void the rejection', $q$update quality_checks set status='submitted', void_reason='Wrong result entered' where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='rejected'$q$);
select t_check('batch Approved again, bulk back in On hand (54.5)', (select status from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1')='approved' and t_oh(t_fpitem()) = 54.5);

\echo '===== retest 2 approved after the void'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('round 1', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='submitted'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('round 2 approved', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=30, expiry_date=current_date+100 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='checker_approved'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('packing list: 60 - 1 - 2 - 1 - 1.5 = 54.5 L left', (select left_qty = 54.5 from fp_batch_packing_options where id='00000000-0000-0000-0000-0000000000b1'));
reset role;
select t_ok('1 L can be packed', $q$insert into packaging_issues (code,finished_product_batch_id,pack_size,pack_size_qty,pack_size_unit,fp_qty_consumed,unit_count,department,transaction_type,issue_date) values ('PKG-R1','00000000-0000-0000-0000-0000000000b1','200 ml',200,'ml',1,5,'store','pack',current_date)$q$);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
reset role;
select t_fail('more than the bulk left (53.5 L) is refused', $q$insert into packaging_issues (code,finished_product_batch_id,pack_size,pack_size_qty,pack_size_unit,fp_qty_consumed,unit_count,department,transaction_type,issue_date) values ('PKG-R2','00000000-0000-0000-0000-0000000000b1','200 ml',200,'ml',54,5,'store','pack',current_date)$q$, 'Not enough stock');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select t_check('Ageing shows 53.5 L', (select remaining_qty = 53.5 from batch_ageing where batch_id='00000000-0000-0000-0000-0000000000b1'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('stock integrity S7 (ledger On hand = bulk left) finds nothing', (select problems = 0 from stock_integrity_check() where code='S7'));

\echo '===== an expired batch is not retested and cannot be packed'
reset role;
update quality_checks set reviewed_at = now() - interval '90 days', expiry_date = current_date - 1 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1' and is_retest and status='approved';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('retest refused: expired', $q$select start_fp_retest('00000000-0000-0000-0000-0000000000b1', 0.1, 'ltr')$q$, 'expired on');
select t_check('the expired batch is not listed as due', not exists (select 1 from fp_due_for_retest where batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_check('the block reason says expired', public.fp_batch_block_reason('00000000-0000-0000-0000-0000000000b1') like '%expired on%');

\echo '===== the same rule for raw material'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('a 10 kg raw material batch in QC', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','O',10,'kg',0.1,0.1,0.1); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.1,'kg'); update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('raw material: retest period 100 days with the expiry 50 days away is refused', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=100, expiry_date=current_date+50 where id='00000000-0000-0000-0000-0000000000f1'$q$, 'would fall after the expiry date');
select t_ok('raw material: 40 days is accepted', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=40, expiry_date=current_date+50 where id='00000000-0000-0000-0000-0000000000f1'$q$);

\echo '===== opening stock: the retest cycle carried over'
reset role;
create or replace function public.t_load(p_rows text) returns text language plpgsql as $$
declare r record; begin select * into r from public.load_opening_finished_product(p_rows::jsonb); return r.load_no; end $$;
grant execute on function public.t_load(text) to authenticated;
create or replace function public.t_row(p_batch text, p_extra text) returns text language sql security definer as $$
  select '[{"item_id":"' || public.t_fpitem() || '","batch_number":"' || p_batch || '","manufacture_date":"' || (current_date - 200) || '","expiry_date":"' || (current_date + 200) || '","bulk_qty":10,"old_ar":"AR/OLD/' || p_batch || '","approval_date":"' || (current_date - 100) || '"' || p_extra || '}]' $$;
grant execute on function public.t_row(text, text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('3 retests done and still a retest date is refused', $q$select t_load(t_row('OLD-1', ',"retests_done":3,"retest_date":"' || (current_date - 1) || '"'))$q$, 'no further retest date');
select t_fail('4 retests done is refused', $q$select t_load(t_row('OLD-1', ',"retests_done":4'))$q$, '0 to 3');
select t_fail('a retest date before the approval date is refused', $q$select t_load(t_row('OLD-1', ',"retest_date":"' || (current_date - 150) || '"'))$q$, 'after the QC approval date');
select t_fail('a retest date after the expiry date is refused', $q$select t_load(t_row('OLD-1', ',"retest_date":"' || (current_date + 300) || '"'))$q$, 'after the expiry date');
select t_ok('a batch approved 100 days ago, 2 retests done, retest date yesterday', $q$select t_load(t_row('OLD-1', ',"retests_done":2,"retest_date":"' || (current_date - 1) || '"'))$q$);
select t_check('the old retests are kept on its QC record', exists (select 1 from quality_checks q join finished_product_batches b on b.id=q.finished_product_batch_id where b.batch_number='OLD-1' and q.is_legacy and q.legacy_retests_done=2 and q.retest_date = current_date - 1));
select t_check('it is listed as due for retest', exists (select 1 from fp_due_for_retest d join finished_product_batches b on b.id=d.batch_id where b.batch_number='OLD-1'));
select t_ok('a batch with no retest date (not due) and no retests done loads as before', $q$select t_load(t_row('OLD-2', ''))$q$);
select t_check('it is not due and not blocked', not exists (select 1 from fp_due_for_retest d join finished_product_batches b on b.id=d.batch_id where b.batch_number='OLD-2') and (select fp_batch_block_reason(id) is null from finished_product_batches where batch_number='OLD-2'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('retest of the loaded batch: no stability sample, the 1 L comes from the bulk', $q$select start_fp_retest((select id from finished_product_batches where batch_number='OLD-1'), 1, 'ltr')$q$);
select t_check('retest_sample_qty is 1 and the record shows 1 L from stock', (select retest_sample_qty = 1 from finished_product_batches where batch_number='OLD-1') and exists (select 1 from quality_checks q join finished_product_batches b on b.id=q.finished_product_batch_id where b.batch_number='OLD-1' and q.is_retest and q.stock_sample_used=1 and q.stability_reserve_used=0));
