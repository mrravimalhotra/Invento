\set ON_ERROR_STOP off
\pset footer off
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('F1 confirm batch 1 (draft -> in_process)', $q$update finished_product_batches set status='in_process' where batch_number like '%-01/26'$q$);
select t_ok('F2 change target qty of the running batch to 99999', $q$update finished_product_batches set target_qty=99999 where batch_number like '%-01/26'$q$);
select t_ok('F2b change start date to 2019', $q$update finished_product_batches set batch_start_date='2019-01-01' where batch_number like '%-01/26'$q$);
select t_ok('F2c change batch number of the running batch', $q$update finished_product_batches set batch_number='FP-00001-77/26' where batch_number like '%-01/26'$q$);
select t_ok('F2d change mfr_version of the running batch', $q$update finished_product_batches set mfr_version=9 where batch_number like '%-77/26'$q$);
select t_ok('F5 cancel a running batch', $q$update finished_product_batches set status='cancelled' where batch_number like '%-77/26'$q$);
select t_ok('F3a complete: finish date in the future', $q$update finished_product_batches set status='complete_awaiting_qc', batch_yield=9, finish_date='2031-01-01', expiry_month='2033-01-31', qc_sample_qty=0.1, stability_qty=0.1 where batch_number like '%-77/26'$q$);
select t_ok('F3b complete: expiry before finish date', $q$update finished_product_batches set status='complete_awaiting_qc', batch_yield=9, finish_date='2026-10-10', expiry_month='2025-01-31', qc_sample_qty=0.1, stability_qty=0.1 where batch_number like '%-77/26'$q$);
reset role;
select 'state after F3: ' || status || ' fin=' || coalesce(finish_date::text,'-') || ' exp=' || coalesce(expiry_month::text,'-') from finished_product_batches where batch_number like '%-77/26';
-- put back
update finished_product_batches set status='in_process', finish_date=null, expiry_month=null, batch_yield=null, qc_sample_qty=null, stability_qty=null where batch_number like '%-77/26';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('F4 complete with yield 5000 kg on a 99999-target... use yield 5000 (batch of 10kg recipe 5kg input)', $q$update finished_product_batches set status='complete_awaiting_qc', batch_yield=5000, finish_date='2026-10-10', expiry_month='2028-10-31', qc_sample_qty=1, stability_qty=1 where batch_number like '%-77/26'$q$);
select t_ok('F7 complete but samples exceed yield (second batch)', $q$update finished_product_batches set status='in_process' where batch_number like '%-03/26'$q$);
select t_ok('F7b samples exceed yield', $q$update finished_product_batches set status='complete_awaiting_qc', batch_yield=1, finish_date='2026-10-10', expiry_month='2028-10-31', qc_sample_qty=2, stability_qty=1 where batch_number like '%-03/26'$q$);
reset role;
select 'yield pct stored for 77: ' || actual_yield_pct from finished_product_batches where batch_number like '%-77/26';
-- MFR variants
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('G0 create second MFR (unapproved)', $q$select * from create_mfr_definition('P52 Unapproved', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb)$q$);
reset role;
select 'unapproved mfr id=' || id from mfr_definitions where name='P52 Unapproved';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('G1 draft batch against an UNAPPROVED MFR', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','FP-UNAPP-01/26','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-10'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.1}]'::jsonb)$q$,(select id from mfr_definitions where name='P52 Unapproved')));
reset role;
update mfr_definitions set active=false where name='P52 Syrup';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('G2 draft batch against a DEACTIVATED MFR', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','FP-DEACT-01/26','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-10'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.1}]'::jsonb)$q$,(select id from mfr_definitions where name='P52 Syrup')));
select t_ok('G3 deactivated MFR: confirm existing draft #3 anyway', $q$update finished_product_batches set status='in_process' where batch_number like '%-03/26'$q$);
reset role;
select 'batches: ' || string_agg(batch_number||':'||status, ', ' order by batch_number) from finished_product_batches;
