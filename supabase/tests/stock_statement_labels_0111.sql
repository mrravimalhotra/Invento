\set ON_ERROR_STOP on
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS  | ok      | %', p_label;
exception when others then raise notice 'FAIL  | ok      | % -> %', p_label, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'FAIL  | blocked | % -> statement was ALLOWED', p_label;
exception when others then
  if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm;
  else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated;
create or replace function public.t_oh(p uuid) returns numeric language sql security definer as $$ select coalesce((select on_hand from stock_balance where item_id=p),0) $$;
grant execute on function public.t_oh(uuid) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c6','RM-T0002','Raw B (no activity)','raw','kg','00000000-0000-0000-0000-0000000000c1');


-- a row of the statement as text: opening|purchased|opening_load|produced|other_in|used|packaging|samples|wastage|rejected|other_out|closing
create or replace function public.t_st(p_item uuid, p_from date, p_to date) returns text language sql security definer as $$
  select format('%s|%s|%s|%s|%s|%s', trim_scale(opening), trim_scale(purchased), trim_scale(opening_load), trim_scale(other_in), trim_scale(rejected), trim_scale(closing))
    from public.stock_statement(p_from, p_to) where item_id = p_item $$;
grant execute on function public.t_st(uuid, date, date) to authenticated;
create or replace function public.t_day(p_off int, p_time text default '12:00') returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Kolkata')::date + p_off)::text || ' ' || p_time)::timestamp at time zone 'Asia/Kolkata' $$;
create or replace function public.t_d(p_off int) returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date + p_off $$;


\echo '===== set-up: a normal purchase, an opening load, a rejection and its write-off hand-back'
insert into opening_loads (id, load_no, kind, row_count) values ('00000000-0000-0000-0000-0000000000a9','OPN-T1','raw',1);
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date,opening_load_id) values
 ('00000000-0000-0000-0000-0000000000d2','PO-T2','00000000-0000-0000-0000-0000000000c2','INV-2',current_date,'00000000-0000-0000-0000-0000000000a9');
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',0,0,0),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','OB1',10,'kg',0,0,0);
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,event_at,purchase_line_id) values
 ('push','00000000-0000-0000-0000-0000000000c3',100,'kg','purchase',   t_day(-6),'00000000-0000-0000-0000-0000000000e1'),
 ('push','00000000-0000-0000-0000-0000000000c3',10, 'kg','purchase',   t_day(-5),'00000000-0000-0000-0000-0000000000e2'),
 ('pull','00000000-0000-0000-0000-0000000000c3',20, 'kg','qc_rejected',t_day(-3),'00000000-0000-0000-0000-0000000000e1'),
 ('push','00000000-0000-0000-0000-0000000000c3',8,  'kg','qc_rejected',t_day(-1),'00000000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;

\echo '===== P3-12'
select t_check('an opening load is in Opening load, not Purchased', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-5), t_d(-5)) = '100|0|10|0|0|110');
select t_check('a normal purchase is still Purchased', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-6), t_d(-6)) = '0|100|0|0|0|100');
select t_check('rejected 20 held, 8 handed back on write-off: Rejected shows 12 net, Other in 0', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-3), t_d(-1)) = '110|0|0|0|12|98');
select t_check('whole range closing = 98 = On hand', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-30), t_d(0)) = '0|100|10|0|12|98' and (select closing from stock_statement(t_d(-30), t_d(0)) where item_id='00000000-0000-0000-0000-0000000000c3') = t_oh('00000000-0000-0000-0000-0000000000c3'));
select t_check('opening + in - out = closing on every row', not exists (select 1 from stock_statement(t_d(-30), t_d(0)) s where s.opening + s.purchased + s.opening_load + s.produced + s.other_in - s.used_in_production - s.packaging - s.samples - s.wastage - s.rejected - s.other_out <> s.closing));
