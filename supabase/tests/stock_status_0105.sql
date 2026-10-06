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
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1');

create or replace function public.t_ss(p uuid) returns text language sql security definer as $$
  select format('%s|%s|%s|%s', usable, awaiting_qc, retest_due, expired) from item_stock_status where item_id = p $$;
grant execute on function public.t_ss(uuid) to authenticated;
insert into items (id,item_code,name,category,unit,item_type_id) values ('00000000-0000-0000-0000-0000000000c4','PKG-T0001','Pack A','packaging','kg','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

\echo '===== five raw material batches in different QC states'
select t_ok('B1 100 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-S1','00000000-0000-0000-0000-0000000000c2','INV-S1',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);
select t_ok('B2 50 kg (no QC), submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d2','PO-S2','00000000-0000-0000-0000-0000000000c2','INV-S2',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c3','B2',50,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d2')$q$);
select t_ok('B3 20 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d3','PO-S3','00000000-0000-0000-0000-0000000000c2','INV-S3',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000c3','B3',20,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d3')$q$);
select t_ok('B4 10 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d4','PO-S4','00000000-0000-0000-0000-0000000000c2','INV-S4',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000c3','B4',10,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d4')$q$);
select t_ok('B5 5 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d5','PO-S5','00000000-0000-0000-0000-0000000000c2','INV-S5',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000d5','00000000-0000-0000-0000-0000000000c3','B5',5,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d5')$q$);
select t_ok('B6 40 kg stays a draft PO (not received)', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d6','PO-S6','00000000-0000-0000-0000-0000000000c2','INV-S6',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e6','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-0000000000c3','B6',40,'kg',0,0,0)$q$);
select t_ok('packaging batch 7 kg, submit', $q$insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d7','PO-S7','00000000-0000-0000-0000-0000000000c2','INV-S7',current_date); insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e7','00000000-0000-0000-0000-0000000000d7','00000000-0000-0000-0000-0000000000c4','P1',7,'kg',0,0,0); select submit_purchase_order('00000000-0000-0000-0000-0000000000d7')$q$);

reset role;
select t_ok('QC records: B1 approved, B3 approved with retest date passed, B4 approved and expired, B5 rejected', $q$
  insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,expiry_date) values
   ('00000000-0000-0000-0000-0000000000f1','AR-S1','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now(),365,current_date + 400),
   ('00000000-0000-0000-0000-0000000000f3','AR-S3','00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now() - interval '400 days',30,current_date + 400),
   ('00000000-0000-0000-0000-0000000000f4','AR-S4','00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now(),365,current_date - 1),
   ('00000000-0000-0000-0000-0000000000f5','AR-S5','00000000-0000-0000-0000-0000000000e5','00000000-0000-0000-0000-0000000000c3',0,'kg','rejected',now(),null,null)$q$);
select t_check('retest date really is in the past for B3', (select retest_date < current_date from quality_checks where id='00000000-0000-0000-0000-0000000000f3'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
set role authenticated;
select t_check('split: usable 100, awaiting 50, retest due 20, expired 10 (rejected 5 and the draft PO left out)', t_ss('00000000-0000-0000-0000-0000000000c3') = '100|50|20|10');
select t_check('the four add up to On hand (rejected moved out, draft not received)', t_oh('00000000-0000-0000-0000-0000000000c3') = 180);
select t_check('packaging item is not in the view', not exists (select 1 from item_stock_status where item_id='00000000-0000-0000-0000-0000000000c4'));

\echo '===== usable follows wastage and a later decision'
select t_ok('write off 3 kg of B1', $q$select record_wastage('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',3,'kg','spill')$q$);
select t_check('usable 97, others unchanged', t_ss('00000000-0000-0000-0000-0000000000c3') = '97|50|20|10');
select t_check('still adds up to On hand', t_oh('00000000-0000-0000-0000-0000000000c3') = 177);
reset role;
select t_ok('B2 approved later', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit,status,reviewed_at,retest_period_days,expiry_date) values ('00000000-0000-0000-0000-0000000000f2','AR-S2','00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c3',0,'kg','approved',now(),365,current_date + 400)$q$);
set role authenticated;
select t_check('B2 moves from awaiting to usable', t_ss('00000000-0000-0000-0000-0000000000c3') = '147|0|20|10');
