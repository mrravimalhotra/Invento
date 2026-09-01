-- ============================================================
-- FB-0004 (Item Type Master): "Admin should have access to delete item
-- type record."
--
-- item_types_write (0001_init.sql) is a single `for all` policy covering
-- insert/update/delete for system_admin, inventory_manager and
-- mfr_manager alike — the app never exposed a delete action, so this was
-- latent, unused. The ticket asks specifically for Admin-only delete, so
-- this migration splits that one policy into insert/update (unchanged,
-- same three roles) and a new delete policy restricted to system_admin —
-- a deliberate tightening, not a loosening, and matches the app-side
-- check in deleteItemType() (lib/actions/item-types.ts) so the two layers
-- agree, per the briefing's "app checks are UI-affordance only, RLS is
-- the real backstop" convention.
--
-- Standalone, additive migration (drops and recreates one policy; no data
-- or table-structure changes). Safe to re-run.
-- ============================================================

drop policy if exists item_types_write on public.item_types;

create policy item_types_insert on public.item_types for insert
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

create policy item_types_update on public.item_types for update
  using (public.has_any_role('system_admin','inventory_manager','mfr_manager'))
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

create policy item_types_delete on public.item_types for delete
  using (public.has_any_role('system_admin'));
