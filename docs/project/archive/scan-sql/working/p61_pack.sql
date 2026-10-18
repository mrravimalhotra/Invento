\set ON_ERROR_STOP off
\pset footer off
reset role;
-- ids: FP-1 a6c136e1.. (approved), FP-3 adfaf27a.. (approved). packaging item c5 (nos, 87 in stock), raw c3, FP item 9aa093ba
create temp table _v as select 'ok'::text k; grant all on _v to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('K1 valid store issue: 2 kg of FP-1 into 4 packs, 4 bottles', $q$select create_packaging_issue('{"code":"PKG-SCAN-1","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":2,"unit_count":4,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":4,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K2 issue with NO packaging material at all', $q$select create_packaging_issue('{"code":"PKG-SCAN-2","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":1,"unit_count":2,"department":"store"}'::jsonb, '[]'::jsonb)$q$);
select t_ok('K3 unit count 1000 but only 0.5 kg of product consumed', $q$select create_packaging_issue('{"code":"PKG-SCAN-3","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"500 g","pack_size_qty":500,"pack_size_unit":"g","fp_qty_consumed":0.5,"unit_count":1000,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K4 a RAW material (RM-T0001) used as a packaging material', $q$select create_packaging_issue('{"code":"PKG-SCAN-4","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
select t_ok('K5 free-text code "XYZ" instead of the PKG series', $q$select create_packaging_issue('{"code":"XYZ","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K6 issue date in 2020, before the batch existed', $q$select create_packaging_issue('{"code":"PKG-SCAN-6","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store","issue_date":"2020-01-01"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K7 unit count negative', $q$select create_packaging_issue('{"code":"PKG-SCAN-7","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":-5,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select t_ok('K8 pack size says 500 ml but product is a kg item, qty 0', $q$select create_packaging_issue('{"code":"PKG-SCAN-8","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"nonsense","pack_size_qty":0,"pack_size_unit":"ml","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
reset role;
update finished_product_batches set status='in_process' where batch_number='FP-3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('K9 issue against a batch that is only In progress (not approved)', $q$select create_packaging_issue('{"code":"PKG-SCAN-9","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('K10 QC reviewer (no packaging role) issues', $q$select create_packaging_issue('{"code":"PKG-SCAN-10","finished_product_batch_id":"adfaf27a-0e4d-4113-b159-fb6b35926713","pack_size":"0.5 kg","pack_size_qty":0.5,"pack_size_unit":"kg","fp_qty_consumed":0.5,"unit_count":1,"department":"store"}'::jsonb, '[{"item_id":"00000000-0000-0000-0000-0000000000c5","quantity":1,"unit":"nos"}]'::jsonb)$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('K11 admin tries to delete an issue', $q$delete from packaging_issues where code='PKG-SCAN-1'$q$);
select t_ok('K12 admin tries to change an issue (fp_qty_consumed to 1)', $q$update packaging_issues set fp_qty_consumed=1 where code='PKG-SCAN-1'$q$);
reset role;
select 'issues now: ' || string_agg(code || '=' || fp_qty_consumed || '/' || unit_count, ', ' order by created_at) from packaging_issues where code like 'PKG-SCAN%' or code='XYZ';
select 'PKG-SCAN-1 still there with fp_qty_consumed ' || fp_qty_consumed from packaging_issues where code='PKG-SCAN-1';
select 'FP-1 packaged_qty: ' || packaged_qty from finished_product_batches where batch_number='FP-1';
select 'packaged item on hand: ' || coalesce((select on_hand::text from stock_balance where item_id='3e7f1a2d-c3de-48eb-b680-9fd0ffd5cd51'),'none');
select 'K4 ledger: ' || string_agg(i.item_code||' '||l.event_type||' '||l.quantity, '; ') from inventory_ledger l join items i on i.id=l.item_id join packaging_issues p on p.id=l.reference_id where p.code='PKG-SCAN-4';
