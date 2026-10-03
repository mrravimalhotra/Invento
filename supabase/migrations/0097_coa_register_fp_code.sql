-- =====================================================================
-- COA Template Register: finished-product rows show the Finished Product
-- item code (FP-00001), not the MFR code.
--
-- Ravi (3 Oct 2026): "For Finished product, this should [show the] Finished
-- Product code." The Finished Product item is created when the MFR is
-- approved, so an MFR that is not approved yet has no FP code: it falls back
-- to its MFR code. The MFR code stays available in the new last column
-- `mfr_code` (a view can only gain columns at the end).
-- Safe to run more than once. No data is changed.
-- =====================================================================
create or replace view public.coa_template_register
with (security_invoker = on) as
select
  'raw_material'::text as subject_type,
  i.id as subject_id,
  i.item_code as code,
  i.name as name,
  it.description as item_type,
  i.active as active,
  t.id as template_id,
  coalesce((select count(*) from public.coa_template_lines l where l.coa_template_id = t.id), 0)::int as tests,
  coalesce((select max(revision_no) from public.coa_template_revisions r where r.coa_template_id = t.id), 0)::int as revisions,
  coalesce(t.updated_at, t.created_at) as last_changed_at,
  coalesce(t.updated_by, t.created_by) as last_changed_by,
  null::text as mfr_code
from public.items i
left join public.item_types it on it.id = i.item_type_id
left join public.coa_templates t on t.item_id = i.id
where i.category = 'raw'
union all
select
  'finished_product',
  m.id,
  coalesce(fp.item_code, m.code),
  m.name,
  it.description,
  m.active,
  t.id,
  coalesce((select count(*) from public.coa_template_lines l where l.coa_template_id = t.id), 0)::int,
  coalesce((select max(revision_no) from public.coa_template_revisions r where r.coa_template_id = t.id), 0)::int,
  coalesce(t.updated_at, t.created_at),
  coalesce(t.updated_by, t.created_by),
  m.code
from public.mfr_definitions m
left join public.items fp on fp.id = m.finished_product_item_id
left join public.item_types it on it.id = coalesce(fp.item_type_id, m.item_type_id)
left join public.coa_templates t on t.mfr_definition_id = m.id;

grant select on public.coa_template_register to authenticated;
