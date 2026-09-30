\set ON_ERROR_STOP on
\pset footer off
-- ---------- helpers (invoker rights: they run as whoever calls them) ----------
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PASS  | ok      | % (as %)', p_label, current_user;
exception when others then
  raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm;
end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'FAIL  | blocked | % (as %) -> statement was ALLOWED', p_label, current_user;
exception when others then
  if position(p_expect in sqlerrm) > 0 then
    raise notice 'PASS  | blocked | % (as %) -> %', p_label, current_user, sqlerrm;
  else
    raise notice 'FAIL  | blocked | % (as %) -> wrong error: %', p_label, current_user, sqlerrm;
  end if;
end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if;
end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;

-- ---------- seed (as postgres) ----------
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),
 ('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),
 ('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into public.user_roles values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),
 ('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into public.item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into public.vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Test Vendor');
insert into public.items (id, item_code, name, category, unit, item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Test Oil','raw','kg','00000000-0000-0000-0000-0000000000c1');

\echo '===== PURCHASE (as inventory_manager) ====='
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('create draft PO', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date)$q$);
select t_ok('add line to draft PO', $q$insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-01/26',10,'kg',0.5,0.5,1)$q$);
select t_ok('edit line of draft PO', $q$update purchase_lines set quantity = 12 where id = '00000000-0000-0000-0000-0000000000e1'$q$);
select t_fail('set live_remaining_qty directly', $q$update purchase_lines set live_remaining_qty = 999 where id = '00000000-0000-0000-0000-0000000000e1'$q$, 'maintained automatically');
select t_fail('set pushed_at directly', $q$update purchase_lines set pushed_at = now() where id = '00000000-0000-0000-0000-0000000000e1'$q$, 'maintained automatically');
select t_fail('insert PO already submitted', $q$insert into purchase_orders (po_number,vendor_id,invoice_number,invoice_date,status) values ('PO-T9','00000000-0000-0000-0000-0000000000c2','INV-9',current_date,'submitted')$q$, 'must start as a draft');
select t_fail('flip PO to submitted directly', $q$update purchase_orders set status = 'submitted' where id = '00000000-0000-0000-0000-0000000000d1'$q$, 'Final Submit');
select t_ok('Final Submit via RPC', $q$select public.submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('ledger push written on submit', exists (select 1 from inventory_ledger where purchase_line_id = '00000000-0000-0000-0000-0000000000e1' and event_type = 'push'));
select t_fail('edit line of submitted PO', $q$update purchase_lines set quantity = 50 where id = '00000000-0000-0000-0000-0000000000e1'$q$, 'is submitted');
select t_fail('add line to submitted PO', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-99/26',5,'kg',0,0,0)$q$, 'is submitted');
select t_fail('flip submitted PO back to draft directly', $q$update purchase_orders set status = 'draft' where id = '00000000-0000-0000-0000-0000000000d1'$q$, 'Final Submit');
select t_fail('edit invoice no. of submitted PO', $q$update purchase_orders set invoice_number = 'CHANGED' where id = '00000000-0000-0000-0000-0000000000d1'$q$, 'submitted and locked');
select t_ok('deactivate / reactivate submitted PO', $q$update purchase_orders set active = false where id = '00000000-0000-0000-0000-0000000000d1'; update purchase_orders set active = true where id = '00000000-0000-0000-0000-0000000000d1'$q$);
select t_ok('create second draft PO with a line', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date); insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','RM-T0001-02/26',4,'kg',0,0,0)$q$);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo '--- as system_admin ---'
select t_fail('admin deletes line of submitted PO', $q$delete from purchase_lines where id = '00000000-0000-0000-0000-0000000000e1'$q$, 'is submitted');
select t_ok('Reopen via RPC', $q$select public.reopen_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_ok('edit line after Reopen', $q$update purchase_lines set quantity = 10 where id = '00000000-0000-0000-0000-0000000000e1'$q$);
select t_ok('Final Submit again', $q$select public.submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_ok('admin deletes a draft PO with lines (cascade)', $q$delete from purchase_orders where id = '00000000-0000-0000-0000-0000000000d2'$q$);
select t_check('draft PO and its line are gone', not exists (select 1 from purchase_lines where purchase_order_id = '00000000-0000-0000-0000-0000000000d2'));

\echo '===== QC release of the RM batch (checker, then reviewer) ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC assign + Round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,created_by) values ('00000000-0000-0000-0000-0000000000f1',public.get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.5,'kg','00000000-0000-0000-0000-0000000000a4'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC Round 2 approve', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);

\echo '===== MFR (as mfr_manager) ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('create MFR via RPC', $q$select public.create_mfr_definition('Test MFR', 10, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic')$q$);
select t_fail('insert MFR already approved', $q$insert into mfr_definitions (code,name,batch_size_qty,batch_size_unit,approved_by,approved_at) values ('MFR-X','Sneaky',10,'ltr','00000000-0000-0000-0000-0000000000a3',now())$q$, 'must be created unapproved');
select t_ok('edit recipe line of unapproved MFR', $q$update mfr_lines set quantity = 2.5 where mfr_definition_id = (select id from mfr_definitions where name='Test MFR')$q$);
select t_fail('set approved_by directly', $q$update mfr_definitions set approved_by = '00000000-0000-0000-0000-0000000000a3', approved_at = now() where name='Test MFR'$q$, 'approval details');
select t_ok('Approve via RPC', $q$select public.approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select t_check('approval created the FP item', (select finished_product_item_id is not null from mfr_definitions where name='Test MFR'));
select t_fail('edit recipe line of approved MFR', $q$update mfr_lines set quantity = 99 where mfr_definition_id = (select id from mfr_definitions where name='Test MFR')$q$, 'recipe lines are locked');
select t_fail('delete recipe line of approved MFR', $q$delete from mfr_lines where mfr_definition_id = (select id from mfr_definitions where name='Test MFR')$q$, 'recipe lines are locked');
select t_fail('add recipe line to approved MFR', $q$insert into mfr_lines (mfr_definition_id,version,item_id,quantity,unit) values ((select id from mfr_definitions where name='Test MFR'),1,'00000000-0000-0000-0000-0000000000c3',1,'kg')$q$, 'recipe lines are locked');
select t_fail('change batch size of approved MFR', $q$update mfr_definitions set batch_size_qty = 500 where name='Test MFR'$q$, 'approved and locked');
select t_fail('clear approval directly', $q$update mfr_definitions set approved_by = null, approved_at = null where name='Test MFR'$q$, 'approval details');
select t_ok('deactivate / reactivate approved MFR', $q$update mfr_definitions set active = false where name='Test MFR'; update mfr_definitions set active = true where name='Test MFR'$q$);
select t_ok('edit procedure of approved MFR via RPC', $q$select public.update_mfr_procedure((select id from mfr_definitions where name='Test MFR'), 'Intro', 95, 90, '[{"stage":"Mixing","operation":"Stir"}]'::jsonb)$q$);
select t_ok('create + approve a second MFR', $q$select public.create_mfr_definition('Test MFR 2', 5, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb, 'domestic'); select public.approve_mfr_definition((select id from mfr_definitions where name='Test MFR 2'))$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin deletes an approved MFR (cascade to its lines)', $q$delete from mfr_definitions where name='Test MFR 2'$q$);
select t_check('its recipe lines are gone', not exists (select 1 from mfr_lines l left join mfr_definitions d on d.id = l.mfr_definition_id where d.id is null));

\echo '===== FINISHED PRODUCT (as inventory_manager) ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('create draft FP batch', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b1', b.batch_number, b.short_batch_no, m.id, 1, 10, 'ltr', current_date from (select id from mfr_definitions where name='Test MFR') m, public.get_next_fp_batch_number(m.id) b$q$);
select t_fail('insert FP batch already approved', $q$insert into finished_product_batches (batch_number,mfr_definition_id,mfr_version,target_qty,unit,status) select 'FAKE-1', id, 1, 10, 'ltr', 'approved' from mfr_definitions where name='Test MFR'$q$, 'must start as a draft');
select t_ok('add RM component (trigger updates a SUBMITTED PO line)', $q$insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',2)$q$);
select t_check('RM batch live_remaining reduced by 2 (8 -> 6)', (select live_remaining_qty = 6 from purchase_lines where id='00000000-0000-0000-0000-0000000000e1'));
select t_fail('draft -> approved directly', $q$update finished_product_batches set status='approved' where id='00000000-0000-0000-0000-0000000000b1'$q$, 'cannot move from "draft" to "approved"');
select t_ok('Create Batch: draft -> in_process', $q$update finished_product_batches set status='in_process' where id='00000000-0000-0000-0000-0000000000b1' and status='draft'$q$);
select t_fail('in_process -> approved directly', $q$update finished_product_batches set status='approved' where id='00000000-0000-0000-0000-0000000000b1'$q$, 'cannot move');
select t_ok('Complete Batch: in_process -> complete_awaiting_qc', $q$update finished_product_batches set batch_yield=9.5, finish_date=current_date, expiry_month=current_date+365, qc_sample_qty=0.1, stability_qty=0.1, rnd_qty=0.1, status='complete_awaiting_qc' where id='00000000-0000-0000-0000-0000000000b1'$q$);

\echo '===== 0085 ====='
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('second draft batch', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b2', b.batch_number, b.short_batch_no, m.id, 1, 10, 'ltr', current_date from (select id from mfr_definitions where name='Test MFR') m, public.get_next_fp_batch_number(m.id) b$q$);
select t_ok('confirm second batch', $q$update finished_product_batches set status='in_process' where id='00000000-0000-0000-0000-0000000000b2' and status='draft'$q$);
select t_fail('finish before start blocked', $q$update finished_product_batches set batch_yield=9.5, finish_date=current_date-1, expiry_month=current_date+365, qc_sample_qty=0.1, stability_qty=0.1, rnd_qty=0.1, status='complete_awaiting_qc' where id='00000000-0000-0000-0000-0000000000b2'$q$, 'fp_finish_not_before_start');
select t_ok('finish on start day allowed', $q$update finished_product_batches set batch_yield=9.5, finish_date=current_date, expiry_month=current_date+365, qc_sample_qty=0.1, stability_qty=0.1, rnd_qty=0.1, status='complete_awaiting_qc' where id='00000000-0000-0000-0000-0000000000b2'$q$);
select t_ok('submit_fp_batch_to_qc succeeds', $q$select public.submit_fp_batch_to_qc('00000000-0000-0000-0000-0000000000b1')$q$);
select t_check('QC record exists once', (select count(*)=1 from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_check('batch is submitted_to_qc', (select status='submitted_to_qc' from finished_product_batches where id='00000000-0000-0000-0000-0000000000b1'));
select t_check('QC created_by is the caller', (select created_by='00000000-0000-0000-0000-0000000000a2' from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'));
select t_fail('second submit refused', $q$select public.submit_fp_batch_to_qc('00000000-0000-0000-0000-0000000000b1')$q$, 'Only a batch that has been completed');
select t_fail('unknown batch refused', $q$select public.submit_fp_batch_to_qc('00000000-0000-0000-0000-00000000ffff')$q$, 'Batch not found');
select t_check('no orphan QC or second AR after refusals', (select count(*)=1 from quality_checks where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'));
