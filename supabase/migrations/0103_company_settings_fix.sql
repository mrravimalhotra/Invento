-- 0103: Fix saving the company details (0102)
--
-- Saving failed in Supabase with error 21000 ("UPDATE requires a WHERE clause"):
-- the hosted database refuses an UPDATE that has no WHERE, and set_company_settings
-- updated its one row without one. Same function, with "where singleton" added
-- (the table has exactly one row, and singleton is always true).

begin;

create or replace function public.set_company_settings(
  p_company_name text,
  p_address text,
  p_licence_label text,
  p_licence_no text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can change the company details.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_company_name), '') = '' then
    raise exception 'Company name is required.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_licence_label), '') = '' then
    raise exception 'Licence label is required.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_licence_no), '') = '' then
    raise exception 'Licence number is required.' using errcode = 'P0001';
  end if;
  if length(btrim(p_company_name)) > 120 or length(coalesce(p_address, '')) > 200
     or length(btrim(p_licence_label)) > 60 or length(btrim(p_licence_no)) > 60 then
    raise exception 'One of the entries is too long.' using errcode = 'P0001';
  end if;
  update public.company_settings
     set company_name  = btrim(p_company_name),
         address       = btrim(coalesce(p_address, '')),
         licence_label = btrim(p_licence_label),
         licence_no    = btrim(p_licence_no)
   where singleton;
end $$;
revoke all on function public.set_company_settings(text, text, text, text) from public, anon;
grant execute on function public.set_company_settings(text, text, text, text) to authenticated;

commit;
