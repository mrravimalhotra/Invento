\set ON_ERROR_STOP on
create schema if not exists t;
drop table if exists t.counts;
create table t.counts as select c.relname::text as tbl, 0::bigint as n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
 where ns.nspname='public' and c.relkind in ('r','v') and c.relname not in ('audit_log','app_settings');
do $$ declare r record; begin for r in select tbl from t.counts loop execute format('update t.counts set n = (select count(*) from public.%I) where tbl = %L', r.tbl, r.tbl); end loop; end $$;
grant usage on schema t to authenticated, anon; grant select on t.counts to authenticated, anon;
create or replace function t.mismatch(p_expect_zero boolean) returns text language plpgsql as $$
declare r record; v bigint; bad text := ''; begin
  for r in select tbl, n from t.counts order by tbl loop
    begin execute format('select count(*) from public.%I', r.tbl) into v;
    exception when insufficient_privilege then v := -1; end;
    if p_expect_zero and v > 0 then bad := bad || r.tbl || '=' || v || ' '; end if;
    if not p_expect_zero and v <> r.n and r.tbl not in ('profiles','user_roles') then bad := bad || r.tbl || ' ' || v || '/' || r.n || ' '; end if;
  end loop; return bad; end $$;
grant execute on function t.mismatch(boolean) to authenticated, anon;
select t_check('seed has data in the key tables', (select bool_and(n > 0) from t.counts where tbl in ('items','vendors','purchase_lines','quality_checks','mfr_lines','inventory_ledger','stock_balance','item_position','inventory_ledger_with_balance','purchase_batch_status')));

\echo '===== user WITH a role (inventory manager) ====='
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_check('role user reads every table and view in full: ' || coalesce(nullif(t.mismatch(false),''),'all equal'), t.mismatch(false) = '');
select t_check('role user sees all profiles', (select count(*) from profiles) = (select n from t.counts where tbl='profiles'));
select t_ok('role user submits feedback', $q$insert into page_feedback (page_path,page_label,url_path,observation,submitted_by,submitted_by_name,ticket_number) values ('/','Dashboard','/','works','00000000-0000-0000-0000-0000000000a2','IM','FB-T2')$q$);

\echo '===== signed-in user with NO role ====='
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a6',false);
select t_check('no-role user reads nothing from any business table or view: ' || coalesce(nullif(t.mismatch(true),''),'all zero'), t.mismatch(true) in ('', 'profiles=1 '));
select t_check('no-role user sees only their OWN profile', (select count(*) from profiles) = 1 and (select full_name from profiles) = 'No Roles');
select t_check('no-role user sees no role rows (own list empty)', (select count(*) from user_roles) = 0);
select t_fail('no-role user cannot submit feedback', $q$insert into page_feedback (page_path,page_label,url_path,observation,submitted_by,submitted_by_name,ticket_number) values ('/','Dashboard','/','x','00000000-0000-0000-0000-0000000000a6','NR','FB-T3')$q$, 'row-level security');
select t_check('has_app_access() false for no-role user', not public.has_app_access());

\echo '===== leaver: roles removed (disable), token still valid ====='
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
delete from user_roles where user_id='00000000-0000-0000-0000-0000000000a5';
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_check('disabled leaver reads nothing: ' || coalesce(nullif(t.mismatch(true),''),'all zero'), t.mismatch(true) in ('', 'profiles=1 '));
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
insert into user_roles values ('00000000-0000-0000-0000-0000000000a5','qc_reviewer');

\echo '===== not signed in (public API key only) ====='
set role anon;
select set_config('request.jwt.claim.role','anon',false);
select t_fail('anon: stock_balance view', $q$select count(*) from stock_balance$q$, 'permission denied');
select t_fail('anon: stock ledger view', $q$select count(*) from inventory_ledger_with_balance$q$, 'permission denied');
select t_fail('anon: item_position view', $q$select count(*) from item_position$q$, 'permission denied');
select t_fail('anon: purchase_batch_status view', $q$select count(*) from purchase_batch_status$q$, 'permission denied');
select t_fail('anon: production_batch_status view', $q$select count(*) from production_batch_status$q$, 'permission denied');
select t_check('anon: tables return nothing: ' || coalesce(nullif(t.mismatch(true),''),'all zero'), t.mismatch(true) = '');
reset role; select set_config('request.jwt.claim.role','',false);

\echo '===== write rules unchanged ====='
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select t_ok('admin edits an item', $q$update items set name = name || ' ' where id='00000000-0000-0000-0000-0000000000c3'$q$);
select t_fail('authenticated cannot write through a view', $q$update purchase_batch_status set qc_status='approved'$q$, 'update view');
reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','',false);
select t_check('no policy still uses is_signed_in()', not exists (select 1 from pg_policies where schemaname='public' and (coalesce(qual,'')||coalesce(with_check,'')) like '%is_signed_in%'));
select t_check('every view is security_invoker', not exists (select 1 from pg_class where relkind='v' and relnamespace='public'::regnamespace and not ('security_invoker=on' = any(coalesce(reloptions,'{}')))));
select t_check('coverage report still empty', not exists (select 1 from public.audit_coverage_report()));
