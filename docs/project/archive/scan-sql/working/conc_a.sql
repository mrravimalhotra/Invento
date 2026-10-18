-- Session A: submits the purchase order and keeps the transaction open for 4 seconds
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
select 'A submit: ' || submit_purchase_order('00000000-0000-0000-0000-00000000c001')::text;
select pg_sleep(4);
commit;
