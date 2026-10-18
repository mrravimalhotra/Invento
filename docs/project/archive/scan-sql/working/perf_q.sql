\timing on
\pset format unaligned
\pset tuples_only on
select 'stock_balance all', count(*) from stock_balance;
select 'item_position all', count(*) from item_position;
select 'batch_ageing all', count(*) from batch_ageing;
select 'purchase_line_qc all', count(*) from purchase_line_qc;
select 'current_qc_approvals', count(*) from current_qc_approvals;
select 'dashboard_qc_counts', count(*) from dashboard_qc_counts();
\timing on
\pset format unaligned
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'rls batch_ageing p1', count(*) from (select * from batch_ageing order by batch_id offset 0 limit 1000) x;
select 'rls batch_ageing p75', count(*) from (select * from batch_ageing order by batch_id offset 74000 limit 1000) x;
select 'rls purchase_line_qc p92', count(*) from (select * from purchase_line_qc order by purchase_line_id offset 91000 limit 1000) x;
select 'rls reports purchase p92', count(*) from (select pl.batch_number, pl.quantity, pl.unit, pl.live_remaining_qty, pl.created_at, i.name, po.po_number, v.name from purchase_lines pl left join items i on i.id=pl.item_id left join purchase_orders po on po.id=pl.purchase_order_id left join vendors v on v.id=po.vendor_id where pl.active and pl.pushed_at is not null order by pl.created_at desc, pl.id offset 91000 limit 1000) x;
select 'rls reports qc p92', count(*) from (select q.ar_number,q.status,i.name,pl.batch_number from quality_checks q left join items i on i.id=q.item_id left join purchase_lines pl on pl.id=q.purchase_line_id order by q.created_at desc, q.id offset 91000 limit 1000) x;
select 'rls stock_balance all', count(*) from stock_balance;
select 'rls ledger 30d rows', count(*) from inventory_ledger where event_at >= now()-interval '30 days';
\timing on
\pset format unaligned
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'stock_statement 30d', count(*) from stock_statement(current_date-30, current_date, null);
select 'stock_statement 1y', count(*) from stock_statement(current_date-365, current_date, null);
select 'stock_statement all time', count(*) from stock_statement(current_date-800, current_date, null);
select 'dashboard ledger30 deep page', count(*) from (select l.event_type,l.event_at,l.quantity,i.item_code,pl.batch_number from inventory_ledger l left join items i on i.id=l.item_id left join purchase_lines pl on pl.id=l.purchase_line_id where l.event_at>=now()-interval '30 days' order by l.event_at, l.seq offset 46000 limit 1000) x;
select 'trace_batch purchase', count(*) from (select trace_batch('purchase', (select id from purchase_lines where batch_number='PB-5000'))) x;
select 'item ledger page (item)', count(*) from (select * from inventory_ledger where item_id=(select item_id from purchase_lines where batch_number='PB-5000') order by event_at desc, seq desc limit 200) x;
\timing on
\pset format unaligned
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select 'ledger view no filter limit 1000', count(*) from (select * from inventory_ledger_with_balance order by event_at desc, seq desc limit 1000) x;
select 'ledger view date range 7d', count(*) from (select * from inventory_ledger_with_balance where event_at >= now()-interval '7 days' order by event_at desc, seq desc limit 1000) x;
select 'ledger view reason filter', count(*) from (select * from inventory_ledger_with_balance where reference_type='qc_sample' order by event_at desc, seq desc limit 1000) x;
select 'ledger view one item', count(*) from (select * from inventory_ledger_with_balance where item_id=(select item_id from purchase_lines where batch_number='PB-5000') order by event_at desc, seq desc limit 1000) x;
select 'item_position one item', count(*) from item_position where item_id=(select item_id from purchase_lines where batch_number='PB-5000');
select 'audit-like count', count(*) from audit_log;
