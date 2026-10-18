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
create or replace function public.t_n(p text) returns bigint language plpgsql security definer as $$ declare v bigint; begin execute 'select count(*) from '||p into v; return v; end $$;
grant execute on function public.t_oh(uuid), public.t_n(text) to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000a2','im@t'),('00000000-0000-0000-0000-0000000000a3','mfr@t'),('00000000-0000-0000-0000-0000000000a4','qcc@t'),('00000000-0000-0000-0000-0000000000a5','qcr@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000a2','inventory_manager'),('00000000-0000-0000-0000-0000000000a3','mfr_manager'),('00000000-0000-0000-0000-0000000000a4','quality_checker'),('00000000-0000-0000-0000-0000000000a5','qc_reviewer');
insert into item_types (id, description) values ('00000000-0000-0000-0000-0000000000c1','Oil');
insert into vendors (id, vendor_code, name) values ('00000000-0000-0000-0000-0000000000c2','V-T1','Vendor');
insert into items (id,item_code,name,category,unit,item_type_id) values
 ('00000000-0000-0000-0000-0000000000c3','RM-T0001','Raw A','raw','kg','00000000-0000-0000-0000-0000000000c1'),
 ('00000000-0000-0000-0000-0000000000c5','PK-T0001','Jar','packaging','nos','00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('PO: raw A 100 kg, submitted', $q$
 insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values ('00000000-0000-0000-0000-0000000000d1','PO-T1','00000000-0000-0000-0000-0000000000c2','INV-1',current_date);
 insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','B1',100,'kg',0,0,0);
 select submit_purchase_order('00000000-0000-0000-0000-0000000000d1')$q$);

\echo '===== 0122: S9 compares the net receipt of a line that is not submitted'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('submitted order: all nine checks clean', (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);
select t_ok('System Admin reopens the order', $q$ select reopen_purchase_order('00000000-0000-0000-0000-0000000000d1') $q$);
reset role;
select t_check('the ledger keeps the receipt and has its reversal (net 0)',
  (select count(*) filter (where event_type = 'push') = 1 and count(*) filter (where event_type = 'pull') = 1
          and sum(case event_type when 'push' then quantity else -quantity end) = 0
     from inventory_ledger where purchase_line_id = '00000000-0000-0000-0000-0000000000e1' and reference_type = 'purchase'));
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('reopened order: S9 no longer reports it (LW-11)', (select problems from stock_integrity_check() where code = 'S9') = 0);
select t_check('reopened order: all nine checks clean', (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);

reset role;
insert into inventory_ledger (event_type,item_id,purchase_line_id,quantity,unit,reference_type,reason)
  values ('push','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',5,'kg','purchase','stray receipt');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('a receipt that does not net to zero on a draft line is still found', (select problems from stock_integrity_check() where code = 'S9') = 1);
select t_check('and explained in words with item and batch',
  exists (select 1 from stock_integrity_check() c, jsonb_array_elements(c.sample) s
           where c.code = 'S9' and s->>'problem' = 'The ledger still counts a receipt for a line that is not submitted'
             and s->>'item_code' = 'RM-T0001' and s->>'reference' = 'B1'));
reset role;
delete from inventory_ledger where reason = 'stray receipt';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('the order is submitted again', $q$ select submit_purchase_order('00000000-0000-0000-0000-0000000000d1') $q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('resubmitted order: all nine checks clean', (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);
select t_fail('another role cannot run the check', $q$ select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false); select * from stock_integrity_check() $q$, 'Only the System Administrator');
reset role;
