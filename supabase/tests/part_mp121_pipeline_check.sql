\set ON_ERROR_STOP on
create or replace function public.t_check(p_label text, p_cond boolean) returns void language plpgsql as $$
begin if coalesce(p_cond,false) then raise notice 'PASS  | check   | %', p_label; else raise notice 'FAIL  | check   | %', p_label; end if; end $$;

select t_check('0121: public schema has its description',
  obj_description('public'::regnamespace, 'pg_namespace') like 'Invento application schema.%');
