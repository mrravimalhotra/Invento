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
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('POs: RM 100 kg; jars J1 30 (older), J2 100', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',0,0,0);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,created_at) values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c5','J1',30,'nos',0,0,0, now() - interval '1 day');
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c5','J2',100,'nos',0,0,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('QC approve RM B1 (round 1)', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1',get_next_ar_number(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg'); update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('QC round 2', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=365 where id='00000000-0000-0000-0000-0000000000f1'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false);
select t_ok('MFR 10 kg batch (2 kg Raw A), approved', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('FP create 20 kg with 4 kg Raw A', $q$select create_finished_product_batch(jsonb_build_object('batch_number','FP-1','short_batch_no','PR-1','mfr_definition_id',(select id from mfr_definitions where name='Test MFR'),'mfr_version',1,'target_qty',20,'unit','kg','batch_start_date',current_date::text), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c3','purchase_line_id','00000000-0000-0000-0000-0000000000e1','quantity',4)))$q$);
select t_check('batch is a draft with 1 component; RM 96', (select status='draft' from finished_product_batches where batch_number='FP-1') and t_n('finished_product_components')=1 and t_oh('00000000-0000-0000-0000-0000000000c3') = 96);

\echo '===== set up: batch FP-1 yielded 20 kg (0.5 kg samples); FP stock from it plus 50 kg from another batch'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
update finished_product_batches set status='approved', batch_yield=20, qc_sample_qty=0.5, stability_qty=0, rnd_qty=0 where batch_number='FP-1';
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason) select 'push', finished_product_item_id, 19.5, 'kg', 'fp_yield', 'test stock' from mfr_definitions where name='Test MFR';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

select t_ok('pack 5 × 1 kg with 40 jars', $q$select create_packaging_issue(jsonb_build_object('code','PKG-1','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',5,'unit_count',5,'department','store'), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c5','quantity',40,'unit','nos')))$q$);

\echo '===== SCAN-P3-05: stock integrity check'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('after a real purchase, QC, finished product and packaging flow, all nine checks are clean',
  (select count(*) from stock_integrity_check()) = 9 and (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);
select t_check('the System Administrator gets nine rows with a code, title, count and sample',
  (select count(*) from stock_integrity_check() where code is not null and title is not null and problems is not null and sample is not null) = 9);
select t_check('every check is clean', (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('an inventory manager cannot run it', $q$select * from stock_integrity_check()$q$, 'Only the System Administrator');
select t_fail('the internal runner is not callable by signed-in users', $q$select * from _integrity_run('select 1')$q$, 'permission denied');
reset role;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to anon;
set role anon;
select set_config('request.jwt.claim.role','anon',false);
select set_config('request.jwt.claim.sub','',false);
select t_fail('the anonymous role cannot run it', $q$select * from stock_integrity_check()$q$, 'permission denied');
reset role;

-- break things by hand (as the database owner) and see each check notice
update purchase_lines set live_remaining_qty = live_remaining_qty + 3 where id = '00000000-0000-0000-0000-0000000000e1';
insert into inventory_ledger (event_type,item_id,purchase_line_id,quantity,unit,reference_type,reason) values ('push','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000e1',1,'nos','finished_product','wrong item');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('S2 notices a batch whose remaining quantity no longer matches the ledger',
  (select problems from stock_integrity_check() where code = 'S2') >= 1);
select t_check('the sample names the batch and the difference',
  (select sample->0->>'batch_number' from stock_integrity_check() where code = 'S2') = 'B1');
select t_check('S6 notices a ledger row whose item differs from the item of its batch', (select problems from stock_integrity_check() where code = 'S6') = 1);
select t_check('a clean check stays at zero (S9)', (select problems from stock_integrity_check() where code = 'S9') = 0);
reset role;
delete from inventory_ledger where reason = 'wrong item';
update purchase_lines set live_remaining_qty = live_remaining_qty - 3 where id = '00000000-0000-0000-0000-0000000000e1';

\echo '===== SCAN-P6-03: approved batches with the quantity left'
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('one approved batch, FP-1, listed with product name and unit',
  (select count(*) from fp_batch_packing_options) = 1 and (select fp_name from fp_batch_packing_options) = 'Test MFR' and (select fp_unit from fp_batch_packing_options) = 'kg');
select t_check('left = 20 yield - 0.5 samples - 5 already packed = 14.5', (select left_qty from fp_batch_packing_options where batch_number = 'FP-1') = 14.5);
select t_ok('issue the 14.5 kg left', $q$select create_packaging_issue(jsonb_build_object('code','PKG-R','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','14.5 kg','pack_size_qty',14.5,'pack_size_unit','kg','fp_qty_consumed',14.5,'unit_count',1,'department','production'), '[]'::jsonb)$q$);
select t_check('and the view now shows 0 left', (select left_qty from fp_batch_packing_options where batch_number = 'FP-1') = 0);
select t_fail('a view cannot be written', $q$update fp_batch_packing_options set left_qty = 99$q$, 'cannot update view');
reset role;
update finished_product_batches set status = 'submitted_to_qc' where batch_number = 'FP-1';
select t_check('a batch that is not approved is not listed', (select count(*) from fp_batch_packing_options) = 0);
update finished_product_batches set status = 'approved' where batch_number = 'FP-1';
select t_check('anonymous has no right on the view', not has_table_privilege('anon','public.fp_batch_packing_options','select'));
select t_check('signed-in users cannot insert, update or delete through the view',
  not has_table_privilege('authenticated','public.fp_batch_packing_options','insert')
  and not has_table_privilege('authenticated','public.fp_batch_packing_options','update')
  and not has_table_privilege('authenticated','public.fp_batch_packing_options','delete'));

\echo '===== SCAN-P10-07: India time'
select t_check('the seven functions carry the India time zone',
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_next_batch_number','get_next_fp_batch_number','get_next_production_batch_number','get_next_coa_number','check_batch_qc_approved','start_retest','trg_fn_fp_component_fifo')
      and exists (select 1 from unnest(p.proconfig) c where lower(c) = 'timezone=asia/kolkata')) = 7);
select t_check('the two views name the India time zone',
  pg_get_viewdef('public.current_qc_approvals'::regclass) like '%Asia/Kolkata%'
  and pg_get_viewdef('public.item_stock_status'::regclass) like '%Asia/Kolkata%');
select t_check('neither view still uses the session date',
  pg_get_viewdef('public.current_qc_approvals'::regclass) not like '%CURRENT_DATE%'
  and pg_get_viewdef('public.item_stock_status'::regclass) not like '%CURRENT_DATE%');
set time zone 'UTC';
select t_check('with the session set to UTC the batch-number year is still the India year',
  right(public.get_next_batch_number('00000000-0000-0000-0000-0000000000c3'), 2) = to_char(now() at time zone 'Asia/Kolkata', 'YY'));
reset time zone;
select t_check('the view still reads: current approvals view is selectable', (select count(*) from current_qc_approvals) >= 0);
