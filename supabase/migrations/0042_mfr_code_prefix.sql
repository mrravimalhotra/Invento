-- ============================================================
-- Ravi (14 Sept 2026): "MFR Record code should start with MFR-0001 so it
-- is more explicit." get_next_mfr_code() has generated 'F-0001'-style
-- codes since 0001_init.sql — a single letter was ambiguous next to every
-- other module's clearer prefix (RM-/PKG-/FP-/V-/PO-/AR-/COA-/EQ-/DS-).
-- Purely cosmetic: same sequence (mfr_code_seq), same 4-digit padding,
-- only the prefix text changes. Existing mfr_definitions.code values
-- (e.g. the 'F-0001'/'F-0002' created before this migration) are text
-- already stored on those rows and are NOT rewritten — codes are
-- immutable once assigned everywhere else in this app (item codes,
-- vendor codes, etc. are never renumbered retroactively either), so
-- pre-existing MFRs keep their 'F-' codes; only MFRs created from now on
-- get 'MFR-'.
-- ============================================================

create or replace function public.get_next_mfr_code()
returns text language sql as $$
  select 'MFR-' || lpad(nextval('public.mfr_code_seq')::text, 4, '0');
$$;
