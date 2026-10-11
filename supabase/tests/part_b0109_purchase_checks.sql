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
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1');

set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== bulk upload: unit price and GST % are mandatory (SCAN-P2-07)'
select t_fail('bulk create refuses a line with no price', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BU-1","invoice_date":"2026-10-01","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg","gst_pct":5}]}]'::jsonb)$q$, 'unit price and a GST');
select t_fail('bulk create refuses a line with no GST %', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BU-2","invoice_date":"2026-10-01","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg","unit_price":10}]}]'::jsonb)$q$, 'unit price and a GST');
select t_check('nothing was saved by the refused uploads', (select count(*) from purchase_orders where invoice_number in ('BU-1','BU-2')) = 0);
select t_ok('bulk create accepts price 0 and GST 0', $q$select * from bulk_create_purchase_orders('[{"vendor_id":"00000000-0000-0000-0000-0000000000c2","invoice_number":"BU-3","invoice_date":"2026-10-01","lines":[{"item_id":"00000000-0000-0000-0000-0000000000c3","quantity":5,"unit":"kg","unit_price":0,"gst_pct":0}]}]'::jsonb)$q$);
select t_check('the zero-price line was stored as 0, not blank', (select unit_price = 0 and gst_pct = 0 from purchase_lines l join purchase_orders p on p.id=l.purchase_order_id where p.invoice_number='BU-3'));

\echo '===== submit refuses an empty order (SCAN-P3-03)'
select t_ok('empty draft order', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-E1','00000000-0000-0000-0000-0000000000c2','EMPTY-1',current_date)$q$);
select t_fail('submit of an empty order is refused', $q$select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$, 'no lines');
select t_check('the empty order is still a draft', (select status = 'draft' from purchase_orders where id='00000000-0000-0000-0000-0000000000d1'));
select t_ok('a normal order still submits', $q$
 insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','BX1',10,'kg',0,0,0,5,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_check('stock arrived (10 kg)', t_oh('00000000-0000-0000-0000-0000000000c3') = 10);

\echo '===== received-on date (SCAN-P4-14)'
select t_ok('a new order can carry the date goods were received', $q$insert into purchase_orders (po_number,vendor_id,invoice_number,invoice_date,received_on) values ('PO-E2','00000000-0000-0000-0000-0000000000c2','REC-1',current_date,'2026-09-30')$q$);
select t_check('received_on stored', (select received_on = date '2026-09-30' from purchase_orders where invoice_number='REC-1'));
select t_ok('received_on may stay blank (older and bulk-uploaded orders)', $q$insert into purchase_orders (po_number,vendor_id,invoice_number,invoice_date) values ('PO-E3','00000000-0000-0000-0000-0000000000c2','NOREC-1',current_date)$q$);
select t_check('blank received_on is null', (select received_on is null from purchase_orders where invoice_number='NOREC-1'));

\echo '===== line guard reads the order with a shared lock (SCAN-P10-01)'
select t_check('guard function takes a shared lock on the order', position('for share' in pg_get_functiondef('public.trg_fn_guard_purchase_line_workflow()'::regprocedure)) > 0);
select t_check('submit function checks every line was pushed', position('pushed_at is null' in pg_get_functiondef('public.submit_purchase_order(uuid)'::regprocedure)) > 0);
