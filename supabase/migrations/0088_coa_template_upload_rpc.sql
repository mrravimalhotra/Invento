-- ============================================================
-- 0088 — COA Templates bulk upload: re-create the upload function
--
-- Live symptom (30 Sept 2026): uploading the COA Templates sheet failed with
-- "Something went wrong (reference PGRST202)". PGRST202 = the database API
-- could not find the function `bulk_create_coa_templates(p_payload jsonb)`.
-- The function is defined in 0062 but was missing from (or not visible to)
-- the live API.
--
-- This migration is safe to run whether or not the function already exists:
--   1. re-creates the function exactly as in 0062 (create or replace),
--   2. grants it explicitly (0062 relied on default privileges),
--   3. asks the database API to reload its function list, so the fix works
--      without waiting or restarting anything.
-- No data is read or changed.
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

revoke all on function public.bulk_create_coa_templates(jsonb) from public, anon;
grant execute on function public.bulk_create_coa_templates(jsonb) to authenticated;

notify pgrst, 'reload schema';
