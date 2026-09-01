-- ============================================================
-- "give admin access to delete mfr as well along with all master data"
--
-- Extends the admin-only-delete pattern already applied to item_types
-- (0008_item_type_delete_policy.sql) and items/vendors
-- (0009_master_data_delete_policy.sql) to MFR: split the single
-- mfr_def_write "for all" policy into insert/update (unchanged roles:
-- system_admin, mfr_manager — same as canWrite(roles, "mfr")) plus a
-- delete policy restricted to system_admin only.
--
-- mfr_lines_write is NOT split here. mfr_lines rows are never deleted
-- directly by any Server Action — they're only removed via
-- `on delete cascade` off mfr_definitions (0001_init.sql) when an MFR
-- definition itself is deleted. The existing mfr_lines_write "for all"
-- policy already permits system_admin to do that (system_admin is in both
-- policies), so the cascade succeeds under RLS without any change here.
-- ============================================================

drop policy mfr_def_write on public.mfr_definitions;

create policy mfr_def_insert on public.mfr_definitions for insert
  with check (public.has_any_role('system_admin','mfr_manager'));

create policy mfr_def_update on public.mfr_definitions for update
  using (public.has_any_role('system_admin','mfr_manager'))
  with check (public.has_any_role('system_admin','mfr_manager'));

create policy mfr_def_delete on public.mfr_definitions for delete
  using (public.has_any_role('system_admin'));
