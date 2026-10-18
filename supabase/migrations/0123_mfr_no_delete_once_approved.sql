-- 0123: an approved MFR cannot be deleted; Deactivate is the only way to retire it
-- Ravi, 18 Oct 2026 ("Refuse delete once an MFR is approved (Deactivate only)").
-- Until now the System Administrator could delete an approved MFR that no batch
-- had used, which left its finished product item behind with no recipe
-- (MFR-0001 and MFR-0006 on the live database, FP-00001 and FP-00005).
-- An unapproved (draft) MFR can still be deleted. The rule holds for every
-- delete, not only the app's, so no path can remove an approved master record.

create or replace function public.trg_fn_mfr_no_delete_once_approved()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.approved_at is not null or old.approved_by is not null then
    raise exception 'MFR % is approved, so it cannot be deleted. Deactivate it instead.', old.code
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists trg_00_mfr_no_delete_once_approved on public.mfr_definitions;
create trigger trg_00_mfr_no_delete_once_approved
  before delete on public.mfr_definitions
  for each row execute function public.trg_fn_mfr_no_delete_once_approved();

revoke all on function public.trg_fn_mfr_no_delete_once_approved() from public, anon, authenticated;
