\set ON_ERROR_STOP off
\pset footer off
reset role;
update opening_stock_settings set is_open = true where not is_open;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select load_no from load_opening_stock('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-EXP-42","quantity":10,"receipt_date":"2024-01-10","expiry_date":"2025-01-10","unit_price":null,"gst_pct":null,"qc_status":"approved","old_ar":"OLD-AR-42","approval_date":"2024-01-20","retest_date":"2026-06-01","retests_done":0}]'::jsonb);
\echo === A: batch expired in Jan 2025, retest date passed. Start a retest anyway
select t_ok('A start_retest on an EXPIRED batch', $q$select start_retest((select id from purchase_lines where batch_number='OLD-EXP-42'), null, 0.5, 'kg')$q$);
reset role;
select 'retest QC record: ' || count(*) from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('B round 1 approve retest', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='OLD-EXP-42')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('C round 2 approve with expiry two years AFTER the original expiry (2027-06-01)', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=180, expiry_date='2027-06-01' where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='OLD-EXP-42')$q$);
reset role;
select 'batch status after: ' || s.qc_status || ' retest=' || coalesce(s.retest_date::text,'-') || ' expiry=' || coalesce(s.expiry_date::text,'-') from purchase_batch_status s join purchase_lines pl on pl.id=s.purchase_line_id where pl.batch_number='OLD-EXP-42';
select 'usable now: ' || usable from item_stock_status where item_id='00000000-0000-0000-0000-0000000000c3';
