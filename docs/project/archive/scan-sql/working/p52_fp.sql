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
