\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
\echo === create MFR with batch size unit "tonne" (not in the unit list)
select * from create_mfr_definition('Unit test MFR', 10, 'tonne', null, '[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg"}]'::jsonb, 'domestic');
reset role;
select 'stored unit: ' || batch_size_unit from mfr_definitions where name='Unit test MFR';
rollback;
