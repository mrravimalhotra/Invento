-- ============================================================
-- "let MFR screen be entry point for Finished Product master list
-- creation. Each MFR be associated with one Finished Product and while
-- creating MFR, new finished product master entry be created with
-- automatic item code such as FP-00001. Remove access to create Finished
-- product master list from Item Master."
--
-- Links each MFR recipe to exactly one Finished Product item
-- (items.category = 'processed'). createMfrDefinition() now creates both
-- rows together — the items row (auto FP- code via get_next_item_code)
-- and the mfr_definitions row pointing at it — instead of the two being
-- created independently through two different screens. UNIQUE enforces
-- the 1:1 both ways: one MFR per finished product, one finished product
-- per MFR.
--
-- Nullable rather than NOT NULL: existing mfr_definitions rows, and any
-- 'processed' items already created directly through Item Master before
-- this change, predate this link and have no counterpart on the other
-- side. This migration doesn't touch or guess at pairing them up — it
-- only adds the column. Every *new* MFR created from here on always sets
-- it (enforced in the app, lib/actions/mfr.ts).
--
-- mfr_definitions.item_type_id (0001_init.sql) is intentionally NOT
-- dropped here — left in place, deprecated, simply unused by new code
-- going forward. The linked Finished Product item now carries its own
-- item_type_id, reached via finished_product_item_id, so duplicating it
-- on mfr_definitions would just be a second place for the same fact to
-- drift out of sync. Not dropping the column avoids losing whatever
-- values already exist on file for pre-existing rows.
-- ============================================================

alter table public.mfr_definitions
  add column finished_product_item_id uuid references public.items(id);

alter table public.mfr_definitions
  add constraint mfr_definitions_finished_product_item_id_key unique (finished_product_item_id);
