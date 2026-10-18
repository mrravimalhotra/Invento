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
