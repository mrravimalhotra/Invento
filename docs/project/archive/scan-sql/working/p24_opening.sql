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
