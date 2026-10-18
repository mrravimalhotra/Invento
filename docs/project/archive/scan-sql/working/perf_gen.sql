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
