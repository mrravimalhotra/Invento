-- Phase 7 evidence (read-only; run in the Supabase SQL editor at your convenience, one block at a time).
-- SCAN-P7-02: how big the Reports page is today.
select 'purchase_lines (active, submitted)' as what, count(*) from purchase_lines where active and pushed_at is not null
union all select 'purchase_lines legacy among them', count(*) from purchase_lines where active and pushed_at is not null and is_legacy
union all select 'quality_checks', count(*) from quality_checks
union all select 'finished_product_batches', count(*) from finished_product_batches
union all select 'items (raw, active)', count(*) from items where category='raw' and active
union all select 'stock_balance rows', count(*) from stock_balance;
-- SCAN-P7-03: lines whose draft date and submission date fall in different months.
select count(*) as lines_where_received_month_differs
from purchase_lines where active and pushed_at is not null
  and date_trunc('month', created_at at time zone 'Asia/Kolkata') <> date_trunc('month', pushed_at at time zone 'Asia/Kolkata');
-- SCAN-P7-01: QC rows on Production raw material (these show "-" in the QC Register batch column).
select count(*) as production_rm_qc_rows from quality_checks where production_batch_id is not null;

-- SCAN-P7-09: what the Dashboard "Inventory movement" chart adds up. Last 30 days, grouped by unit.
-- The chart sums every row of a day regardless of unit: a day's "Stock In" is the sum of the push rows and "Stock Out" the rest.
select unit, event_type, coalesce(reference_type,'-') as reason, count(*) as rows, sum(quantity) as total
from inventory_ledger where event_at >= now() - interval '30 days'
group by 1,2,3 order by 1,2,3;
-- SCAN-P7-08: approved raw material batches with stock left whose retest or expiry date has already passed (not on the Dashboard).
select count(*) filter (where expiry_date < current_date) as expired_with_stock,
       count(*) filter (where retest_date < current_date) as retest_overdue_with_stock
from batch_ageing where kind in ('raw','production_raw');

-- SCAN-P7-14: names and texts that contain a character the PDF font cannot print (outside the Western European set).
-- Any count above 0 means that text prints garbled in the table PDFs, COA and intimation slips.
select 'items.name' as field, count(*) from items where name ~ '[^\x01-\xff]'
union all select 'vendors.name', count(*) from vendors where name ~ '[^\x01-\xff]'
union all select 'mfr_definitions.name', count(*) from mfr_definitions where name ~ '[^\x01-\xff]'
union all select 'items.botanical_alias', count(*) from items where coalesce(botanical_alias,'') ~ '[^\x01-\xff]';

-- SCAN-P7-13 and SCAN-P7-15: reproductions run on the developer machine with the same jsPDF and autoTable the app uses (not SQL).
--   15-column Stock Statement table in portrait A4: item code "RM-00031" breaks as "RM-000 / 31", "1,250.5" as "1,250. / 5", headings split ("Purchas / ed").
--   Large PDF (7 columns): 2,000 rows = 56 pages, 1 s; 10,000 rows = 278 pages, 4 s, 252 MB; 30,000 rows = 834 pages, 11 s, 507 MB (extrapolated: 90,000 rows is about 2,500 pages and 1.5 GB in the browser).
-- SCAN-P7-14: text with ₹, arrows, macron letters or Hindi prints garbled: "Total value (₹)" prints "Total value ( ¹)", "Brahmī Ghṛta" prints "Brahm+ Gh[ta".

-- SCAN-P7-21 (run on the developer machine, not SQL): (-0.0001).toLocaleString("en-IN",{maximumFractionDigits:3}) gives "-0"; (0.0004) gives "0"; (0.0005) gives "0.001".


-- ============================================================
-- SCAN-P7-25 / SCAN-P7-02: LOCAL SCALE TEST. Run ONLY on a scratch copy of the seeded test database, never a real one.
-- Generator (about 25 s) then the timed queries; results seen on a 2-core test machine (superuser first, then as a signed-in user):
--   stock_balance 133 ms (2,701 rows) / 184 ms with row rules; item_position 293 ms; batch_ageing all 1,366 ms (74,930 rows), 306-399 ms per page;
--   purchase_line_qc all 424 ms (92,003 rows), 320 ms per page; current_qc_approvals 87 ms; dashboard_qc_counts 83 ms;
--   stock_statement 30 days 778 ms / 1 year 1,018 ms / all 1,029 ms; inventory_ledger_with_balance no filter 430 ms, one item 11 ms;
--   Reports page-shaped reads (purchase lines, QC): 100 ms and 70 ms per 1,000-row page at offset 91,000; Dashboard 30-day ledger: 46,837 rows.
-- ============================================================
-- ---- generator ----
\timing off
set session_replication_role = replica;
-- vendors
insert into vendors(vendor_code,name) select 'PV-'||g,'Perf Vendor '||g from generate_series(1,300) g;
-- items: 2200 raw + 500 packaging
insert into items(item_code,name,category,unit,low_stock_threshold,active,created_at)
select case when g<=2200 then 'PRM-' else 'PPK-' end||g, 'Perf item '||g, case when g<=2200 then 'raw' else 'packaging' end, case when g<=2200 then 'kg' else 'nos' end,
  case when g%5=0 then 50 end, true, now()-(g||' hours')::interval
from generate_series(1,2700) g;
-- purchase orders 12000
insert into purchase_orders(po_number,vendor_id,invoice_number,invoice_date,status,submitted_at,created_at)
select 'PPO-'||g,(select id from vendors where vendor_code='PV-'||(1+g%300)),'INV'||g,current_date-(g%700),'submitted',now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval
from generate_series(1,12000) g;
create temp table _po as select id, row_number() over (order by po_number) rn from purchase_orders where po_number like 'PPO-%';
create temp table _it as select id, row_number() over (order by item_code) rn, category from items where item_code like 'PRM-%' or item_code like 'PPK-%';
create index on _po(rn); create index on _it(rn);
-- purchase lines 92000
insert into purchase_lines(purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,unit_price,gst_pct,expiry_date,created_at,pushed_at,live_remaining_qty,is_legacy)
select (select id from _po where rn=1+g%12000),(select id from _it where rn=1+(g*7)%2700),'PB-'||g,100+(g%50),'kg',1,50+(g%30),5,current_date+(g%900)-300,now()-((g%700)||' days')::interval,now()-((g%700)||' days')::interval,(g%60)+1,(g%10)<8
from generate_series(1,92000) g;
-- QC
insert into quality_checks(ar_number,purchase_line_id,item_id,sample_qty,sample_unit,expiry_date,status,reviewed_at,retest_period_days,retest_date,created_at,is_retest,is_legacy)
select 'PAR-'||row_number() over (), pl.id, pl.item_id, 1,'kg', pl.expiry_date,'approved', pl.created_at, 365, pl.expiry_date-30, pl.created_at, false, pl.is_legacy
from purchase_lines pl where pl.batch_number like 'PB-%';
-- ledger: one push per line + 1M pulls
insert into inventory_ledger(event_type,item_id,purchase_line_id,quantity,unit,reference_type,event_at)
select 'push', item_id, id, quantity,'kg','purchase', created_at from purchase_lines where batch_number like 'PB-%';
insert into inventory_ledger(event_type,item_id,purchase_line_id,quantity,unit,reference_type,event_at)
select 'pull', pl.item_id, pl.id, 0.5+(g%7),'kg', (array['fp_packaging_pull','qc_sample','packaging','finished_product'])[1+g%4], now()-((g%700)||' days')::interval-((g%1440)||' minutes')::interval
from generate_series(1,1000000) g join purchase_lines pl on pl.batch_number='PB-'||(1+g%92000);

-- ---- queries ----
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
