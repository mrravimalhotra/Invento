-- ============================================================
-- Closes a gap found during a full-app integrity audit (1 Sept 2026, see
-- claude/known-issues.md): finished_product_batches and bmr_records were
-- never given the admin-only-delete treatment the other "master data /
-- record" tables (items, vendors, item_types, mfr_definitions) already
-- have — each still uses a single `for all` policy covering
-- insert/update/delete for the same role set. The app itself exposes no
-- delete UI for either table, but RLS is the real backstop (per the
-- project's "app checks are UI-affordance only" convention) — as it stood,
-- any inventory_manager/mfr_manager/quality_checker/qc_reviewer could
-- delete a finished-product batch or BMR record via a direct API call,
-- cascading away its component-consumption, weighment, and observation
-- history.
--
-- Same split-into-insert/update/delete pattern as
-- 0009_master_data_delete_policy.sql / 0011_mfr_delete_policy.sql: roles
-- that could already write keep insert/update; delete narrows to
-- system_admin only. Standalone, additive migration — drops and recreates
-- policies only, no data or table-structure changes. Safe to re-run.
-- ============================================================

drop policy if exists fp_write on public.finished_product_batches;

create policy fp_insert on public.finished_product_batches for insert
  with check (public.has_any_role('system_admin','mfr_manager','inventory_manager'));

create policy fp_update on public.finished_product_batches for update
  using (public.has_any_role('system_admin','mfr_manager','inventory_manager'))
  with check (public.has_any_role('system_admin','mfr_manager','inventory_manager'));

create policy fp_delete on public.finished_product_batches for delete
  using (public.has_any_role('system_admin'));

drop policy if exists bmr_write on public.bmr_records;

create policy bmr_insert on public.bmr_records for insert
  with check (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'));

create policy bmr_update on public.bmr_records for update
  using (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'));

create policy bmr_delete on public.bmr_records for delete
  using (public.has_any_role('system_admin'));
