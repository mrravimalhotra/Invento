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
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a4','qc@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c4','RM-T0002','Raw B','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c5','PK-T0001','Bottle','packaging','nos','00000000-0000-0000-0000-0000000000c1');
create temp table t_out (k text, v text);
grant all on t_out to authenticated;
-- load as the given role user
create or replace function public.t_load(p_kind text, p_rows text) returns text language plpgsql as $$
declare r record; begin select * into r from public.load_opening_stock(p_kind, p_rows::jsonb); return r.load_no; end $$;
grant execute on function public.t_load(text,text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== open by default; any role can load'
select t_check('loading is open by default', (select is_open from opening_stock_settings));
select t_ok('IM loads raw: approved + pending + rejected', $q$
  insert into t_out select 'raw1', t_load('raw', '[
   {"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-77","quantity":50,"receipt_date":"2026-01-10","expiry_date":"2028-01-10","qc_status":"approved","old_ar":"AR/2025/014","approval_date":"2026-01-15","retest_date":"2026-07-14","retests_done":1,"vendor_id":"00000000-0000-0000-0000-0000000000c2","unit_price":120},
   {"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-78","quantity":20,"receipt_date":"2026-02-01","expiry_date":"2028-02-01","qc_status":"pending"},
   {"item_id":"00000000-0000-0000-0000-0000000000c4","batch_number":"BAD-1","quantity":5,"receipt_date":"2026-02-02","qc_status":"rejected","old_ar":"AR/2025/020","approval_date":"2026-02-05"}]')$q$);
select t_check('load number is OPN-0001', (select v from t_out where k='raw1') = 'OPN-0001');
select t_check('stock on hand: Raw A 70, Raw B 0 (the rejected 5 sit in Rejected Materials, 0104)', t_oh('00000000-0000-0000-0000-0000000000c3') = 70 and t_oh('00000000-0000-0000-0000-0000000000c4') = 0
  and (select rejected_qty from rejected_batches where batch_number = 'BAD-1') = 5);
select t_check('all three lines are legacy, receipt-dated, with ledger pushes',
  (select count(*) from purchase_lines where is_legacy and created_at::date <= '2026-02-02' and pushed_at is not null) = 3);
select t_check('two QC records (approved + rejected), both legacy, old AR kept as typed',
  (select count(*) from quality_checks where is_legacy and ar_number in ('AR/2025/014','AR/2025/020')) = 2);
select t_check('approved QC: expiry, retest 180 days after approval, retests_done 1',
  (select expiry_date = '2028-01-10' and retest_date = '2026-07-14' and legacy_retests_done = 1 and status = 'approved' from quality_checks where ar_number = 'AR/2025/014'));
select t_check('rejected QC has no retest date', (select retest_date is null and status = 'rejected' from quality_checks where ar_number = 'AR/2025/020'));
select t_check('pending batch has no QC record yet', not exists (select 1 from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-78'));
select t_check('pending batch keeps its expiry on the purchase line', (select expiry_date = '2028-02-01' from purchase_lines where batch_number='OLD-78'));
select t_check('one PO per vendor (named vendor + system vendor)', (select count(*) from purchase_orders where opening_load_id is not null) = 2);
select t_check('summary counts', (select summary = '{"approved":1,"pending":1,"rejected":1}'::jsonb from opening_loads where load_no='OPN-0001'));

\echo '===== packaging'
select t_ok('packaging load, blank lot gets a batch number', $q$
  insert into t_out select 'pk1', t_load('packaging', '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1000,"receipt_date":"2026-03-01"}]')$q$);
select t_check('packaging stock 1000', t_oh('00000000-0000-0000-0000-0000000000c5') = 1000);

\echo '===== refusals (whole load rolls back)'
select t_fail('app-made batch pattern refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"RM-T0001-0001/26","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"pending"}]')$q$, 'made by the app');
select t_fail('app-made AR pattern refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"X1","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"approved","old_ar":"ARRM-0001/26","approval_date":"2026-01-02","retest_date":"2026-07-01"}]')$q$, 'made by the app');
select t_fail('duplicate batch for same item refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-77","quantity":1,"receipt_date":"2026-01-01","qc_status":"pending"}]')$q$, 'already used');
select t_fail('duplicate old AR refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"N1","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"approved","old_ar":"AR/2025/014","approval_date":"2026-01-02","retest_date":"2026-07-01"}]')$q$, 'already used');
select t_fail('future receipt date refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"F1","quantity":1,"receipt_date":"2999-01-01","qc_status":"pending"}]')$q$, 'future');
select t_fail('approved needs old AR', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"N2","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"approved","approval_date":"2026-01-02","retest_date":"2026-07-01"}]')$q$, 'old AR number is required');
select t_fail('retest date must be after approval', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"N3","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"approved","old_ar":"AR/9","approval_date":"2026-01-02","retest_date":"2026-01-02"}]')$q$, 'after the QC approval');
select t_fail('retests done above 3 refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"N4","quantity":1,"receipt_date":"2026-01-01","expiry_date":"2028-01-01","qc_status":"approved","old_ar":"AR/10","approval_date":"2026-01-02","retest_date":"2026-07-01","retests_done":4}]')$q$, '0 to 3');
select t_fail('packaging item in a raw load refused', $q$select t_load('raw','[{"item_id":"00000000-0000-0000-0000-0000000000c5","batch_number":"N5","quantity":1,"receipt_date":"2026-01-01","qc_status":"pending"}]')$q$, 'not a raw');
select t_check('refused loads left nothing behind', (select count(*) from opening_loads) = 2 and (select count(*) from purchase_lines where is_legacy) = 4);

\echo '===== undo and close: System Administrator only'
select t_fail('inventory manager cannot undo', $q$select undo_opening_load((select id from opening_loads where load_no='OPN-0002'))$q$, 'Only the System Administrator');
select t_fail('inventory manager cannot close', $q$select set_opening_stock_open(false)$q$, 'Only the System Administrator');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin undoes the packaging load', $q$select undo_opening_load((select id from opening_loads where load_no='OPN-0002'))$q$);
select t_check('packaging stock back to 0 and load gone', t_oh('00000000-0000-0000-0000-0000000000c5') = 0 and (select count(*) from opening_loads) = 1);

\echo '===== used stock cannot be undone'
reset role;
insert into inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, event_by)
  select 'pull', item_id, id, 5, unit, 'finished_product', '00000000-0000-0000-0000-0000000000a1' from purchase_lines where batch_number='OLD-77';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('load with used stock cannot be undone', $q$select undo_opening_load((select id from opening_loads where load_no='OPN-0001'))$q$, 'already been used');

\echo '===== closing blocks loading and undo; re-open restores'
select t_ok('admin closes', $q$select set_opening_stock_open(false)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_fail('load refused when closed', $q$select t_load('packaging','[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"receipt_date":"2026-03-01"}]')$q$, 'closed');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_fail('undo refused when closed', $q$select undo_opening_load((select id from opening_loads limit 1))$q$, 'closed');
select t_ok('admin re-opens', $q$select set_opening_stock_open(true)$q$);
select t_check('open again', (select is_open from opening_stock_settings));

\echo '===== purge clears loads and counters'
reset role;
select t_check('purge runs', (select count(*) from purge_test_data()) > 0);
select t_check('no loads, no system vendor left', (select count(*) from opening_loads) = 0 and (select count(*) from vendors) = 0);
select t_check('load counter restarted', (select last_value from opening_load_seq) = 1 and not (select is_called from opening_load_seq));
