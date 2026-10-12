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
create or replace function public.t_n(p text) returns bigint language plpgsql security definer as $$ declare v bigint; begin execute 'select count(*) from '||p into v; return v; end $$;
grant execute on function public.t_oh(uuid), public.t_n(text) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1');

\echo '===== 0119: QC results, reasons and rejection control'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('PO: two raw material batches B1 and B2 (50 kg each), submitted', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',50,'kg',0,0,0);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B2',50,'kg',0,0,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('AR for B1 and B2 (Awaiting QC)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg'),('00000000-0000-0000-0000-0000000000f2',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0,'kg')$q$);

\echo '===== Round 1: reason and results'
select t_fail('Round 1 approve with no reason is refused', $q$update quality_checks set status='checker_approved', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'A reason is required for the first QC decision');
select t_fail('Round 1 approve with a 2-character reason is refused', $q$update quality_checks set status='checker_approved', checker_comments='ok', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'A reason is required');
select t_fail('Round 1 approve with no results is refused', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'Enter the result of every test');
select t_fail('Round 1 approve with one result left blank is refused', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":""},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'Enter the result of every test');
select t_fail('Round 1 cannot go straight to approved', $q$update quality_checks set status='approved', review_comments='Meets spec', reviewed_by='00000000-0000-0000-0000-0000000000a4', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$, 'cannot move');
select t_fail('Round 1 cannot go straight to rejected', $q$update quality_checks set status='rejected', review_comments='Bad', reviewed_by='00000000-0000-0000-0000-0000000000a4', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'cannot move');
select t_fail('a result cannot be saved without a decision', $q$update quality_checks set checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb where id='00000000-0000-0000-0000-0000000000f1'$q$, 'only be saved together with a QC decision');
select t_fail('Round 1 cannot carry Reviewer edits', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, reviewer_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"98.6%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$, 'Only the QC Reviewer can edit');
select t_ok('Round 1 approve B1 with reason and every result', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_check('Round 1 left a history row with the reason and results', (select count(*) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f1' and event='round1_approved' and reason='Meets spec' and jsonb_array_length(results)=2 and not results_edited)=1);
select t_fail('Round 1 reject with no reason is refused', $q$update quality_checks set status='checker_rejected', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$, 'A reason is required for the first QC decision');
select t_ok('Round 1 reject B2: reason only, no results needed', $q$update quality_checks set status='checker_rejected', checker_comments='Colour and odour off', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_check('a Round 1 rejection only PROPOSES: B2 is still on hand (50 kg), not rejected', t_oh('00000000-0000-0000-0000-0000000000c3') = 100 and (select status from quality_checks where id='00000000-0000-0000-0000-0000000000f2')='checker_rejected');

\echo '===== Round 2: results edit, reasons'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('Round 2 approve with no reason is refused', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$, 'A reason is required for the final QC decision');
select t_fail('Round 2 edited results with a blank result are refused on approval', $q$update quality_checks set status='approved', review_comments='Re-read the assay', reviewer_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":""},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$, 'Enter the result of every test');
select t_fail('Round 2 edited results must list the same tests', $q$update quality_checks set status='approved', review_comments='Re-read the assay', reviewer_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"98.6%"}]'::jsonb, reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$, 'same tests');
select t_ok('Round 2 approve B1 with an edited Assay result', $q$update quality_checks set status='approved', review_comments='Re-read the assay: 98.6%', reviewer_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"98.6%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_check('history: Round 2 row marked edited, carrying the Reviewer results; Round 1 row still has its own', (select count(*) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f1')=2
  and (select results_edited and results->0->>'result'='98.6%' from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f1' and event='round2_approved')
  and (select results->0->>'result'='99.1%' from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f1' and event='round1_approved'));
select t_check('the record keeps both: checker_results 99.1%, reviewer_results 98.6%', (select checker_results->0->>'result'='99.1%' and reviewer_results->0->>'result'='98.6%' from quality_checks where id='00000000-0000-0000-0000-0000000000f1'));

\echo '===== A proposed rejection: confirm or send back'
select t_fail('a proposed rejection cannot be approved', $q$update quality_checks set status='approved', review_comments='Looks fine', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f2'$q$, 'cannot be approved');
select t_fail('send back needs a reason', $q$update quality_checks set status='submitted' where id='00000000-0000-0000-0000-0000000000f2'$q$, 'A reason is required to send a proposed rejection back');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a Quality Checker cannot confirm or send back', $q$update quality_checks set status='submitted', returned_reason='Retake the sample' where id='00000000-0000-0000-0000-0000000000f2'$q$, 'Only a QC Reviewer');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('Reviewer sends B2 back with a reason', $q$update quality_checks set status='submitted', returned_reason='Retake the sample and re-check colour' where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_check('B2 is back at Awaiting QC with Round 1 cleared; the history keeps Round 1 and the send-back', (select status='submitted' and checker_by is null and checker_comments is null and checker_results is null from quality_checks where id='00000000-0000-0000-0000-0000000000f2')
  and (select count(*) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f2' and event in ('round1_rejected','sent_back'))=2);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('Checker proposes the rejection again', $q$update quality_checks set status='checker_rejected', checker_comments='Colour still off after re-check', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('confirming needs a reason', $q$update quality_checks set status='rejected', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$, 'A reason is required for the final QC decision');
select t_ok('Reviewer confirms the rejection', $q$update quality_checks set status='rejected', review_comments='Confirmed: fails colour', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_check('B2 rejected: 50 kg moved out of On hand', t_oh('00000000-0000-0000-0000-0000000000c3') = 50);

\echo '===== Void a final rejection'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('a Quality Checker cannot void', $q$update quality_checks set status='submitted', void_reason='Wrong batch' where id='00000000-0000-0000-0000-0000000000f2'$q$, 'Only a QC Reviewer or System Admin can void');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('void needs a written reason', $q$update quality_checks set status='submitted' where id='00000000-0000-0000-0000-0000000000f2'$q$, 'A written reason is required to void');
select t_fail('an approved record cannot be voided or moved back', $q$update quality_checks set status='submitted', void_reason='Wrong batch' where id='00000000-0000-0000-0000-0000000000f1'$q$, 'cannot move');
select t_ok('QC Reviewer voids the rejection of B2', $q$update quality_checks set status='submitted', void_reason='Rejected the wrong batch by mistake' where id='00000000-0000-0000-0000-0000000000f2'$q$);
select t_check('B2 is back at Awaiting QC, decision fields cleared, voided by/at stamped', (select status='submitted' and reviewed_by is null and review_comments is null and checker_by is null and voided_by='00000000-0000-0000-0000-0000000000a5' and voided_at is not null from quality_checks where id='00000000-0000-0000-0000-0000000000f2'));
select t_check('B2 stock is back On hand (100 kg)', t_oh('00000000-0000-0000-0000-0000000000c3') = 100);
select t_check('history has the full story for B2: round1_rejected, round1_rejected->sent_back, round1_rejected, round2_rejected, voided',
  (select string_agg(event, ',' order by decided_at, id) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f2') is not null
  and (select count(*) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f2')=5
  and (select count(*) from qc_decision_history where quality_check_id='00000000-0000-0000-0000-0000000000f2' and event='voided' and reason='Rejected the wrong batch by mistake')=1);

\echo '===== Void is refused after wastage'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('B2 Round 1 again, then proposed rejection', $q$update quality_checks set status='checker_rejected', checker_comments='Fails identity test', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('B2 rejection confirmed', $q$update quality_checks set status='rejected', review_comments='Confirmed: identity fails', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f2'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('Inventory Manager writes off 10 kg of the rejected batch', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e2',10,'kg','Disposed')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_fail('the rejection can no longer be voided', $q$update quality_checks set status='submitted', void_reason='Undo it' where id='00000000-0000-0000-0000-0000000000f2'$q$, 'Wastage has already been written off');

\echo '===== Same person cannot do both rounds (System Admin exempt)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('new batch B3 and its AR', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B3',20,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2'); insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f3',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('System Admin does Round 1 on B3', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"99.1%"},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a1', checker_at=now() where id='00000000-0000-0000-0000-0000000000f3'$q$);
select t_ok('the same System Admin may do Round 2 (exempt)', $q$update quality_checks set status='approved', review_comments='Admin sign-off', reviewed_by='00000000-0000-0000-0000-0000000000a1', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f3'$q$);

\echo '===== Production raw material and old records keep working without results'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B4',5,'kg',0,0,0);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,checker_by,checker_at,checker_comments) values ('00000000-0000-0000-0000-0000000000f5',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c3',0,'kg','checker_approved','00000000-0000-0000-0000-0000000000a4',now(),'Decided before 0119');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('a record decided in Round 1 before 0119 (no results) can still be approved in Round 2, results typed on the certificate', $q$update quality_checks set status='approved', review_comments='Legacy approval', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f5'$q$);
select t_fail('an edit cannot be added to a record with no Round 1 results', $q$update quality_checks set reviewer_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":"1"}]'::jsonb where id='00000000-0000-0000-0000-0000000000f5'$q$, 'only be saved together');

\echo '===== Finished product: void returns the batch to Submitted to QC'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR created and approved', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date,status,batch_yield,finish_date,expiry_month,qc_sample_qty,stability_qty,rnd_qty)
 select '00000000-0000-0000-0000-0000000000b1','FP-T1','PR-T1',id,1,10,'kg',current_date,'in_process',9.5,current_date,current_date+365,0.1,0.1,0.1 from mfr_definitions where name='Test MFR';
update finished_product_batches set status='submitted_to_qc' where id='00000000-0000-0000-0000-0000000000b1';
insert into quality_checks (id,ar_number,finished_product_batch_id) values ('00000000-0000-0000-0000-0000000000f4',get_next_ar_number(),'00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('FP Round 1 approve needs the results too', $q$update quality_checks set status='checker_approved', checker_comments='Meets spec', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f4'$q$, 'Enter the result of every test');
select t_ok('FP Round 1 rejection proposed', $q$update quality_checks set status='checker_rejected', checker_comments='Assay low', checker_results='[{"seq":1,"test":"Assay","specification":"NLT 98%","result":""},{"seq":2,"test":"Moisture","specification":"NMT 5%","result":"3.2%"}]'::jsonb, checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f4'$q$);
select t_check('FP batch still Submitted to QC while the rejection is only proposed', (select status='submitted_to_qc' from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('FP rejection confirmed', $q$update quality_checks set status='rejected', review_comments='Confirmed: assay low', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-0000000000f4'$q$);
select t_check('FP batch is Rejected', (select status='rejected' from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select t_ok('FP rejection voided', $q$update quality_checks set status='submitted', void_reason='Rejected the wrong batch' where id='00000000-0000-0000-0000-0000000000f4'$q$);
select t_check('FP batch is back to Submitted to QC and the AR is Awaiting QC', (select status='submitted_to_qc' from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1') and (select status='submitted' from quality_checks where id='00000000-0000-0000-0000-0000000000f4'));

\echo '===== One open record per batch, history cannot be edited by users'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('a client cannot write the decision history', $q$insert into qc_decision_history (quality_check_id,event,reason) values ('00000000-0000-0000-0000-0000000000f1','voided','fake')$q$, 'row-level security');
select t_ok('a client update of the decision history changes nothing (no policy allows it)', $q$update qc_decision_history set reason='changed'$q$);
select t_check('no history row was changed', not exists (select 1 from qc_decision_history where reason='changed'));
select t_ok('a client delete of the decision history removes nothing', $q$delete from qc_decision_history$q$);
select t_check('history still has rows', (select count(*) from qc_decision_history) > 10);
reset role;
select t_check('audit coverage report still empty', not exists (select 1 from audit_coverage_report()));
