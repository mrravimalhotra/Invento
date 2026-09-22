-- ============================================================
-- Certificate of Analysis — generation, step 2 of 2 (see
-- 0059_coa_templates.sql for step 1, templates).
--
-- Ravi (22 Sept 2026): "Once template is ready, Post QC is done
-- Certificate of analysis can be generated from this screen for Raw
-- Material and Finished Product. The input for this will be Raw
-- Material/Finished Product and its batch number. Based on this
-- information, their Item Type will be determined and correct template
-- will be associated. At this time, actual results will be input in the
-- form against each test. Once submitted, the certificate of analysis
-- can be downloaded in pdf."
--
-- Purely additive to the existing coa_records table (0001_init.sql) —
-- same non-destructive precedent as every other schema evolution in this
-- app (FP wastage/net_qty removal, item sampling defaults removal,
-- etc.): every new column is nullable, no backfill, and every coa_records
-- row created by the OLD "pick an approved QC, paste a file URL" flow
-- (lib/actions/coa.ts's createCoaRecord, retired by this feature per
-- Ravi's confirmation on the templates patch) is left exactly as it was —
-- file_url stays populated on those rows, and the four new columns are
-- simply null for them, same as any pre-existing row whose feature
-- didn't exist yet.
--
-- coa_template_id + result_lines is deliberately a SNAPSHOT, not a live
-- reference: result_lines copies the template's Test/Specification text
-- (plus the entered Result) at the moment the certificate is generated,
-- so a template edited later never retroactively changes a certificate
-- that already issued — the same "history shouldn't move under you"
-- reasoning as every other issued/signed-off record in this schema
-- (approved MFRs, reviewed QC decisions).
-- ============================================================

alter table public.coa_records
  add column if not exists coa_template_id uuid references public.coa_templates(id),
  add column if not exists subject_type text check (subject_type in ('raw_material', 'finished_product')),
  add column if not exists header_data jsonb,
  add column if not exists result_lines jsonb,
  -- The standard closing line both sample certificates carry ("The above
  -- sample complies/Not complies as per ...") — entered fresh per
  -- certificate rather than hardcoded, since the standard referenced can
  -- vary (Ravi's samples read "IHS" on one and what looks like "HHS" on
  -- the other — most likely both meant to read the same "In-House
  -- Specification," but this is a first-pass reading of a handwritten-
  -- adjacent scan, not confirmed, so the form pre-fills a best guess and
  -- leaves it editable rather than asserting one spelling as fact).
  add column if not exists remarks text;

-- No RLS change needed — coa_insert (0001_init.sql) already grants
-- system_admin/quality_checker/qc_reviewer insert on coa_records, and the
-- new flow inserts through that same table via a plain client insert
-- (Server Action re-verifies the QC is Approved and the template exists
-- server-side before inserting, same as createCoaRecord already does for
-- the QC-approved check), not a new RPC.
