\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
select 'lines: ' || count(*) filter (where po.status='submitted') || ' submitted; qc records: ' || (select count(*) from quality_checks) from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === QC Checker writes off 0.5 kg of a batch not yet approved by QC, reason = single space
select t_ok('C wastage on not-yet-approved batch by quality_checker, reason one space', $q$select record_wastage(null, (select pl.id from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.status='submitted' and pl.unit='kg' order by pl.created_at limit 1), 0.5, 'kg', ' ')$q$);
reset role;
select 'wastage rows: ' || count(*) || ', reason blank after trim: ' || count(*) filter (where coalesce(btrim(reason),'')='') from inventory_ledger where event_type='wastage';
select 'qc status of that line: ' || coalesce((select string_agg(distinct status,',') from quality_checks),'no QC record');
rollback;
