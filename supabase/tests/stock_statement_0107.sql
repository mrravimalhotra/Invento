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


-- a row of the statement as text: opening|purchased|produced|other_in|used|packaging|samples|wastage|rejected|other_out|closing
create or replace function public.t_st(p_item uuid, p_from date, p_to date) returns text language sql security definer as $$
  select format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', trim_scale(opening), trim_scale(purchased), trim_scale(produced), trim_scale(other_in), trim_scale(used_in_production), trim_scale(packaging), trim_scale(samples), trim_scale(wastage), trim_scale(rejected), trim_scale(other_out), trim_scale(closing))
    from public.stock_statement(p_from, p_to) where item_id = p_item $$;
grant execute on function public.t_st(uuid, date, date) to authenticated;
create or replace function public.t_day(p_off int, p_time text default '12:00') returns timestamptz language sql as $$
  select (((now() at time zone 'Asia/Kolkata')::date + p_off)::text || ' ' || p_time)::timestamp at time zone 'Asia/Kolkata' $$;
create or replace function public.t_d(p_off int) returns date language sql as $$ select (now() at time zone 'Asia/Kolkata')::date + p_off $$;

\echo '===== set-up: ledger rows on known days (India time)'
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',0,0,0);
insert into inventory_ledger (event_type,item_id,quantity,unit,reference_type,event_at,purchase_line_id) values
 ('push','00000000-0000-0000-0000-0000000000c3',100,'kg','purchase',        t_day(-10),'00000000-0000-0000-0000-0000000000e1'),
 ('pull','00000000-0000-0000-0000-0000000000c3',30, 'kg','finished_product',t_day(-5),'00000000-0000-0000-0000-0000000000e1'),
 ('pull','00000000-0000-0000-0000-0000000000c3',2,  'kg','qc_sample',       t_day(-5),'00000000-0000-0000-0000-0000000000e1'),
 ('push','00000000-0000-0000-0000-0000000000c3',7,  'kg','fp_yield',        t_day(-4, '23:30'),'00000000-0000-0000-0000-0000000000e1'),
 ('push','00000000-0000-0000-0000-0000000000c3',1,  'kg','fp_draft_cancelled', t_day(-3, '00:30'),'00000000-0000-0000-0000-0000000000e1'),
 ('wastage','00000000-0000-0000-0000-0000000000c3',3,'kg','purchase',       t_day(-2),'00000000-0000-0000-0000-0000000000e1'),
 ('pull','00000000-0000-0000-0000-0000000000c3',5,  'kg','qc_rejected',     t_day(-1),'00000000-0000-0000-0000-0000000000e1'),
 ('pull','00000000-0000-0000-0000-0000000000c3',4,  'kg','packaging',       t_day(0, '00:05'),'00000000-0000-0000-0000-0000000000e1'),
 ('pull','00000000-0000-0000-0000-0000000000c3',6,  'kg','purchase', t_day(0, '00:10'),'00000000-0000-0000-0000-0000000000e1'),
 ('push','00000000-0000-0000-0000-0000000000c5',50, 'nos','purchase',       t_day(-20),'00000000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;

\echo '===== the figures'
select t_check('before any movement: no row for Raw A', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-30), t_d(-12)) is null);
select t_check('day of the purchase only: opening 0, purchased 100, closing 100', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-10), t_d(-10)) = '0|100|0|0|0|0|0|0|0|0|100');
select t_check('later range: opening is what was left before it (70 - samples)', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-5), t_d(-5)) = '100|0|0|0|30|0|2|0|0|0|68');
select t_check('23:30 India time belongs to its own day (yield 7 on day -4, not on -3)', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-4), t_d(-4)) = '68|0|7|0|0|0|0|0|0|0|75');
select t_check('00:30 India time belongs to the next day (draft cancelled 1 is other in on day -3)', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-3), t_d(-3)) = '75|0|0|1|0|0|0|0|0|0|76');
select t_check('wastage and rejected sit in their own columns', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-2), t_d(-1)) = '76|0|0|0|0|0|0|3|5|0|68');
select t_check('packaging pull and an unknown reason (other out) today', t_st('00000000-0000-0000-0000-0000000000c3', t_d(0), t_d(0)) = '68|0|0|0|0|4|0|0|0|6|58');
select t_check('whole range: every column and opening 0', t_st('00000000-0000-0000-0000-0000000000c3', t_d(-30), t_d(0)) = '0|100|7|1|30|4|2|3|5|6|58');
select t_check('closing for To = today equals On hand on Stock Position', (select closing from stock_statement(t_d(-30), t_d(0)) where item_id='00000000-0000-0000-0000-0000000000c3') = t_oh('00000000-0000-0000-0000-0000000000c3'));
select t_check('opening + in - out = closing on every row', not exists (select 1 from stock_statement(t_d(-30), t_d(0)) s where s.opening + s.purchased + s.produced + s.other_in - s.used_in_production - s.packaging - s.samples - s.wastage - s.rejected - s.other_out <> s.closing));
select t_check('splitting a range in two gives the same closing (opening of part 2 = closing of part 1)', (select closing from stock_statement(t_d(-30), t_d(-4)) where item_id='00000000-0000-0000-0000-0000000000c3') = (select opening from stock_statement(t_d(-3), t_d(0)) where item_id='00000000-0000-0000-0000-0000000000c3'));

\echo '===== which items are listed'
select t_check('item with no ledger rows is not listed', not exists (select 1 from stock_statement(t_d(-30), t_d(0)) where item_id='00000000-0000-0000-0000-0000000000c6'));
select t_check('jars, bought 20 days ago, are listed with opening 50 and nothing else', t_st('00000000-0000-0000-0000-0000000000c5', t_d(-5), t_d(0)) = '50|0|0|0|0|0|0|0|0|0|50');
select t_check('category filter: packaging only', (select count(*) from stock_statement(t_d(-30), t_d(0), 'packaging')) = 1 and (select count(*) from stock_statement(t_d(-30), t_d(0), 'raw')) = 1);
select t_check('rows come back in item code order', (select array_agg(item_code order by item_code) from stock_statement(t_d(-30), t_d(0))) = (select array_agg(item_code) from stock_statement(t_d(-30), t_d(0))));

\echo '===== guards'
select t_fail('From after To', $q$select * from stock_statement(t_d(-1), t_d(-2))$q$, 'cannot be after');
select t_fail('To in the future', $q$select * from stock_statement(t_d(-1), t_d(1))$q$, 'cannot be in the future');
select t_fail('missing date', $q$select * from stock_statement(null, t_d(0))$q$, 'both a From and a To');
select t_fail('unknown category', $q$select * from stock_statement(t_d(-1), t_d(0), 'junk')$q$, 'Unknown category');
select t_check('anon cannot call it', not has_function_privilege('anon', 'public.stock_statement(date,date,text)', 'execute'));
select t_check('signed-in users can', has_function_privilege('authenticated', 'public.stock_statement(date,date,text)', 'execute'));
