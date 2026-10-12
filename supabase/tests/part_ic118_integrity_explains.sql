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

\echo '===== 0118: the check explains each difference'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('clean at the start: nine checks, no differences',
  (select count(*) from stock_integrity_check()) = 9 and (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);

-- an old row, as written before migration 0076: raw material taken into a finished product batch, no unit
reset role;
alter table inventory_ledger disable trigger trg_00_unit_ledger;
insert into inventory_ledger (event_type,item_id,purchase_line_id,quantity,unit,reference_type,reference_id,reason)
  values ('pull','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',2.5,null,'finished_product','00000000-0000-0000-0000-0000000000f9','old row no unit');
insert into inventory_ledger (event_type,item_id,purchase_line_id,quantity,unit,reference_type,reason)
  values ('push','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',1,'g','purchase','wrong unit row');
alter table inventory_ledger enable trigger trg_00_unit_ledger;
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('S6 finds both rows', (select problems from stock_integrity_check() where code = 'S6') = 2);
select t_check('a row with no unit is explained in words',
  exists (select 1 from stock_integrity_check() c, jsonb_array_elements(c.sample) s where c.code = 'S6' and s->>'problem' = 'This ledger row has no unit written on it; the item is kept in kg'));
select t_check('a row in another unit is explained in words',
  exists (select 1 from stock_integrity_check() c, jsonb_array_elements(c.sample) s where c.code = 'S6' and s->>'problem' = 'This ledger row is in g but the item is kept in kg'));
select t_check('the row shows the item code and name, the date and the batch',
  exists (select 1 from stock_integrity_check() c, jsonb_array_elements(c.sample) s
           where c.code = 'S6' and s->>'item_code' = 'RM-T0001' and s->>'item_name' = 'Raw A' and s->>'event_date' ~ '^\d\d-\d\d-\d{4} \d\d:\d\d$' and s->>'purchase_batch' = 'B1'));

\echo '===== 0118: other checks carry a sentence and names too'
reset role;
update purchase_lines set live_remaining_qty = live_remaining_qty + 3 where id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('S2 sample: sentence, item name, batch number',
  exists (select 1 from stock_integrity_check() c, jsonb_array_elements(c.sample) s
           where c.code = 'S2' and s->>'batch_number' = 'B1' and s->>'item_name' = 'Raw A' and length(s->>'problem') > 20));
reset role;
update purchase_lines set live_remaining_qty = 100 where id = '00000000-0000-0000-0000-0000000000e1';

\echo '===== 0118: old rows with no unit get their item''s unit (the migration''s own statement)'
update inventory_ledger l set unit = i.unit from items i where i.id = l.item_id and l.unit is null and i.unit is not null;
select t_check('the old row now has kg and the same quantity', (select unit = 'kg' and quantity = 2.5 from inventory_ledger where reason = 'old row no unit'));
select t_check('a row already in another unit is left alone', (select unit = 'g' from inventory_ledger where reason = 'wrong unit row'));
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('S6 now has only the genuinely different row', (select problems from stock_integrity_check() where code = 'S6') = 1);
reset role;
delete from inventory_ledger where reason in ('old row no unit','wrong unit row');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('and after clean-up all nine checks are clean again', (select coalesce(sum(problems),0) from stock_integrity_check()) = 0);
reset role;
\echo '===== new rows still get the unit automatically'
insert into inventory_ledger (event_type,item_id,purchase_line_id,quantity,unit,reference_type,reference_id,reason)
  values ('pull','00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000e1',1,null,'finished_product','00000000-0000-0000-0000-0000000000f9','new row no unit');
select t_check('a new row written with no unit is given kg by the database', (select unit = 'kg' from inventory_ledger where reason = 'new row no unit'));
delete from inventory_ledger where reason = 'new row no unit';
