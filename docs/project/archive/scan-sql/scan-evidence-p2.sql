-- Scan evidence, Phase 2 (P2.1 Items). Run on a SCRATCH copy of the local test database only (never on live).
-- Needs the same seed as scan-evidence-p1.sql (users a1..a6, item c3 raw with stock, c9 finished product, submitted PO d1).
-- Prints ALLOWED or REFUSED per test.

\set ON_ERROR_STOP off
\pset footer off
reset role;
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'ALLOWED | % (as %)', p_label, current_user;
exception when others then raise notice 'REFUSED | % -> %', p_label, sqlerrm; end $$;
grant execute on function public.t_ok(text,text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('A raw item with stock -> category packaging', $q$update items set category='packaging' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('B finished product -> category raw', $q$update items set category='raw' where id='00000000-0000-0000-0000-0000000000c9'$q$);
select t_ok('C deactivate item with stock', $q$update items set active=false where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('D raw item without item type', $q$update items set item_type_id=null where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('E negative low-stock threshold', $q$update items set low_stock_threshold=-5 where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('F change unit with stock', $q$update items set unit='g' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('G insert item with a made-up code', $q$insert into items (item_code,name,category,unit) values ('RM-001','Fake code','packaging','kg')$q$);
select t_ok('H new purchase line for an inactive item', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','X-INACT',5,'kg',0,0,0)$q$);
reset role;
select 'after: ' || item_code||' '||category||' active='||active||' thr='||coalesce(low_stock_threshold::text,'null')||' type='||(item_type_id is not null) from items order by item_code;
\echo === pairing break (rolled back)
reset role;
begin;
update items set category='raw', active=true, item_type_id=(select id from item_types limit 1) where id='00000000-0000-0000-0000-0000000000c3';
update items set category='processed' where id='00000000-0000-0000-0000-0000000000c9';
update items set production_rm_item_id='00000000-0000-0000-0000-0000000000c3' where id='00000000-0000-0000-0000-0000000000c9';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('I paired production RM switched raw -> packaging', $q$update items set category='packaging' where id='00000000-0000-0000-0000-0000000000c3'$q$);
reset role;
select 'pair now: FP points to category=' || (select category from items where id=(select production_rm_item_id from items where id='00000000-0000-0000-0000-0000000000c9'));
rollback;

-- ===== PART 2: P2.3 MFR batch size unit (SCAN-P2-09) =====
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo === create MFR with batch size unit "tonne" (not in the unit list)
select * from create_mfr_definition('Unit test MFR', 10, 'tonne', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb, 'domestic');
reset role;
select 'stored unit: ' || batch_size_unit from mfr_definitions where name='Unit test MFR';
rollback;

-- ===== PART 3: P2.3 Excel reader timing (SCAN-P2-06), run with node =====
-- const E=require('exceljs'); build a sheet with 2 rows and a cell at A1000000, load it, then time
--   for (r=2; r<=sheet.rowCount; r++) sheet.getRow(r).getCell(c)  -> about 6 s, 1.9 GB heap
--   sheet.eachRow({includeEmpty:false}, ...)                       -> 38 ms, 14 MB heap

-- ===== PART 4: P2.4 opening stock, approved row already past expiry (not a finding: lands as expired) =====
-- Reset item c3 first: update items set category='raw', active=true where id='00000000-0000-0000-0000-0000000000c3';
\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
update opening_stock_settings set is_open = true where not is_open;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo === A: approved batch whose expiry date is already past, retest date AFTER expiry
select * from load_opening_stock('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-EXP-1","quantity":10,"receipt_date":"2024-01-10","expiry_date":"2025-01-10","unit_price":null,"gst_pct":null,"qc_status":"approved","old_ar":"OLD-AR-1","approval_date":"2024-01-20","retest_date":"2026-06-01","retests_done":0}]'::jsonb);
reset role;
select 'stored: expiry=' || pl.expiry_date || ' retest_days=' || q.retest_period_days || ' status=' || q.status || ' checker=reviewer? ' || (q.checker_by = q.reviewed_by) from purchase_lines pl join quality_checks q on q.purchase_line_id = pl.id where pl.batch_number = 'OLD-EXP-1';
select 'batch qc status: ' || coalesce(qc_status,'none') from purchase_batch_status where purchase_line_id = (select id from purchase_lines where batch_number='OLD-EXP-1');
rollback;

-- ===== PART 5: P2.5 profile display name (SCAN-P2-12). 'rename someone else' prints ALLOWED but changes 0 rows (row-level security) =====
\set ON_ERROR_STOP off
\pset footer off
reset role;
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'ALLOWED | % (as %)', p_label, current_user;
exception when others then raise notice 'REFUSED | % -> %', p_label, sqlerrm; end $$;
grant execute on function public.t_ok(text,text) to authenticated;
begin;
insert into profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000a1','Dr. Real Admin'),('00000000-0000-0000-0000-0000000000a2','Plain Inventory User') on conflict (id) do update set full_name = excluded.full_name;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('rename own profile to the admin''s exact name', $q$update profiles set full_name='Dr. Real Admin' where id='00000000-0000-0000-0000-0000000000a2'$q$);
select t_ok('5000-character display name', $q$update profiles set full_name=repeat('x',5000) where id='00000000-0000-0000-0000-0000000000a2'$q$);
select t_ok('rename someone else', $q$update profiles set full_name='Hacked' where id='00000000-0000-0000-0000-0000000000a1'$q$);
reset role;
select 'names now: ' || string_agg(full_name::varchar(30), ' | ') from profiles where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
rollback;
