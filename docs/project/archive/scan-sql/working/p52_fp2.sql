\set ON_ERROR_STOP off
\pset footer off
reset role;
select 'b1=' || (select id from finished_product_batches where batch_number like '%-01/26') ;
create temp table _b as select batch_number bn, id from finished_product_batches;
grant all on _b to public;
-- 1. recipe is not enforced by the database
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('D1 draft for 1000 kg target using 0.5 kg of the one recipe item (recipe says 5 kg per 10 kg)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-D1','mfr_definition_id',%L,'mfr_version',1,'target_qty',1000,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.5}]'::jsonb)$q$,(select id from mfr_definitions limit 1)));
select t_ok('D2 draft whose component is a different item than any recipe line (the FP-T0001 item itself?)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-D2','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"00000000-0000-0000-0000-0000000000e1","quantity":1}]'::jsonb)$q$,(select id from mfr_definitions limit 1)));
select t_ok('D3 batch with a made-up batch number "HELLO"', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','HELLO','mfr_definition_id',%L,'mfr_version',99,'target_qty',10,'unit','kg','batch_start_date','2020-01-01'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.1}]'::jsonb)$q$,(select id from mfr_definitions limit 1)));
reset role;
select 'drafts now: ' || string_agg(batch_number||'/v'||mfr_version||'/'||target_qty||'/'||batch_start_date,' ; ') from finished_product_batches;
-- cleanup these three so numbering test is clean
delete from finished_product_batches where batch_number in ('ZZ-D1','ZZ-D2','HELLO');
-- 2. lazy auto-cancel: age batch 2 by 40 minutes, see what a plain list read does
update finished_product_batches set created_at = now() - interval '40 minutes' where batch_number like '%-02/26';
select 'e-remaining before expire: ' || live_remaining_qty from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
select 'on hand before expire: ' || on_hand from stock_balance where item_id='00000000-0000-0000-0000-0000000000c3';
select 'status of #2 (stale, nobody opened a page): ' || status from finished_product_batches where batch_number like '%-02/26';
select 'stock position view says on_hand: ' || on_hand from item_position where item_id='00000000-0000-0000-0000-0000000000c3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('E1 QC reviewer (no FP role) calls expire_stale_fp_drafts()', $q$select expire_stale_fp_drafts()$q$);
reset role;
select 'status of #2 after: ' || status from finished_product_batches where batch_number like '%-02/26';
select 'e-remaining after: ' || live_remaining_qty from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
-- 3. numbering after a cancelled batch is deleted
select 'next number now (b1, b3 exist, b2 cancelled): ' || batch_number from get_next_fp_batch_number((select id from mfr_definitions limit 1));
delete from finished_product_components where finished_product_batch_id=(select id from finished_product_batches where batch_number like '%-02/26');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('N1 admin deletes cancelled batch 2', $q$delete from finished_product_batches where batch_number like '%-02/26'$q$);
reset role;
select 'batches left: ' || string_agg(batch_number,', ' order by batch_number) from finished_product_batches;
select 'next number after delete: ' || batch_number from get_next_fp_batch_number((select id from mfr_definitions limit 1));
