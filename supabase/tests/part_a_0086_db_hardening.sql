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

\echo '===== 0086 A7: FP components locked ====='
select t_fail('inventory_manager deletes a component directly', $q$delete from finished_product_components where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'$q$, 'recorded when the batch is created');
select t_fail('inventory_manager edits a component quantity directly', $q$update finished_product_components set quantity=99 where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'$q$, 'recorded when the batch is created');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('admin deletes a component directly', $q$delete from finished_product_components where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'$q$, 'recorded when the batch is created');
select t_check('component still there, stock pull intact', (select count(*)=1 from finished_product_components where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1') and (select live_remaining_qty = 6 from purchase_lines where id='00000000-0000-0000-0000-0000000000e1'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('create + confirm a second batch with a component', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b9', b.batch_number, b.short_batch_no, m.id, 1, 10, 'ltr', current_date from (select id from mfr_definitions where name='Test MFR') m, public.get_next_fp_batch_number(m.id) b; insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b9','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',1)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin deletes the whole batch (components cascade)', $q$delete from finished_product_batches where id='00000000-0000-0000-0000-0000000000b9'$q$);
select t_check('cascaded component gone', not exists (select 1 from finished_product_components where finished_product_batch_id='00000000-0000-0000-0000-0000000000b9'));
reset role;
select t_ok('postgres (RPC/SQL editor) can still edit a component', $q$update finished_product_components set quantity = quantity where finished_product_batch_id='00000000-0000-0000-0000-0000000000b1'$q$);

\echo '===== 0086 A7: documents / coa_templates delete = admin only ====='
insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000a2','Inv Manager') on conflict (id) do update set full_name = excluded.full_name;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('quality_checker adds a document', $q$insert into documents (id,doc_type,title,file_url) values ('00000000-0000-0000-0000-000000000d01','sop','SOP one','https://x/y.pdf')$q$);
select t_ok('quality_checker edits a document', $q$update documents set title='SOP one v2' where id='00000000-0000-0000-0000-000000000d01'$q$);
select t_check('title changed', (select title='SOP one v2' from documents where id='00000000-0000-0000-0000-000000000d01'));
select t_ok('quality_checker delete attempt (no error, no row)', $q$delete from documents where id='00000000-0000-0000-0000-000000000d01'$q$);
select t_check('document still exists after QC delete attempt', exists (select 1 from documents where id='00000000-0000-0000-0000-000000000d01'));
select t_ok('quality_checker adds a COA template', $q$insert into coa_templates (id,item_type_id) values ('00000000-0000-0000-0000-000000000ca1','00000000-0000-0000-0000-0000000000c1')$q$);
select t_ok('quality_checker edits a COA template', $q$update coa_templates set updated_by='00000000-0000-0000-0000-0000000000a4' where id='00000000-0000-0000-0000-000000000ca1'$q$);
select t_ok('quality_checker delete attempt on template', $q$delete from coa_templates where id='00000000-0000-0000-0000-000000000ca1'$q$);
select t_check('template still exists', exists (select 1 from coa_templates where id='00000000-0000-0000-0000-000000000ca1'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin deletes the document', $q$delete from documents where id='00000000-0000-0000-0000-000000000d01'$q$);
select t_check('document gone', not exists (select 1 from documents where id='00000000-0000-0000-0000-000000000d01'));
select t_ok('admin deletes the template', $q$delete from coa_templates where id='00000000-0000-0000-0000-000000000ca1'$q$);
select t_check('template gone', not exists (select 1 from coa_templates where id='00000000-0000-0000-0000-000000000ca1'));

\echo '===== 0086 A8: CHECK constraints ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('equipment quantity 0', $q$insert into equipment (equipment_code,name,quantity) values ('EQ-T1','Balance',0)$q$, 'equipment_quantity_positive');
select t_ok('equipment quantity 2', $q$insert into equipment (equipment_code,name,quantity) values ('EQ-T2','Balance',2)$q$);
select t_fail('equipment edited to -1', $q$update equipment set quantity=-1 where equipment_code='EQ-T2'$q$, 'equipment_quantity_positive');
select t_fail('dead stock quantity 0', $q$insert into dead_stock_items (asset_code,article_name,quantity) values ('DS-T1','Chair',0)$q$, 'dead_stock_quantity_positive');
select t_fail('dead stock negative price', $q$insert into dead_stock_items (asset_code,article_name,purchase_price) values ('DS-T2','Chair',-5)$q$, 'dead_stock_price_nonneg');
select t_fail('dead stock depreciation 101', $q$insert into dead_stock_items (asset_code,article_name,depreciation_pct) values ('DS-T3','Chair',101)$q$, 'dead_stock_depreciation_range');
select t_fail('dead stock negative depreciation', $q$insert into dead_stock_items (asset_code,article_name,depreciation_pct) values ('DS-T3','Chair',-1)$q$, 'dead_stock_depreciation_range');
select t_fail('dead stock negative rejected qty', $q$insert into dead_stock_items (asset_code,article_name,rejected_qty) values ('DS-T4','Chair',-1)$q$, 'dead_stock_rejected_nonneg');
select t_fail('dead stock negative balance value', $q$insert into dead_stock_items (asset_code,article_name,balance_value) values ('DS-T5','Chair',-1)$q$, 'dead_stock_balance_nonneg');
select t_ok('dead stock normal row (blank optional numbers)', $q$insert into dead_stock_items (asset_code,article_name,quantity,purchase_price,depreciation_pct) values ('DS-T6','Chair',3,1000,25)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_fail('MFR batch size 0', $q$insert into mfr_definitions (code,name,batch_size_qty,batch_size_unit) values ('MFR-Z','Zero',0,'ltr')$q$, 'mfr_definitions_batch_size_positive');
reset role;
select t_check('all new CHECKs are NOT VALID (existing rows never scanned)', (select count(*)=7 and bool_and(not convalidated) from pg_constraint where conname in ('equipment_quantity_positive','dead_stock_quantity_positive','dead_stock_price_nonneg','dead_stock_depreciation_range','dead_stock_rejected_nonneg','dead_stock_balance_nonneg','mfr_definitions_batch_size_positive')));

\echo '===== 0086 A10: bulk MFR creates no items ====='
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
create temp table _n as select (select count(*) from public.items) as items_before;
grant all on _n to authenticated;
select t_ok('bulk create 2 MFRs', $q$create temp table _r as select * from public.bulk_create_mfr_definitions('[{"name":"Bulk One","batch_size_qty":10,"batch_size_unit":"ltr","item_type_id":"00000000-0000-0000-0000-0000000000c1","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}],"procedure_steps":[{"stage":"Mix","operation":"Stir"}]},{"name":"Bulk Two","batch_size_qty":5,"batch_size_unit":"kg","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]}]'::jsonb)$q$);
select t_check('returns mfr_name + mfr_code for both', (select count(*)=2 and count(mfr_code)=2 from _r));
select t_check('no items created at import', (select count(*) from public.items) = (select items_before from _n));
select t_check('MFRs unapproved with no FP item, item type kept', (select bool_and(approved_by is null and finished_product_item_id is null) and bool_or(item_type_id='00000000-0000-0000-0000-0000000000c1') from mfr_definitions where name in ('Bulk One','Bulk Two')));
select t_check('recipe + procedure written', (select count(*)=2 from mfr_lines where mfr_definition_id in (select id from mfr_definitions where name in ('Bulk One','Bulk Two'))) and (select count(*)=1 from mfr_procedure_steps where mfr_definition_id=(select id from mfr_definitions where name='Bulk One')));
select t_fail('bulk with a bad batch size rolls back cleanly', $q$select * from public.bulk_create_mfr_definitions('[{"name":"Bad","batch_size_qty":0,"batch_size_unit":"kg","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]}]'::jsonb)$q$, 'batch size must be greater than 0');
select t_ok('approve creates the item pair', $q$select public.approve_mfr_definition((select id from mfr_definitions where name='Bulk One'))$q$);
select t_check('pair created on approval, paired correctly', (select count(*)=1 from items p join items f on f.packaged_item_id=p.id join mfr_definitions m on m.finished_product_item_id=f.id where m.name='Bulk One' and f.category='processed' and p.category='packaged_fp' and f.item_type_id='00000000-0000-0000-0000-0000000000c1'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_fail('quality_checker cannot bulk-create MFRs', $q$select * from public.bulk_create_mfr_definitions('[{"name":"Nope","batch_size_qty":1,"batch_size_unit":"kg","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]}]'::jsonb)$q$, 'Not authorized');

\echo '===== 0086 A11: pairing categories ====='
reset role;
insert into items (id,item_code,name,category,unit) values
 ('00000000-0000-0000-0000-0000000000c7','RM-T0002','Other raw','raw','kg'),
 ('00000000-0000-0000-0000-0000000000c8','FP-TEST','Some FP','processed','kg'),
 ('00000000-0000-0000-0000-0000000000c9','PKG-TEST','Some packaged','packaged_fp','nos');
select t_fail('FP paired to a raw item as packaged', $q$update items set packaged_item_id='00000000-0000-0000-0000-0000000000c7' where id='00000000-0000-0000-0000-0000000000c8'$q$, 'Packaged Finished Product');
select t_fail('raw item given a packaged pointer', $q$update items set packaged_item_id='00000000-0000-0000-0000-0000000000c9' where id='00000000-0000-0000-0000-0000000000c7'$q$, 'Packaged Finished Product');
select t_fail('FP production stock pointing at a packaged item', $q$update items set production_rm_item_id='00000000-0000-0000-0000-0000000000c9' where id='00000000-0000-0000-0000-0000000000c8'$q$, 'Raw Material');
select t_ok('correct packaged pairing', $q$update items set packaged_item_id='00000000-0000-0000-0000-0000000000c9' where id='00000000-0000-0000-0000-0000000000c8'$q$);
select t_ok('correct production RM pairing', $q$update items set production_rm_item_id='00000000-0000-0000-0000-0000000000c7' where id='00000000-0000-0000-0000-0000000000c8'$q$);
select t_ok('unrelated update of a paired row still fine', $q$update items set name='Some FP renamed' where id='00000000-0000-0000-0000-0000000000c8'$q$);
select t_fail('MFR linked to a raw item', $q$update mfr_definitions set finished_product_item_id='00000000-0000-0000-0000-0000000000c7' where name='Bulk Two'$q$, 'Finished Product item');
select t_ok('MFR linked to an FP item', $q$update mfr_definitions set finished_product_item_id='00000000-0000-0000-0000-0000000000c8' where name='Bulk Two'$q$);

\echo '===== 0086 A13: feedback name from profile ====='
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('feedback with a faked name', $q$insert into page_feedback (ticket_number,page_path,page_label,url_path,observation,submitted_by,submitted_by_name) values ('FB-T001','/x','X','/x','obs',auth.uid(),'Fake CEO')$q$);
select t_check('name replaced by profile full name', (select submitted_by_name='Inv Manager' from page_feedback where ticket_number='FB-T001'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('feedback from a user with no profile name', $q$insert into page_feedback (ticket_number,page_path,page_label,url_path,observation,submitted_by,submitted_by_name) values ('FB-T002','/x','X','/x','obs',auth.uid(),'Fake CEO')$q$);
select t_check('falls back to email like the app', (select submitted_by_name='mfr@t' from page_feedback where ticket_number='FB-T002'));
select t_fail('cannot submit as someone else (RLS)', $q$insert into page_feedback (ticket_number,page_path,page_label,url_path,observation,submitted_by,submitted_by_name) values ('FB-T003','/x','X','/x','obs','00000000-0000-0000-0000-0000000000a1','x')$q$, 'row-level security');

\echo '===== 0086 A14: dead code gone ====='
reset role;
select t_check('no-op sample-pull trigger gone', not exists (select 1 from pg_trigger where tgname='trg_qc_sample_pull'));
select t_check('dead functions gone', not exists (select 1 from pg_proc where proname in ('trg_fn_qc_sample_pull','trg_fn_purchase_line_push')));
select t_check('fp_batch_seq gone', not exists (select 1 from pg_class where relname='fp_batch_seq'));

\echo '===== 0086 A9: purge test data ====='
select nextval('item_code_seq_rmfp') from generate_series(1,3);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('non-admin cannot purge', $q$select * from public.purge_test_data()$q$, 'Only System Admin');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
create temp table _p as select * from public.purge_test_data();
select t_check('result now lists the 4 previously unreported tables', (select count(*)=4 from _p where table_name in ('mfr_procedure_steps','coa_templates','coa_template_lines','production_issue_batches')));
select t_check('mfr_procedure_steps reported with its row count', (select rows_purged>=1 from _p where table_name='mfr_procedure_steps'));
reset role;
select t_check('everything emptied, feedback kept', (select count(*)=0 from items) and (select count(*)=0 from mfr_procedure_steps) and (select count(*)=2 from page_feedback));
select t_check('RM-FP code counter restarted at 1', public.get_next_production_rm_item_code() like '%0001');
