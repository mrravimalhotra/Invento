\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
\echo === Inventory Manager edits the stored remaining quantity directly (submitted PO line)
select t_ok('A set live_remaining_qty=999 on a submitted line', $q$update purchase_lines set live_remaining_qty = 999 where id = (select pl.id from purchase_lines pl join purchase_orders po on po.id=pl.purchase_order_id where po.status='submitted' limit 1)$q$);
reset role;
select 'live_remaining_qty now: ' || max(live_remaining_qty) from purchase_lines;
select 'ledger net for that line: ' || coalesce(sum(case event_type when 'push' then quantity else -quantity end),0) from inventory_ledger where purchase_line_id = (select id from purchase_lines order by live_remaining_qty desc limit 1);
rollback;
