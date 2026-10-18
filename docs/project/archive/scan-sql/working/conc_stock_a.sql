begin;
select 'A check ok' from (select check_sufficient_stock('00000000-0000-0000-0000-0000000000c3', 60)) x;
insert into inventory_ledger(event_type,item_id,quantity,unit,reference_type,reason) values ('pull','00000000-0000-0000-0000-0000000000c3',60,'kg','packaging','A');
select pg_sleep(4);
commit;
