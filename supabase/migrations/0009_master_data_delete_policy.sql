-- ============================================================
-- "Provide delete access for all master data including vendor, item etc
-- to admin" — a follow-up to FB-0004 (which did this for Item Type
-- Master), extending the same admin-only delete pattern to the other two
-- Master Data screens: Item Master (items) and Vendor Master (vendors).
--
-- items_write (0001_init.sql) and vendors_write are each a single `for
-- all` policy covering insert/update/delete for a few roles — the app
-- never exposed a delete action for either, so this was latent, unused.
-- Same treatment as 0008_item_type_delete_policy.sql: split each into
-- insert/update (unchanged roles) plus a new delete policy restricted to
-- system_admin alone — a deliberate tightening, not a loosening, and
-- matches the app-side checks in deleteItem() (lib/actions/items.ts) and
-- deleteVendor() (lib/actions/vendors.ts) so the two layers agree, per
-- the briefing's "app checks are UI-affordance only, RLS is the real
-- backstop" convention.
--
-- Standalone, additive migration (drops and recreates two policies; no
-- data or table-structure changes). Safe to re-run.
-- ============================================================

drop policy if exists items_write on public.items;

create policy items_insert on public.items for insert
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

create policy items_update on public.items for update
  using (public.has_any_role('system_admin','inventory_manager','mfr_manager'))
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

create policy items_delete on public.items for delete
  using (public.has_any_role('system_admin'));

drop policy if exists vendors_write on public.vendors;

create policy vendors_insert on public.vendors for insert
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy vendors_update on public.vendors for update
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy vendors_delete on public.vendors for delete
  using (public.has_any_role('system_admin'));
