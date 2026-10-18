\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
\echo === QC Reviewer (no purchase or inventory role) writes off stock with a blank reason
select t_ok('A wastage by qc_reviewer, reason empty', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', '')$q$);
select t_ok('B wastage, reason NULL', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3', (select id from purchase_lines order by created_at limit 1), 0.5, 'kg', null)$q$);
reset role;
select 'wastage rows: ' || count(*) || ', blank reasons: ' || count(*) filter (where coalesce(btrim(reason),'') = '') from inventory_ledger where event_type = 'wastage';
rollback;
