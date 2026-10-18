\set ON_ERROR_STOP off
\pset footer off
reset role;
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'ALLOWED | % (as %)', p_label, current_user;
exception when others then raise notice 'REFUSED | % -> %', p_label, sqlerrm; end $$;
grant execute on function public.t_ok(text,text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('A raw item with stock -> category packaging', $q$update items set category='packaging' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('B finished product -> category raw', $q$update items set category='raw' where id='00000000-0000-0000-0000-0000000000c9'$q$);
select t_ok('C deactivate item with stock', $q$update items set active=false where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('D raw item without item type', $q$update items set item_type_id=null where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('E negative low-stock threshold', $q$update items set low_stock_threshold=-5 where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('F change unit with stock', $q$update items set unit='g' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_ok('G insert item with a made-up code', $q$insert into items (item_code,name,category,unit) values ('RM-001','Fake code','packaging','kg')$q$);
select t_ok('H new purchase line for an inactive item', $q$insert into purchase_lines (purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c3','X-INACT',5,'kg',0,0,0)$q$);
reset role;
select 'after: ' || item_code||' '||category||' active='||active||' thr='||coalesce(low_stock_threshold::text,'null')||' type='||(item_type_id is not null) from items order by item_code;
\echo === pairing break (rolled back)
reset role;
begin;
update items set category='raw', active=true, item_type_id=(select id from item_types limit 1) where id='00000000-0000-0000-0000-0000000000c3';
update items set category='processed' where id='00000000-0000-0000-0000-0000000000c9';
update items set production_rm_item_id='00000000-0000-0000-0000-0000000000c3' where id='00000000-0000-0000-0000-0000000000c9';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('I paired production RM switched raw -> packaging', $q$update items set category='packaging' where id='00000000-0000-0000-0000-0000000000c3'$q$);
reset role;
select 'pair now: FP points to category=' || (select category from items where id=(select production_rm_item_id from items where id='00000000-0000-0000-0000-0000000000c9'));
rollback;
