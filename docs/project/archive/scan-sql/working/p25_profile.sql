\set ON_ERROR_STOP off
\pset footer off
reset role;
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'ALLOWED | % (as %)', p_label, current_user;
exception when others then raise notice 'REFUSED | % -> %', p_label, sqlerrm; end $$;
grant execute on function public.t_ok(text,text) to authenticated;
begin;
insert into profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000a1','Dr. Real Admin'),('00000000-0000-0000-0000-0000000000a2','Plain Inventory User') on conflict (id) do update set full_name = excluded.full_name;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('rename own profile to the admin''s exact name', $q$update profiles set full_name='Dr. Real Admin' where id='00000000-0000-0000-0000-0000000000a2'$q$);
select t_ok('5000-character display name', $q$update profiles set full_name=repeat('x',5000) where id='00000000-0000-0000-0000-0000000000a2'$q$);
select t_ok('rename someone else', $q$update profiles set full_name='Hacked' where id='00000000-0000-0000-0000-0000000000a1'$q$);
reset role;
select 'names now: ' || string_agg(full_name::varchar(30), ' | ') from profiles where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
rollback;
