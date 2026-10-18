\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
insert into items (id,item_code,name,category,unit) values
 ('00000000-0000-0000-0000-00000000c501','PK-T501','Test bottle','packaging','nos'),
 ('00000000-0000-0000-0000-00000000c502','RM-T502','Test herb B','raw','kg'),
 ('00000000-0000-0000-0000-00000000c503','RM-T503','Inactive herb','raw','kg');
update items set active = false where id='00000000-0000-0000-0000-00000000c503';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('A recipe containing a PACKAGING item (bottle)', $q$select * from create_mfr_definition('Scan MFR A', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-00000000c501","quantity":5,"unit":"nos"},{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb)$q$);
select t_ok('B recipe with the SAME item on two lines', $q$select * from create_mfr_definition('Scan MFR B', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"},{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":3,"unit":"kg"}]'::jsonb)$q$);
select t_ok('C recipe with an INACTIVE item', $q$select * from create_mfr_definition('Scan MFR C', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-00000000c503","quantity":5,"unit":"kg"}]'::jsonb)$q$);
select t_ok('D recipe with an incompatible unit (litres for a kg item)', $q$select * from create_mfr_definition('Scan MFR D', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"ltr"}]'::jsonb)$q$);
select t_ok('E recipe in g for a kg item (conversion)', $q$select * from create_mfr_definition('Scan MFR E', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5000,"unit":"g"}]'::jsonb)$q$);
select t_ok('F name differing only by spaces / case ("scan  mfr e")', $q$select * from create_mfr_definition('scan mfr  e', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
select t_ok('G the batch size is 10 kg but recipe lines add to 5 kg (no check)', $q$select * from create_mfr_definition('Scan MFR G', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":1,"unit":"kg"}]'::jsonb)$q$);
reset role;
select 'MFR rows: ' || string_agg(name, ' | ' order by name) from mfr_definitions where name ilike 'scan mfr%';
select 'line E stored as: ' || l.quantity || ' ' || l.unit from mfr_lines l join mfr_definitions d on d.id=l.mfr_definition_id where d.name='Scan MFR E';
-- approval by the creator
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('H the creator approves their own MFR', $q$select * from approve_mfr_definition((select id from mfr_definitions where name='Scan MFR G'))$q$);
reset role;
select 'approved_by = created_by: ' || (approved_by = created_by) from mfr_definitions where name='Scan MFR G';
rollback;

-- ===== P5.2 Finished product batch flow (local scratch copy only; never run on a real database) =====
-- Steps D1..D3, E, F1..F5, G0..G3 are in three scripts kept with the scan:
--   p52_fp.sql   : approved MFR, three drafts (FIFO enforced: a newer batch refused while an older one has stock)
--   p52_fp2.sql  : D1 recipe ratio not enforced, D3 free-text number/version/old start date, E stale draft + lazy expire, N numbering after delete
--   p52_fp3.sql  : F1-F5 edits on a running batch, F3 future finish / expiry before finish, F4 yield 5000 kg, G1-G3 unapproved/inactive MFR
-- ##### p52_fp.sql
\set ON_ERROR_STOP off
\pset footer off
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
create temp table _s(k text primary key, v text);
grant all on _s to public;
insert into _s select 'mfr', id::text from create_mfr_definition('P52 Syrup', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb);
select approve_mfr_definition((select v::uuid from _s where k='mfr'));
reset role;
select 'MFR approved, fp item = ' || (select item_code from items where id=finished_product_item_id) from mfr_definitions where id=(select v::uuid from _s where k='mfr');
select 'first number: ' || batch_number || ' / ' || short_batch_no from get_next_fp_batch_number((select v::uuid from _s where k='mfr'));

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
-- three batches
select t_ok('create batch 1 (2 kg from e2)', format($q$insert into _s select 'b1', create_finished_product_batch(jsonb_build_object('batch_number',(select batch_number from get_next_fp_batch_number(%L::uuid)),'short_batch_no',(select short_batch_no from get_next_fp_batch_number(%L::uuid)),'mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":2}]'::jsonb)::text$q$, (select v from _s where k='mfr'),(select v from _s where k='mfr'),(select v from _s where k='mfr')));
select t_ok('create batch 2', format($q$insert into _s select 'b2', create_finished_product_batch(jsonb_build_object('batch_number',(select batch_number from get_next_fp_batch_number(%L::uuid)),'short_batch_no',(select short_batch_no from get_next_fp_batch_number(%L::uuid)),'mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":2}]'::jsonb)::text$q$, (select v from _s where k='mfr'),(select v from _s where k='mfr'),(select v from _s where k='mfr')));
select t_ok('create batch 3', format($q$insert into _s select 'b3', create_finished_product_batch(jsonb_build_object('batch_number',(select batch_number from get_next_fp_batch_number(%L::uuid)),'short_batch_no',(select short_batch_no from get_next_fp_batch_number(%L::uuid)),'mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date',to_char(now(),'YYYY-MM-DD')), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":2}]'::jsonb)::text$q$, (select v from _s where k='mfr'),(select v from _s where k='mfr'),(select v from _s where k='mfr')));
reset role;
select 'e3 remaining after 3 drafts: ' || live_remaining_qty from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
select batch_number, short_batch_no, status from finished_product_batches order by created_at, batch_number;
-- ##### p52_fp2.sql
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
-- ##### p52_fp3.sql
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

-- ===== P5.3 Compose, FIFO and consumption (local scratch copy only) =====
-- ##### p53_comp.sql
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
-- ##### p53_dust.sql
\set ON_ERROR_STOP off
\pset footer off
reset role;
create temp table _s(k text primary key, v text); grant all on _s to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into _s select 'mfr', id::text from create_mfr_definition('P53 Syrup', 10, 'kg', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb);
select approve_mfr_definition((select v::uuid from _s where k='mfr'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('X'||g, format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-X%s','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"69a6326c-dac4-424a-a126-ed467c062795","quantity":3.16666666666666}]'::jsonb)$q$, g, (select v from _s where k='mfr'))) from generate_series(1,3) g;
reset role;
select 'OLD-EXP-42 remaining now: ' || live_remaining_qty from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('Y1 draw 1 kg from the next batch (RM-T0001-02/26)', format($q$select create_finished_product_batch(jsonb_build_object('batch_number','ZZ-Y1','mfr_definition_id',%L,'mfr_version',1,'target_qty',10,'unit','kg','batch_start_date','2026-10-11'), '[{"item_id":"00000000-0000-0000-0000-0000000000c3","purchase_line_id":"00000000-0000-0000-0000-0000000000e2","quantity":1}]'::jsonb)$q$, (select v from _s where k='mfr')));
reset role;
select 'candidate rule used by screen (live_remaining_qty > 0): ' || (live_remaining_qty > 0) || ' ; shown as ' || round(live_remaining_qty,3) from purchase_lines where id='69a6326c-dac4-424a-a126-ed467c062795';
select 'Ageing lists it: ' || count(*) from batch_ageing where batch_id='69a6326c-dac4-424a-a126-ed467c062795';
