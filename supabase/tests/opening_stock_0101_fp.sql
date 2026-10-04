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
create or replace function public.t_load(p_rows text) returns text language plpgsql as $$
declare r record; begin select * into r from public.load_opening_finished_product(p_rows::jsonb); return r.load_no; end $$;
grant execute on function public.t_load(text) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');
create temp table t_out (k text, v text);
grant all on t_out to authenticated;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('MFR 10 kg, approved', $q$select create_mfr_definition('Test MFR', 10, 'kg', '00000000-0000-0000-0000-0000000000c1', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":2,"unit":"kg"}]'::jsonb, 'domestic'); select approve_mfr_definition((select id from mfr_definitions where name='Test MFR'))$q$);
reset role;
create temp table t_ids as select md.finished_product_item_id as fp, i.packaged_item_id as pk from mfr_definitions md join items i on i.id = md.finished_product_item_id where md.name='Test MFR';
grant all on t_ids to authenticated;
create or replace function public.t_fp() returns uuid language sql as $$ select fp from t_ids $$;
create or replace function public.t_pk() returns uuid language sql as $$ select pk from t_ids $$;
grant execute on function public.t_fp(), public.t_pk() to authenticated;
select t_check('the product has a packaged item', (select pk is not null from t_ids));

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== load: one batch with bulk and packs, one with bulk only'
select t_ok('IM loads two batches', $q$
  insert into t_out select 'f1', t_load('[
   {"item_id":"' || t_fp() || '","batch_number":"OLD-B-101","manufacture_date":"2026-02-01","expiry_date":"2028-02-01","bulk_qty":20,"packs":100,"pack_size_qty":100,"pack_size_unit":"g","old_ar":"AR/2025/301","approval_date":"2026-02-10"},
   {"item_id":"' || t_fp() || '","batch_number":"OLD-B-102","manufacture_date":"2026-03-01","expiry_date":"2028-03-01","bulk_qty":5,"old_ar":"AR/2025/302","approval_date":"2026-03-05"}]')$q$);
select t_check('load number OPN-0001', (select v from t_out where k='f1') = 'OPN-0001');
select t_check('finished product stock = bulk left: 20 + 5 = 25 kg', t_oh(t_fp()) = 25);
select t_check('batch 1 yield 30 kg (20 bulk + 100 x 100 g), approved, legacy, dated', (select batch_yield = 30 and status = 'approved' and is_legacy and finish_date = '2026-02-01' and expiry_month = '2028-02-01' and packaged_qty = 100 and created_at::date = '2026-02-01' from finished_product_batches where batch_number='OLD-B-101'));
select t_check('batch 2 yield 5 kg, no packs', (select batch_yield = 5 and packaged_qty = 0 from finished_product_batches where batch_number='OLD-B-102'));
select t_check('QC records approved, legacy, old AR as typed, expiry kept',
  (select count(*) from quality_checks q join finished_product_batches b on b.id=q.finished_product_batch_id where q.is_legacy and q.status='approved' and q.ar_number in ('AR/2025/301','AR/2025/302') and q.expiry_date = b.expiry_month) = 2);
select t_check('one Store packaging issue for the packs (10 kg consumed), tagged with the load',
  (select count(*) = 1 and min(fp_qty_consumed) = 10 and min(pack_size) = '100 g' and min(department) = 'store' from packaging_issues where opening_load_id is not null));
select t_check('summary counts', (select summary = '{"with_bulk":2,"with_packs":1}'::jsonb from opening_loads where load_no='OPN-0001'));

\echo '===== refusals'
select t_fail('app-made batch pattern refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"PR-12/26","manufacture_date":"2026-02-01","expiry_date":"2028-02-01","bulk_qty":1,"old_ar":"AR/9","approval_date":"2026-02-10"}]')$q$, 'made by the app');
select t_fail('app-made AR refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X1","manufacture_date":"2026-02-01","expiry_date":"2028-02-01","bulk_qty":1,"old_ar":"ARFP-0001/26","approval_date":"2026-02-10"}]')$q$, 'made by the app');
select t_fail('duplicate batch refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"OLD-B-101","manufacture_date":"2026-02-01","expiry_date":"2028-02-01","bulk_qty":1,"old_ar":"AR/9","approval_date":"2026-02-10"}]')$q$, 'already used');
select t_fail('duplicate AR refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X2","manufacture_date":"2026-02-01","expiry_date":"2028-02-01","bulk_qty":1,"old_ar":"AR/2025/301","approval_date":"2026-02-10"}]')$q$, 'already used');
select t_fail('expiry must follow manufacture', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X3","manufacture_date":"2026-02-01","expiry_date":"2026-01-01","bulk_qty":1,"old_ar":"AR/10","approval_date":"2026-02-10"}]')$q$, 'after the manufacture date');
select t_fail('approval cannot precede manufacture', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X4","manufacture_date":"2026-02-01","expiry_date":"2028-01-01","bulk_qty":1,"old_ar":"AR/11","approval_date":"2026-01-20"}]')$q$, 'before the manufacture date');
select t_fail('future manufacture refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X5","manufacture_date":"2999-02-01","expiry_date":"3000-01-01","bulk_qty":1,"old_ar":"AR/12","approval_date":"2026-02-10"}]')$q$, 'future');
select t_fail('nothing in stock refused', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X6","manufacture_date":"2026-02-01","expiry_date":"2028-01-01","old_ar":"AR/13","approval_date":"2026-02-10"}]')$q$, 'bulk quantity, the packs');
select t_fail('packs need a pack size', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X7","manufacture_date":"2026-02-01","expiry_date":"2028-01-01","packs":5,"old_ar":"AR/14","approval_date":"2026-02-10"}]')$q$, 'pack size is required');
select t_fail('pack unit must convert (nos vs kg)', $q$select t_load('[{"item_id":"' || t_fp() || '","batch_number":"X8","manufacture_date":"2026-02-01","expiry_date":"2028-01-01","packs":5,"pack_size_qty":1,"pack_size_unit":"ltr","old_ar":"AR/15","approval_date":"2026-02-10"}]')$q$, 'cannot be converted');
select t_fail('raw material item refused', $q$select t_load('[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"X9","manufacture_date":"2026-02-01","expiry_date":"2028-01-01","bulk_qty":1,"old_ar":"AR/16","approval_date":"2026-02-10"}]')$q$, 'finished product not found');
select t_check('refused loads left nothing behind', (select count(*) from finished_product_batches) = 2 and t_oh(t_fp()) = 25);

\echo '===== the batch behaves like any other approved batch'
select t_ok('new packaging issue can draw on the legacy bulk (5 kg of OLD-B-102)', $q$select create_packaging_issues(
  jsonb_build_object('department','store'),
  jsonb_build_array(jsonb_build_object('finished_product_batch_id',(select id from finished_product_batches where batch_number='OLD-B-102'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',5,'unit_count',5)))$q$);
select t_fail('and cannot draw more than the batch holds', $q$select create_packaging_issues(
  jsonb_build_object('department','store'),
  jsonb_build_array(jsonb_build_object('finished_product_batch_id',(select id from finished_product_batches where batch_number='OLD-B-102'),'pack_size','1 kg','pack_size_qty',1,'pack_size_unit','kg','fp_qty_consumed',1,'unit_count',1)))$q$, 'Not enough stock');

\echo '===== undo'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('a load whose batch was packed later cannot be undone', $q$select undo_opening_load((select id from opening_loads where load_no='OPN-0001'))$q$, 'already been used');
select t_ok('a fresh load can be undone', $q$
  insert into t_out select 'f2', t_load('[{"item_id":"' || t_fp() || '","batch_number":"OLD-B-201","manufacture_date":"2026-04-01","expiry_date":"2028-04-01","bulk_qty":3,"packs":10,"pack_size_qty":50,"pack_size_unit":"g","old_ar":"AR/2025/401","approval_date":"2026-04-02"}]')$q$);
select t_check('stock 20 + 3 = 23 (25 less the 5 kg just packed, plus 3 bulk)', t_oh(t_fp()) = 23);
select t_ok('admin undoes the fresh load', $q$select undo_opening_load((select id from opening_loads where load_no=(select v from t_out where k='f2')))$q$);
select t_check('batch, QC, issue and stock are gone', t_oh(t_fp()) = 20
  and not exists (select 1 from finished_product_batches where batch_number='OLD-B-201')
  and not exists (select 1 from quality_checks where ar_number='AR/2025/401')
  and not exists (select 1 from packaging_issues where opening_load_id is not null and pack_size='50 g'));

\echo '===== purge'
reset role;
select t_check('purge runs', (select count(*) from purge_test_data()) > 0);
select t_check('no loads, batches or QC left', (select count(*) from opening_loads) = 0 and (select count(*) from finished_product_batches) = 0 and (select count(*) from quality_checks) = 0);
