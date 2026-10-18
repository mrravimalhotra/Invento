\set ON_ERROR_STOP off
\pset footer off
reset role;
create temp table _m as select id from mfr_definitions where name='P52 Syrup'; grant all on _m to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('T1 component with item_id of the FINISHED product while batch is a raw batch (wrong item for that batch)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T1','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c9","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.1}]'::jsonb)$q$,(select id from _m)));
select t_ok('T2 component zero quantity', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T2','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0}]'::jsonb)$q$,(select id from _m)));
select t_ok('T3 component negative quantity', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T3','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":-3}]'::jsonb)$q$,(select id from _m)));
select t_ok('T4 more than the batch holds (100 kg)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T4','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":100}]'::jsonb)$q$,(select id from _m)));
select t_ok('T5 many decimals 1.66666666666667 kg', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T5','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":1.66666666666667}]'::jsonb)$q$,(select id from _m)));
select t_ok('T6 component edit directly', $q$update finished_product_components set quantity=0.001 where finished_product_batch_id=(select id from finished_product_batches where batch_number='ZZ-T5')$q$);
select t_ok('T7 component delete directly', $q$delete from finished_product_components where finished_product_batch_id=(select id from finished_product_batches where batch_number='ZZ-T5')$q$);
reset role;
select 'T1 stored: ' || fpc.quantity || ' of item ' || i.item_code || ' pulled from line of ' || (select item_code from items where id=pl.item_id) from finished_product_components fpc join items i on i.id=fpc.item_id join purchase_lines pl on pl.id=fpc.purchase_line_id where finished_product_batch_id=(select id from finished_product_batches where batch_number='ZZ-T1');
select 'T5 stored qty: ' || quantity from finished_product_components where finished_product_batch_id=(select id from finished_product_batches where batch_number='ZZ-T5');
select 'ledger rows for T1: ' || string_agg(i.item_code||' '||l.event_type||' '||l.quantity, ' ; ') from inventory_ledger l join items i on i.id=l.item_id where l.reference_id=(select id from finished_product_batches where batch_number='ZZ-T1');
select 'line live remaining: ' || live_remaining_qty from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
select 'stock on hand c3 / c9: ' || (select on_hand from stock_balance where item_id='00000000-0000-0000-0000-0000000000c3') || ' / ' || coalesce((select on_hand::text from stock_balance where item_id='00000000-0000-0000-0000-0000000000c9'),'none');
-- inactive item
update items set active=false where id='00000000-0000-0000-0000-0000000000c3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('T8 component of an INACTIVE item', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-T8','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":0.1}]'::jsonb)$q$,(select id from _m)));
