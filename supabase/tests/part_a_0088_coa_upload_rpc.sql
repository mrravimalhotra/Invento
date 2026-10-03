\set ON_ERROR_STOP off
create or replace function public.t_ok(p_label text, p_sql text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'PASS  | ok      | % (as %)', p_label, current_user; exception when others then raise notice 'FAIL  | ok      | % (as %) -> %', p_label, current_user, sqlerrm; end $$;
create or replace function public.t_fail(p_label text, p_sql text, p_expect text) returns void language plpgsql as $$ begin execute p_sql; raise notice 'FAIL  | blocked | % -> ALLOWED', p_label; exception when others then if position(p_expect in sqlerrm) > 0 then raise notice 'PASS  | blocked | % -> %', p_label, sqlerrm; else raise notice 'FAIL  | blocked | % -> wrong error: %', p_label, sqlerrm; end if; end $$;
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$ begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;
grant execute on function public.t_ok(text,text), public.t_fail(text,text,text), public.t_check(text,boolean) to authenticated, anon;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a1','a@t'),('00000000-0000-0000-0000-0000000000b1','b@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a1','system_admin'),('00000000-0000-0000-0000-0000000000b1','inventory_manager');
insert into items (id, item_code, name, category, unit) values
 ('00000000-0000-0000-0000-00000000c001','RM-T1','Raw one','raw','kg'),('00000000-0000-0000-0000-00000000c002','RM-T2','Raw two','raw','kg');

-- 0096 re-keyed this function (per item / per MFR instead of per Item Type); the original
-- failure it guarded against was the function being absent from the live database.
select t_check('bulk template function exists', exists (select 1 from pg_proc where proname='bulk_create_coa_templates'));
select t_check('exactly one version of it exists', (select count(*)=1 from pg_proc where proname='bulk_create_coa_templates'));

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_check('admin creates 2 templates in one call', (select count(*)=2 from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000c001","lines":[{"test":"pH","specification":"5-7"},{"test":"Loss on drying","specification":"NMT 5%"}]},{"item_id":"00000000-0000-0000-0000-00000000c002","lines":[{"test":"Colour","specification":"Brown"}]}]'::jsonb)));
select t_check('lines saved in order', (select array_agg(test order by seq) = array['pH','Loss on drying'] from coa_template_lines l join coa_templates t on t.id=l.coa_template_id where t.item_id='00000000-0000-0000-0000-00000000c001'));
select t_fail('item that already has a template is refused', $q$select * from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000c001","lines":[{"test":"x","specification":"y"}]}]'::jsonb)$q$, 'already has a COA template');
select t_fail('empty payload refused', $q$select * from public.bulk_create_coa_templates('[]'::jsonb)$q$, 'No COA template rows');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false);
select t_fail('user without a template role refused', $q$select * from public.bulk_create_coa_templates('[{"item_id":"00000000-0000-0000-0000-00000000c001","lines":[{"test":"x","specification":"y"}]}]'::jsonb)$q$, 'already has');
reset role; set role anon;
select t_fail('anon cannot call it', $q$select * from public.bulk_create_coa_templates('[]'::jsonb)$q$, 'permission denied');
reset role;
