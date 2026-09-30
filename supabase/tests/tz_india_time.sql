\set ON_ERROR_STOP on
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
select t_check('new session runs on India time', current_setting('TimeZone') = 'Asia/Kolkata');
select t_check('a moment at 20:00 UTC on 4 Oct is 5 Oct in the database', ('2026-10-04 20:00:00+00'::timestamptz)::date = '2026-10-05');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','a@t');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',10,'kg',0,0,0);
insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-0000000000f1','AR-T','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg');
update quality_checks set reviewed_at='2026-10-04 19:30:00+00', retest_period_days=30 where id='00000000-0000-0000-0000-0000000000f1';
select t_check('approved 01:00 IST on 5 Oct + 30 days → retest date 4 Nov (was 3 Nov)', (select retest_date from quality_checks where id='00000000-0000-0000-0000-0000000000f1') = '2026-11-04');
set timezone = 'UTC';
update quality_checks set retest_period_days=30 where id='00000000-0000-0000-0000-0000000000f1';
select t_check('retest date is the same even if a session is on UTC', (select retest_date from quality_checks where id='00000000-0000-0000-0000-0000000000f1') = '2026-11-04');
reset timezone;
insert into inventory_ledger (event_type,item_id,quantity,unit,event_at,reason) values ('push','00000000-0000-0000-0000-0000000000c3',1,'kg','2026-09-13 19:00:00+00','tz-a'),('push','00000000-0000-0000-0000-0000000000c3',1,'kg','2026-09-14 20:00:00+00','tz-b');
select t_check('ledger filter 14→14 (IST bounds): 00:30 IST on 14th in, 01:30 IST on 15th out', (select string_agg(reason, ',') from inventory_ledger where event_at >= '2026-09-14T00:00:00+05:30' and event_at <= '2026-09-14T23:59:59.999+05:30') = 'tz-a');
select t_check('a filter without an offset now also means the IST day', (select string_agg(reason, ',') from inventory_ledger where event_at >= '2026-09-14T00:00:00' and event_at <= '2026-09-14T23:59:59.999') = 'tz-a');
