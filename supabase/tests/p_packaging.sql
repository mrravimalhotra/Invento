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

\echo '===== ACC-17: FP batch + components in one transaction (as inventory manager)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('FP create with a component larger than the batch fails', $q$select create_finished_product_batch(jsonb_build_object('batch_number','FPX-1','short_batch_no','PR-X1','mfr_definition_id',(select id from mfr_definitions where name='Test MFR'),'mfr_version',1,'target_qty',20,'unit','kg','batch_start_date',current_date::text), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c3','purchase_line_id','00000000-0000-0000-0000-0000000000e1','quantity',500)))$q$, 'live_remaining_not_negative');
select t_check('no empty draft batch left behind (was left for non-admins)', t_n('finished_product_batches') = 0);
select t_check('RM stock untouched: 100', t_oh('00000000-0000-0000-0000-0000000000c3') = 100);
select t_ok('FP create 20 kg with 4 kg Raw A', $q$select create_finished_product_batch(jsonb_build_object('batch_number','FP-1','short_batch_no','PR-1','mfr_definition_id',(select id from mfr_definitions where name='Test MFR'),'mfr_version',1,'target_qty',20,'unit','kg','batch_start_date',current_date::text), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c3','purchase_line_id','00000000-0000-0000-0000-0000000000e1','quantity',4)))$q$);
select t_check('batch is a draft with 1 component; RM 96', (select status='draft' from finished_product_batches where batch_number='FP-1') and t_n('finished_product_components')=1 and t_oh('00000000-0000-0000-0000-0000000000c3') = 96);

\echo '===== set up: batch FP-1 yielded 20 kg (0.5 kg samples); FP stock from it plus 50 kg from another batch'
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
update finished_product_batches set status='approved', batch_yield=20, qc_sample_qty=0.5, stability_qty=0, rnd_qty=0 where batch_number='FP-1';
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,reason) select 'push', finished_product_item_id, 19.5 + 50, 'kg', 'fp_yield', 'test stock' from mfr_definitions where name='Test MFR';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== ACC-12 + ACC-20: packaging issue in one transaction; materials FIFO from batches'
select t_fail('packaging with 500 jars (not enough) fails as a whole', $q$select create_packaging_issue(jsonb_build_object('code','PKG-X','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',5,'unit_count',5,'department','store'), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c5','quantity',500,'unit','nos')))$q$, 'Not enough stock');
select t_check('nothing left behind: no issue, FP stock 69.5, packaged 0 (was deducted and kept before)', t_n('packaging_issues') = 0 and t_oh((select finished_product_item_id from mfr_definitions where name='Test MFR')) = 69.5 and (select coalesce(packaged_qty,0) from finished_product_batches where batch_number='FP-1') = 0);
select t_ok('pack 5 × 1 kg with 40 jars', $q$select create_packaging_issue(jsonb_build_object('code','PKG-1','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',5,'unit_count',5,'department','store'), jsonb_build_array(jsonb_build_object('item_id','00000000-0000-0000-0000-0000000000c5','quantity',40,'unit','nos')))$q$);
select t_check('jars FIFO: J1 30 → 0, J2 100 → 90; jar stock 90', (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-000000000011') = 0 and (select live_remaining_qty from purchase_lines where id='00000000-0000-0000-0000-000000000012') = 90 and t_oh('00000000-0000-0000-0000-0000000000c5') = 90);
select t_check('each jar movement records its batch (30 from J1, 10 from J2)', (select string_agg(pl.batch_number||':'||il.quantity, ',' order by pl.batch_number) from inventory_ledger il join purchase_lines pl on pl.id=il.purchase_line_id where il.reference_type='packaging') = 'J1:30,J2:10');
select t_check('FP stock 64.5; issue saved as pack', t_oh((select finished_product_item_id from mfr_definitions where name='Test MFR')) = 64.5 and (select transaction_type from packaging_issues where code='PKG-1') = 'pack');

\echo '===== ACC-19: batch can''t be packed beyond its own yield'
select t_fail('issue 15 kg from FP-1 (only 14.5 left) refused, although the product has 64.5 kg in stock', $q$select create_packaging_issue(jsonb_build_object('code','PKG-2','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',15,'unit_count',15,'department','store'), '[]'::jsonb)$q$, 'has only 14.5 kg left');
select t_ok('issue exactly the 14.5 kg left', $q$select create_packaging_issue(jsonb_build_object('code','PKG-3','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','14.5 kg','pack_size_qty',14.5,'pack_size_unit','kg','fp_qty_consumed',14.5,'unit_count',1,'department','store'), '[]'::jsonb)$q$);
select t_fail('nothing more from FP-1', $q$select create_packaging_issue(jsonb_build_object('code','PKG-4','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',1,'unit_count',1,'department','store'), '[]'::jsonb)$q$, 'has only 0 kg left');

\echo '===== ACC-05: only Pack'
select t_fail('an Unpack record is refused', $q$insert into packaging_issues (code,finished_product_batch_id,pack_size,unit_count,department,transaction_type) values ('PKG-U',(select id from finished_product_batches where batch_number='FP-1'),'1 kg',1,'store','unpack')$q$, 'packaging_issues_transaction_type_check');
select t_fail('non-packaging role cannot create a packaging issue', $q$select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false); select create_packaging_issue(jsonb_build_object('code','PKG-Q','finished_product_batch_id',(select id from finished_product_batches where batch_number='FP-1'),'pack_size','1 kg','unit_count',1,'department','store'), '[]'::jsonb)$q$, 'row-level security');
reset role;
select t_check('coverage report still empty', not exists (select 1 from audit_coverage_report()));
