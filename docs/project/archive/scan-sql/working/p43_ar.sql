\set ON_ERROR_STOP off
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
begin;
select 'inside a transaction that is rolled back: ' || get_next_ar_number();
rollback;
select 'next call after the rollback: ' || get_next_ar_number();
