-- ============================================================
-- Rename coa_records.subject_type -> coa_type.
--
-- Ravi (22 Sept 2026), after trying the new /coa/new screen: the on-screen
-- "Subject" label read ambiguously, so the picker field was renamed to
-- "Raw/Finished" (patch 0018). He then asked whether the underlying DB
-- column should follow suit — decided yes, with "coa_type" as the chosen
-- name (over subject_type/raw_finished_type/item_class/coa_subject).
--
-- A straight rename, not a drop-and-recreate: existing values
-- ('raw_material' / 'finished_product') and every row's data are
-- untouched, only the column's name changes. Postgres carries the column's
-- existing check constraint and foreign-key-adjacent indexes along with
-- the rename automatically, so nothing else needs to be re-created.
-- ============================================================

alter table public.coa_records
  rename column subject_type to coa_type;
