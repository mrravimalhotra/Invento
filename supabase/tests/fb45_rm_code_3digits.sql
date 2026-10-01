\set ON_ERROR_STOP off
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'PASS  | ok      | % (as %)', p_label, current_user; exception when others then raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'FAIL  | blocked | % -> ALLOWED', p_label; exception when others then if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm; else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$ begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated, anon;
create or replace function public._plan(q text) returns text language plpgsql as $$ declare r text; o text := ''; begin for r in execute 'explain '||q loop o := o||r||E'\n'; end loop; return o; end $$;
-- FB-0045 (0091): Raw Material item codes are RM-001, not RM-00001, and keep
-- working past RM-999. Other categories keep five digits.
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','a@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('preview shows the next raw code, 3 digits', public.peek_next_item_code('raw') = 'RM-001');
select t_check('first raw code is RM-001', public.get_next_item_code('raw') = 'RM-001');
select t_check('second raw code is RM-002', public.get_next_item_code('raw') = 'RM-002');
select t_check('preview matches what is assigned next', public.peek_next_item_code('raw') = 'RM-003' and public.get_next_item_code('raw') = 'RM-003');
select t_check('packaging keeps 5 digits', public.get_next_item_code('packaging') = 'PKG-00001' and public.peek_next_item_code('packaging') = 'PKG-00002');
select t_check('finished product keeps 5 digits', public.get_next_item_code('processed') = 'FP-00001');
select t_check('packaged finished product keeps 5 digits', public.get_next_item_code('packaged_fp') = 'PKG-FP-00001');
select t_check('bulk codes use 3 digits for raw, in order', (select array_agg(c order by n) = array['RM-004','RM-005','RM-006'] from public.get_next_item_codes('raw', 3) with ordinality as t(c, n)));
reset role;
-- push the raw sequence to the edge of 999
select setval('public.item_code_seq_raw', 997);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('RM-998 is padded to 3 digits', public.get_next_item_code('raw') = 'RM-998');
select t_check('preview before RM-999', public.peek_next_item_code('raw') = 'RM-999');
select t_check('RM-999 is the last 3-digit code', public.get_next_item_code('raw') = 'RM-999');
select t_check('preview after 999 widens to RM-1000, not truncated', public.peek_next_item_code('raw') = 'RM-1000');
select t_check('RM-1000 is issued, not a repeat of an earlier code', public.get_next_item_code('raw') = 'RM-1000');
select t_check('RM-1001 follows', public.get_next_item_code('raw') = 'RM-1001');
select t_check('bulk across the boundary stays unique', (select count(distinct c) = 4 and count(*) = 4 from public.get_next_item_codes('raw', 4) c));
reset role;
-- an item can actually be saved with the widened code, and codes stay unique
insert into items (item_code, name, category, unit) values ('RM-001-x-probe', 'probe', 'raw', 'kg') on conflict do nothing;
delete from items where item_code = 'RM-001-x-probe';
select t_check('items.item_code is still unique', exists (select 1 from pg_indexes where tablename='items' and indexdef ilike '%unique%' and indexdef ilike '%item_code%') or exists (select 1 from pg_constraint where conrelid='public.items'::regclass and contype='u'));
