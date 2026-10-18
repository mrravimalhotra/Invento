\pset footer off
reset role;
insert into items (id, item_code, name, category, unit, item_type_id) values ('00000000-0000-0000-0000-0000000000c9','FP-T0001','Test product','processed',null,null);
select 'before: unit=' || coalesce(unit,'NULL') from items where id='00000000-0000-0000-0000-0000000000c9';
set role anon;
select 'anon runs _item_stock_unit -> ' || coalesce(public._item_stock_unit('00000000-0000-0000-0000-0000000000c9','bogus-unit'),'NULL');
select 'anon runs check_sufficient_stock -> ' ;
select public.check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 9999);
reset role;
select 'after: unit=' || coalesce(unit,'NULL') from items where id='00000000-0000-0000-0000-0000000000c9';
