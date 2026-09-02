-- ============================================================
-- FB-0015 ("admin should be able to delete purchase records") — extends
-- the same admin-only delete pattern already used for Item Type Master
-- (0008), Item/Vendor Master (0009), and MFR (0011) to Purchase.
--
-- po_write and pl_write (0001_init.sql) are each a single `for all`
-- policy covering insert/update/delete for system_admin + inventory_
-- manager — the app never exposed a delete action for either, so this
-- was latent, unused. Split each into insert/update (unchanged roles)
-- plus a new delete policy restricted to system_admin alone, matching
-- the app-side check in deletePurchaseOrder() (lib/actions/purchase.ts).
--
-- purchase_lines.purchase_order_id is `on delete cascade` (0001_init.sql)
-- — deleting a purchase_orders row cascade-deletes its purchase_lines
-- rows too. Postgres enforces RLS on the referencing table for a
-- cascaded delete same as a direct one, so pl_delete has to exist (and
-- allow system_admin) or an admin's PO delete would fail with a
-- permission error the moment it tried to cascade into purchase_lines —
-- there is deliberately no standalone "delete one purchase line" UI
-- action, this policy only exists to let the PO-level cascade through.
--
-- quality_checks.purchase_line_id, finished_product_components.
-- purchase_line_id, bmr_weighment_lines.purchase_line_id, and inventory_
-- ledger.purchase_line_id all reference purchase_lines(id) with no
-- cascade/nullify of their own (0001_init.sql) — so once any line in a
-- PO has been QC'd, consumed by MFR/BMR, or has ledger activity, the
-- cascade hits a foreign-key violation (23503) and the whole delete is
-- rolled back. deletePurchaseOrder() translates that into a friendly
-- message rather than a raw DB error, same convention as deleteItem().
-- This means only a PO that's genuinely untouched downstream (a mistaken
-- entry, the actual use case in the ticket) can ever be deleted — exactly
-- the same safety property the item/vendor/MFR deletes already have.
--
-- Standalone, additive migration (drops and recreates two policies; no
-- data or table-structure changes). Safe to re-run.
-- ============================================================

drop policy if exists po_write on public.purchase_orders;

create policy po_insert on public.purchase_orders for insert
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy po_update on public.purchase_orders for update
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy po_delete on public.purchase_orders for delete
  using (public.has_any_role('system_admin'));

drop policy if exists pl_write on public.purchase_lines;

create policy pl_insert on public.purchase_lines for insert
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy pl_update on public.purchase_lines for update
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));

create policy pl_delete on public.purchase_lines for delete
  using (public.has_any_role('system_admin'));
