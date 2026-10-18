\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
update opening_stock_settings set is_open = true where true;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select load_no from load_opening_stock('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-EXP-9","quantity":10,"receipt_date":"2024-01-10","expiry_date":"2030-01-10","unit_price":null,"gst_pct":null,"qc_status":"pending","old_ar":null,"approval_date":null,"retest_date":null,"retests_done":0}]'::jsonb);
\echo === Stock Statement for this month: the 10 kg opening load
select item_code, opening, purchased, other_in, closing from stock_statement(date_trunc('month', now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, 'raw') where item_code = 'RM-T0001';
\echo === Statement for last month (before the load)
select item_code, opening, purchased, closing from stock_statement((date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date, (date_trunc('month', now() at time zone 'Asia/Kolkata')::date - 1), 'raw') where item_code = 'RM-T0001';
rollback;
