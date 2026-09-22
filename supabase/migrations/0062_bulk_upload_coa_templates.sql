-- ============================================================
-- Bulk Data Upload — COA Templates.
--
-- Ravi (22 Sept 2026), via a screenshot of the COA Template edit screen
-- (app/(dashboard)/coa/templates/[itemTypeId]/page.tsx): "we want to
-- automate data upload of this screen per item type. So template will
-- have 3 inputs, Item Type, Test and specification." This is templates
-- only (the Test/Specification list a certificate is later generated
-- from) — a materially different, simpler thing than bulk-generating
-- actual certificates against approved batches, which was the first
-- (wrong) reading of Ravi's earlier, less specific "bulk upload
-- Certificate of Analysis" request; superseded by this screenshot.
--
-- One row = one Test/Specification line; several rows sharing the same
-- Item Type become that item type's template, grouped app-side in
-- lib/actions/bulk-upload.ts's bulkUploadCoaTemplates() exactly the way
-- MFR recipe lines are grouped by MFR Name. Needs its own RPC (rather
-- than looping upsert_coa_template() from application code once per
-- group) for the same reason MFR/Purchase bulk upload do
-- (bulk_create_mfr_definitions/bulk_create_purchase_orders): true
-- all-or-nothing atomicity across every item type in the file, in one
-- transaction, not just within any one group.
--
-- Deliberately CREATE-only, unlike upsert_coa_template() (which is a
-- true upsert, meant for hand-editing one existing template in place).
-- A row whose Item Type already has a template raises and rolls back the
-- whole file — same "reject an existing name, never silently overwrite"
-- convention as every other master-data bulk upload in this app (Item
-- Type Master's Description, Vendor Master's Name, etc.), chosen over
-- overwrite per the working agreement's "never modify existing data
-- without flagging it first." The app-side pre-check in
-- bulkUploadCoaTemplates() gives a friendly named error before this RPC
-- is ever called; the check repeated here is defense-in-depth against a
-- template created by someone else in the gap between download and
-- upload (same belt-and-suspenders relationship the unique constraint on
-- coa_templates.item_type_id already has with that same app-side check).
-- ============================================================

create or replace function public.bulk_create_coa_templates(p_payload jsonb)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group jsonb;
  v_lines jsonb;
  v_line jsonb;
  v_item_type_id uuid;
  v_template_id uuid;
  v_idx int;
begin
  if not public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer') then
    raise exception 'Not authorized to manage Certificate of Analysis templates.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No COA template rows to import.';
  end if;

  for v_group in select * from jsonb_array_elements(p_payload)
  loop
    v_item_type_id := (v_group->>'item_type_id')::uuid;
    if v_item_type_id is null then
      raise exception 'Item Type is required for every row.';
    end if;
    if exists (select 1 from public.coa_templates where item_type_id = v_item_type_id) then
      raise exception 'An item type in this file already has a COA template — edit it from Manage Templates instead of uploading it again.';
    end if;

    v_lines := v_group->'lines';
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'At least one test is required per item type.';
    end if;

    insert into public.coa_templates (item_type_id, created_by)
    values (v_item_type_id, auth.uid())
    returning id into v_template_id;

    v_idx := 0;
    for v_line in select * from jsonb_array_elements(v_lines)
    loop
      v_idx := v_idx + 1;
      if (v_line->>'test') is null or v_line->>'test' = ''
         or (v_line->>'specification') is null or v_line->>'specification' = '' then
        raise exception 'Both Test and Specification are required for every row.';
      end if;
      insert into public.coa_template_lines (coa_template_id, seq, test, specification)
      values (v_template_id, v_idx, v_line->>'test', v_line->>'specification');
    end loop;

    return next v_template_id;
  end loop;

  return;
end $$;

-- No explicit grant needed — 0001_init.sql's `alter default privileges ...
-- grant execute on functions to anon, authenticated` already covers every
-- function created after it (same closing note as 0037/0041/0048/0059).
