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
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2','im@t');
insert into user_roles values ('00000000-0000-0000-0000-0000000000a2','inventory_manager');
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);

-- FB-0059 (0099): ARRM-0001/yy for raw material, ARFP-0001/yy for finished product.
create temp table t_ar (k text, v text);
grant all on t_ar to authenticated;
insert into t_ar select 'rm1', get_next_ar_number();
insert into t_ar select 'rm2', get_next_ar_number();
insert into t_ar select 'fp1', get_next_fp_ar_number();
insert into t_ar select 'fp2', get_next_fp_ar_number();
select t_check('RM first: ARRM-0001/yy', (select v from t_ar where k='rm1') = 'ARRM-0001/' || to_char(now() at time zone 'Asia/Kolkata','YY'));
select t_check('RM second: ARRM-0002/yy', (select v from t_ar where k='rm2') = 'ARRM-0002/' || to_char(now() at time zone 'Asia/Kolkata','YY'));
select t_check('FP first: ARFP-0001/yy (own counter)', (select v from t_ar where k='fp1') = 'ARFP-0001/' || to_char(now() at time zone 'Asia/Kolkata','YY'));
select t_check('FP second: ARFP-0002/yy', (select v from t_ar where k='fp2') = 'ARFP-0002/' || to_char(now() at time zone 'Asia/Kolkata','YY'));

\echo '===== 9999 and past it: widens, never truncates or repeats'
reset role;
select setval('public.ar_rm_' || to_char(now() at time zone 'Asia/Kolkata','YY') || '_seq', 9998);
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
insert into t_ar select 'rm9999', get_next_ar_number();
insert into t_ar select 'rm10000', get_next_ar_number();
insert into t_ar select 'rm10001', get_next_ar_number();
select t_check('RM 9999 keeps 4 digits', (select v from t_ar where k='rm9999') like 'ARRM-9999/%');
select t_check('RM after 9999 is ARRM-10000, not truncated', (select v from t_ar where k='rm10000') like 'ARRM-10000/%');
select t_check('RM keeps counting: ARRM-10001', (select v from t_ar where k='rm10001') like 'ARRM-10001/%');
select t_check('all numbers are different', (select count(distinct v) from t_ar) = (select count(*) from t_ar));

select t_check('FP sequence untouched by RM (still at 2)', (select last_value from pg_sequences where sequencename = 'ar_fp_' || to_char(now() at time zone 'Asia/Kolkata','YY') || '_seq') = 2);
\echo '===== a new year starts again at 0001 (its own sequence)'
reset role;
select t_check('there is one sequence per type and year', (select count(*) from pg_class where relname in ('ar_rm_' || to_char(now() at time zone 'Asia/Kolkata','YY') || '_seq', 'ar_fp_' || to_char(now() at time zone 'Asia/Kolkata','YY') || '_seq')) = 2);
select t_check('internal function is not callable by signed-in users', not has_function_privilege('authenticated','public._next_ar_number(text)','execute'));
