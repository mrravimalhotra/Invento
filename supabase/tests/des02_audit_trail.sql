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
-- how many audit rows for (table, action, row)
create or replace function public.t_audits(p_tbl text, p_action text, p_row uuid default null) returns bigint language sql as $$
  select count(*) from public.audit_log where table_name = p_tbl and action = p_action and (p_row is null or row_id = p_row);
$$;
-- TEST ONLY: let the checks read the audit log whatever role is acting (the product keeps it admin/super_auditor-only)
create policy t_read_all on public.audit_log for select using (true);
alter role service_role bypassrls; -- as on Supabase
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean), public.t_audits(text,text,uuid) to authenticated, service_role;

-- make the local auth.users stub look like Supabase's for the account checks
alter table auth.users add column if not exists encrypted_password text, add column if not exists raw_app_meta_data jsonb default '{}'::jsonb,
  add column if not exists email_confirmed_at timestamptz, add column if not exists last_sign_in_at timestamptz,
  add column if not exists banned_until timestamptz, add column if not exists deleted_at timestamptz;

\echo '===== accounts (as the database / Supabase Auth) ====='
insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t','{"full_name":"Admin"}','h1'),('00000000-0000-0000-0000-0000000000a2','im@t','{"full_name":"IM"}','h2'),
 ('00000000-0000-0000-0000-0000000000a3','mfr@t','{"full_name":"MFR"}','h3'),('00000000-0000-0000-0000-0000000000a4','qcc@t','{"full_name":"QCC"}','h4'),
 ('00000000-0000-0000-0000-0000000000a5','qcr@t','{"full_name":"QCR"}','h5');
select t_check('account creation logged for all 5 users', t_audits('auth.users','insert') = 5);
select t_check('profiles created by the signup trigger were logged', t_audits('profiles','insert') = 5);
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000a2';
select t_check('a plain sign-in is NOT logged', t_audits('auth.users','update') = 0);
update auth.users set encrypted_password = 'new-hash', raw_app_meta_data = '{"must_change_password":true}' where id = '00000000-0000-0000-0000-0000000000a2';
select t_check('password change + flag logged', t_audits('auth.users','update','00000000-0000-0000-0000-0000000000a2') = 1);
select t_check('password hash never stored in the audit log', not exists (select 1 from audit_log where table_name='auth.users' and (coalesce(old_data::text,'') || coalesce(new_data::text,'')) like '%hash%'));
select t_check('audit row says password_changed = true', exists (select 1 from audit_log where table_name='auth.users' and action='update' and (new_data->>'password_changed')::boolean));
select t_check('changes from the SQL editor are labelled "database"', not exists (select 1 from audit_log where changed_via is distinct from 'database'));

insert into public.user_roles (user_id, role) values
 ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),
 ('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),
 ('00000000-0000-0000-0000-0000000000a5','qc_reviewer');

\echo '===== master data (as mfr_manager / admin, through the API role) ====='
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('insert item type', $q$insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil')$q$);
select t_ok('insert item (spoofed created_by)', $q$insert into items (id,item_code,name,category,unit,item_type_id,created_by) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Test Oil','raw','kg','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a5')$q$);
select t_check('created_by forced to the real user, not the spoofed one', (select created_by = '00000000-0000-0000-0000-0000000000a3' from items where id='00000000-0000-0000-0000-0000000000c3'));
select t_ok('edit item', $q$update items set name = 'Test Oil 2' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_check('item insert + update logged, by mfr_manager, via app', (select count(*) = 2 and bool_and(changed_by = '00000000-0000-0000-0000-0000000000a3') and bool_and(changed_via = 'app') from audit_log where table_name='items'));
select t_check('updated_by stamped on the item', (select updated_by = '00000000-0000-0000-0000-0000000000a3' and updated_at is not null from items where id='00000000-0000-0000-0000-0000000000c3'));
select t_ok('save item with no changes', $q$update items set name = name where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_check('no-change save is NOT logged', t_audits('items','update') = 1);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('insert vendor, edit, then insert a second and delete it', $q$insert into vendors (id,vendor_code,name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Test Vendor'),('00000000-0000-0000-0000-0000000000c9','V-T9','Temp Vendor'); update vendors set name='Test Vendor Ltd' where id='00000000-0000-0000-0000-0000000000c2'; delete from vendors where id='00000000-0000-0000-0000-0000000000c9'$q$);
select t_check('vendor: 2 inserts, 1 update, 1 delete logged', t_audits('vendors','insert') = 2 and t_audits('vendors','update') = 1 and t_audits('vendors','delete') = 1);
select t_check('deleted vendor snapshot kept in the log', exists (select 1 from audit_log where table_name='vendors' and action='delete' and old_data->>'name' = 'Temp Vendor'));
select t_ok('equipment, dead stock, document, line clearance, environmental reading', $q$
  insert into equipment (id,equipment_code,name,calibration_status) values ('00000000-0000-0000-0000-000000000e01','EQ-T1','Balance','calibrated');
  update equipment set calibration_status='due' where id='00000000-0000-0000-0000-000000000e01';
  insert into dead_stock_items (id,asset_code,article_name,quantity,purchase_price) values ('00000000-0000-0000-0000-000000000e02','DS-T1','Old PC',1,40000);
  insert into documents (id,doc_type,title,file_url) values ('00000000-0000-0000-0000-000000000e03','sop','SOP 1','https://example.com/sop1');
  delete from documents where id='00000000-0000-0000-0000-000000000e03';
  insert into line_clearance_checks (id,area,status,checked_by) values ('00000000-0000-0000-0000-000000000e04','Room 1','clear','00000000-0000-0000-0000-0000000000a1');
  insert into environmental_control_readings (id,area,temperature,humidity) values ('00000000-0000-0000-0000-000000000e05','Room 1',24,50)$q$);
select t_check('equipment insert+update, dead stock insert, document insert+delete, clearance, reading all logged',
  t_audits('equipment','insert')=1 and t_audits('equipment','update')=1 and t_audits('dead_stock_items','insert')=1
  and t_audits('documents','insert')=1 and t_audits('documents','delete')=1 and t_audits('line_clearance_checks','insert')=1
  and t_audits('environmental_control_readings','insert')=1);
select t_ok('grant and revoke a role', $q$insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a2','super_auditor'); delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a2' and role='super_auditor'$q$);
select t_check('role grant and revoke logged against the user, by admin', (select count(*) = 2 and bool_and(row_id = '00000000-0000-0000-0000-0000000000a2' and changed_by = '00000000-0000-0000-0000-0000000000a1') from audit_log where table_name='user_roles' and changed_via='app'));
select t_ok('user edits own profile name', $q$update profiles set full_name='Admin Person' where id='00000000-0000-0000-0000-0000000000a1'$q$);
select t_check('profile update logged', t_audits('profiles','update') = 1);
select t_ok('tester feedback submitted + triaged', $q$insert into page_feedback (id,page_path,page_label,url_path,observation,submitted_by,submitted_by_name,ticket_number) values ('00000000-0000-0000-0000-000000000e06','/','Dashboard','/','Test observation text','00000000-0000-0000-0000-0000000000a1','Admin','FB-T1'); update page_feedback set status='implemented' where id='00000000-0000-0000-0000-000000000e06'$q$);
select t_check('feedback insert + update logged', t_audits('page_feedback','insert')=1 and t_audits('page_feedback','update')=1);

\echo '===== purchase workflow (as inventory_manager) ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('create PO, 2 lines, edit one', $q$
  insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
  insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values
    ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-01/26',10,'kg',0,0,0),
    ('00000000-0000-0000-0000-0000000000e9','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','RM-T0001-09/26',3,'kg',0,0,0);
  update purchase_lines set quantity = 12 where id='00000000-0000-0000-0000-0000000000e1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin deletes one draft line', $q$delete from purchase_lines where id='00000000-0000-0000-0000-0000000000e9'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('Final Submit', $q$select public.submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('PO insert + submit update logged', t_audits('purchase_orders','insert')=1 and t_audits('purchase_orders','update')=1);
select t_check('lines: 2 inserts, edit, delete, and the submit stamps logged', t_audits('purchase_lines','insert')=2 and t_audits('purchase_lines','delete')=1 and t_audits('purchase_lines','update')=2);
select t_check('delete logged with the admin as the person', exists (select 1 from audit_log where table_name='purchase_lines' and action='delete' and changed_by='00000000-0000-0000-0000-0000000000a1'));
select t_check('stock ledger inserts are NOT duplicated into the audit log', t_audits('inventory_ledger','insert') = 0);

\echo '===== QC, MFR, FP (checker, reviewer, mfr_manager) ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC assign + round 1', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',public.get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0.5,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select t_check('QC insert + 2 decisions logged; created_by = checker', t_audits('quality_checks','insert')=1 and t_audits('quality_checks','update')=2 and (select created_by='00000000-0000-0000-0000-0000000000a4' from quality_checks where id='00000000-0000-0000-0000-0000000000f1'));
select t_ok('COA template via RPC', $q$select public.upsert_coa_template('00000000-0000-0000-0000-0000000000c1','[{"test":"Appearance","specification":"Clear"}]'::jsonb)$q$);
select t_check('COA template + its line logged (written by an RPC)', t_audits('coa_templates','insert')=1 and t_audits('coa_template_lines','insert')=1);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR create, procedure, approve (RPCs)', $q$select public.create_mfr_definition('Test MFR', 10, 'ltr', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select public.update_mfr_procedure((select id from mfr_definitions where name='Test MFR'), 'Intro', 95, 90, '[{"stage":"Mixing","operation":"Stir"}]'::jsonb); select public.approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
select t_check('MFR header, recipe line, procedure step logged; created_by = mfr_manager', t_audits('mfr_definitions','insert')=1 and t_audits('mfr_definitions','update')>=2 and t_audits('mfr_lines','insert')=1 and t_audits('mfr_procedure_steps','insert')=1 and (select created_by='00000000-0000-0000-0000-0000000000a3' from mfr_definitions where name='Test MFR'));
select t_check('FP + packaged-FP items created by approval were logged', (select count(*) from audit_log where table_name='items' and action='insert') = 3);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('FP batch draft with a component, confirm', $q$insert into finished_product_batches (id,batch_number,short_batch_no,mfr_definition_id,mfr_version,target_qty,unit,batch_start_date) select '00000000-0000-0000-0000-0000000000b1', b.batch_number, b.short_batch_no, m.id, 1, 10, 'ltr', current_date from (select id from mfr_definitions where name='Test MFR') m, public.get_next_fp_batch_number(m.id) b; insert into finished_product_components (finished_product_batch_id,item_id,purchase_line_id,quantity) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',2); update finished_product_batches set status='in_process' where id='00000000-0000-0000-0000-0000000000b1'$q$);
select t_check('FP batch insert + status change logged, component logged', t_audits('finished_product_batches','insert')=1 and t_audits('finished_product_batches','update')=1 and t_audits('finished_product_components','insert')=1);
select t_check('stock counter change on the RM batch (live_remaining) NOT logged', t_audits('purchase_lines','update') = 2);
reset role;
select set_config('request.jwt.claim.role','',false); select set_config('request.jwt.claim.sub','',false);
insert into bmr_records (id, finished_product_batch_id) values ('00000000-0000-0000-0000-000000000e07','00000000-0000-0000-0000-0000000000b1');
select t_check('BMR record logged (as database)', exists (select 1 from audit_log where table_name='bmr_records' and action='insert' and changed_via='database'));

\echo '===== account actions attributed through the app ====='
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin records a password reset', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a2','password_reset_by_admin')$q$);
select t_check('reset attributed to the admin', exists (select 1 from audit_log where table_name='auth.users' and changed_by='00000000-0000-0000-0000-0000000000a1' and new_data->>'event'='password_reset_by_admin' and new_data->>'email'='im@t'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('non-admin cannot record an admin action', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a3','password_reset_by_admin')$q$, 'not authorized');
select t_ok('user records own password change', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a2','password_changed_by_user')$q$);
select t_fail('user cannot record a password change for someone else', $q$select public.audit_account_action('00000000-0000-0000-0000-0000000000a3','password_changed_by_user')$q$, 'not authorized');

\echo '===== tamper protection ====='
select t_fail('app user cannot insert into the audit log', $q$insert into audit_log (table_name,row_id,action) values ('x','00000000-0000-0000-0000-000000000000','insert')$q$, 'row-level security');
reset role;
select set_config('request.jwt.claim.role','',false); select set_config('request.jwt.claim.sub','',false);
select t_fail('SQL editor cannot edit an audit entry', $q$update audit_log set changed_by = null$q$, 'cannot be changed or deleted');
select t_fail('SQL editor cannot delete audit entries', $q$delete from audit_log$q$, 'cannot be changed or deleted');
select t_fail('SQL editor cannot truncate the audit log', $q$truncate audit_log$q$, 'cannot be changed or deleted');
select t_ok('SQL editor correction of a ledger row', $q$update inventory_ledger set reason = 'corrected' where id = (select id from inventory_ledger limit 1)$q$);
select t_check('direct ledger correction IS logged, labelled database', exists (select 1 from audit_log where table_name='inventory_ledger' and action='update' and changed_via='database'));

\echo '===== service-role path and purge ====='
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
select set_config('request.jwt.claim.sub','',false);
select t_ok('server (service role) edits an item', $q$update items set name='Test Oil 3' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_check('labelled "server"', exists (select 1 from audit_log where table_name='items' and changed_via='server'));
reset role;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin runs Purge Test Data', $q$select count(*) from public.purge_test_data()$q$);
select t_check('purge logged one TRUNCATE per emptied table, by admin', (select count(*) >= 22 and bool_and(changed_by='00000000-0000-0000-0000-0000000000a1') from audit_log where action='truncate'));
select t_check('audit history survived the purge', (select count(*) > 40 from audit_log));
reset role;
select t_check('coverage report still empty', not exists (select 1 from public.audit_coverage_report()));
