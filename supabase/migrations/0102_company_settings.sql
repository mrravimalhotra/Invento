-- 0102: Company details printed on reports and documents, editable in the app
--
-- Ravi, 4 Oct 2026 (FB-0046 / B32): the licence number printed on reports is
-- "PD/AYU/111", the company name sits directly below the logo, and the licence
-- number must be changeable from the app when it changes.
--
-- One row holds what every report, slip, certificate, label and Word document
-- prints: company name, address, the licence label and the licence number.
-- Everyone with a role can read it; only the System Administrator can change it
-- (through set_company_settings, which also keeps the change in the audit log).
-- Ravi's earlier decision (29 Sept 2026) was "PD/AYU-111"; this replaces it.

begin;

create table public.company_settings (
  id          uuid primary key default gen_random_uuid(),
  singleton   boolean not null default true unique check (singleton),
  company_name text not null check (length(btrim(company_name)) between 1 and 120),
  address     text not null default '' check (length(address) <= 200),
  licence_label text not null check (length(btrim(licence_label)) between 1 and 60),
  licence_no  text not null check (length(btrim(licence_no)) between 1 and 60)
);
insert into public.company_settings (singleton, company_name, address, licence_label, licence_no)
values (true, 'Atharva Nature Healthcare Pvt. Ltd.', 'Wagholi, Pune', 'Mfg. Lic. No.', 'PD/AYU/111');

alter table public.company_settings enable row level security;
create policy company_settings_select on public.company_settings
  for select using ((select public.has_app_access()));

-- who/when stamps and audit, like every other business table (0072)
do $$
declare
  v_tbl text := 'company_settings';
begin
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_fn_audit_log(%L)',
                 'trg_audit_' || v_tbl, v_tbl, 'id');
  execute format('create trigger %I after truncate on public.%I for each statement execute function public.trg_fn_audit_truncate()',
                 'trg_audit_truncate_' || v_tbl, v_tbl);
  execute format('alter table public.%I add column if not exists created_at timestamptz', v_tbl);
  execute format('alter table public.%I alter column created_at set default now()', v_tbl);
  execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id)', v_tbl);
  execute format('alter table public.%I add column if not exists updated_at timestamptz', v_tbl);
  execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', v_tbl);
  execute format('create trigger %I before insert on public.%I for each row execute function public.trg_fn_stamp_created()',
                 'trg_stamp_created_' || v_tbl, v_tbl);
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                 'trg_stamp_updated_' || v_tbl, v_tbl);
end $$;

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
         licence_no    = btrim(p_licence_no);
end $$;
revoke all on function public.set_company_settings(text, text, text, text) from public, anon;
grant execute on function public.set_company_settings(text, text, text, text) to authenticated;

commit;
