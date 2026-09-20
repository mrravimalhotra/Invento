-- ============================================================
-- Bulk data upload — MFR RPC, extended for Manufacturing Process.
--
-- Ravi (20 Sept 2026): "do similar changes in MFR template. ... Also
-- include template to upload 'Manufacturing Process' along with recipe."
-- The app-layer bulk-upload template/parser (lib/bulk-upload/schemas.ts,
-- templates.ts, lib/actions/bulk-upload.ts) now lets one flat file carry,
-- per MFR group, both recipe lines (as before) and Manufacturing Process
-- rows (Procedure Intro / Theoretical Yield % / Permissible Yield % as
-- header-level fields, plus Stage/Operation per procedure-step row) — the
-- same fields update_mfr_procedure() (0048_mfr_procedure.sql) already
-- persists for the one-MFR-at-a-time UI flow.
--
-- bulk_create_mfr_definitions() (0037_bulk_upload_mfr.sql) doesn't know
-- about that schema at all yet: without this migration, the extra
-- procedure_intro/theoretical_yield_pct/permissible_yield_pct/
-- procedure_steps keys the app now sends would simply be ignored by the
-- JSONB payload reader below, so Manufacturing Process data typed into
-- the bulk template would silently fail to save even though the upload
-- itself reports success. This migration closes that gap by teaching the
-- same all-or-nothing RPC to also read and persist those fields, mirroring
-- update_mfr_procedure()'s exact validation:
--   - theoretical_yield_pct / permissible_yield_pct, if provided, must be
--     greater than 0;
--   - every procedure step needs both stage and operation, non-blank;
--   - the procedure is optional — an MFR with no procedure_steps (and no
--     intro/yields) is inserted exactly as it always has been.
-- Everything else about the function (recipe-lines handling, the FP/
-- packaged-FP/mfr_definitions insert sequence, the role check, the
-- sequence-advance caveat) is unchanged from 0037.
-- ============================================================

create or replace function public.bulk_create_mfr_definitions(p_payload jsonb)
returns table(mfr_name text, mfr_code text, fp_item_code text, packaged_item_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def jsonb;
  v_line jsonb;
  v_step jsonb;
  v_name text;
  v_batch_qty numeric;
  v_batch_unit text;
  v_item_type_id uuid;
  v_lines jsonb;
  v_steps jsonb;
  v_procedure_intro text;
  v_theoretical_yield_pct numeric;
  v_permissible_yield_pct numeric;
  v_fp_item_id uuid;
  v_fp_item_code text;
  v_pkg_item_id uuid;
  v_pkg_item_code text;
  v_mfr_code text;
  v_def_id uuid;
  v_idx int := 0;
  v_step_idx int;
begin
  -- Same reason record_wastage()/submit_purchase_order() check roles
  -- explicitly: SECURITY DEFINER bypasses RLS entirely, so the RLS
  -- policies on items/mfr_definitions/mfr_lines/mfr_procedure_steps are
  -- not what's actually gating this call — this check is. Mirrors
  -- MODULE_WRITE_ROLES.mfr (lib/constants/roles.ts).
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to bulk-create MFR definitions.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No MFR definitions to create.';
  end if;

  for v_def in select * from jsonb_array_elements(p_payload)
  loop
    v_idx := v_idx + 1;
    v_name := trim(both from coalesce(v_def->>'name', ''));
    v_batch_qty := nullif(v_def->>'batch_size_qty', '')::numeric;
    v_batch_unit := v_def->>'batch_size_unit';
    v_item_type_id := nullif(v_def->>'item_type_id', '')::uuid;
    v_lines := v_def->'lines';
    v_steps := v_def->'procedure_steps';
    v_procedure_intro := nullif(trim(both from coalesce(v_def->>'procedure_intro', '')), '');
    v_theoretical_yield_pct := nullif(v_def->>'theoretical_yield_pct', '')::numeric;
    v_permissible_yield_pct := nullif(v_def->>'permissible_yield_pct', '')::numeric;

    if v_name = '' then
      raise exception 'MFR #%: name is required.', v_idx;
    end if;
    if v_batch_qty is null or v_batch_qty <= 0 then
      raise exception 'MFR "%": batch size must be greater than 0.', v_name;
    end if;
    if v_batch_unit is null or v_batch_unit = '' then
      raise exception 'MFR "%": batch size unit is required.', v_name;
    end if;
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'MFR "%": needs at least one recipe line.', v_name;
    end if;
    -- Same bounds update_mfr_procedure() enforces for the one-at-a-time
    -- UI flow — kept here too since this RPC is a defensive backstop,
    -- not just a pass-through of app-layer-validated data.
    if v_theoretical_yield_pct is not null and v_theoretical_yield_pct <= 0 then
      raise exception 'MFR "%": theoretical yield must be greater than 0.', v_name;
    end if;
    if v_permissible_yield_pct is not null and v_permissible_yield_pct <= 0 then
      raise exception 'MFR "%": permissible yield must be greater than 0.', v_name;
    end if;

    -- 1. Finished Product item — same shape as createMfrDefinition()'s
    --    first insert.
    v_fp_item_code := public.get_next_item_code('processed');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_fp_item_code, v_name, 'processed', v_item_type_id, v_batch_unit)
      returning id into v_fp_item_id;

    -- 2. Paired Packaged Finished Product item (Task F) — same as
    --    createMfrDefinition()'s second insert.
    v_pkg_item_code := public.get_next_item_code('packaged_fp');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_pkg_item_code, v_name, 'packaged_fp', v_item_type_id, 'count')
      returning id into v_pkg_item_id;

    update public.items set packaged_item_id = v_pkg_item_id where id = v_fp_item_id;

    -- 3. MFR definition itself, now including the optional Manufacturing
    --    Process header fields (procedure_intro / theoretical_yield_pct /
    --    permissible_yield_pct — same three columns 0048_mfr_procedure.sql
    --    added, all nullable).
    v_mfr_code := public.get_next_mfr_code();
    insert into public.mfr_definitions (
      code, name, batch_size_qty, batch_size_unit, finished_product_item_id,
      procedure_intro, theoretical_yield_pct, permissible_yield_pct
    )
      values (
        v_mfr_code, v_name, v_batch_qty, v_batch_unit, v_fp_item_id,
        v_procedure_intro, v_theoretical_yield_pct, v_permissible_yield_pct
      )
      returning id into v_def_id;

    -- 4. Recipe lines (version 1 — a bulk-created MFR has no prior
    --    version to increment past, same as a manually-created one).
    for v_line in select * from jsonb_array_elements(v_lines)
    loop
      if (v_line->>'item_id') is null or (v_line->>'quantity') is null
         or v_line->>'unit' is null or v_line->>'unit' = '' then
        raise exception 'MFR "%": every recipe line needs an item, quantity, and unit.', v_name;
      end if;
      if (v_line->>'quantity')::numeric <= 0 then
        raise exception 'MFR "%": recipe line quantity must be greater than 0.', v_name;
      end if;
      insert into public.mfr_lines (mfr_definition_id, version, item_id, quantity, unit)
        values (v_def_id, 1, (v_line->>'item_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit');
    end loop;

    -- 5. Manufacturing Process steps (version 1, step_no by array order —
    --    same shape update_mfr_procedure() writes, optional: an MFR with
    --    no procedure_steps simply gets none, same as today).
    if v_steps is not null and jsonb_typeof(v_steps) = 'array' and jsonb_array_length(v_steps) > 0 then
      v_step_idx := 0;
      for v_step in select * from jsonb_array_elements(v_steps)
      loop
        v_step_idx := v_step_idx + 1;
        if (v_step->>'stage') is null or v_step->>'stage' = ''
           or (v_step->>'operation') is null or v_step->>'operation' = '' then
          raise exception 'MFR "%": procedure step % needs both a stage and an operation.', v_name, v_step_idx;
        end if;
        insert into public.mfr_procedure_steps (mfr_definition_id, version, step_no, stage, operation)
          values (v_def_id, 1, v_step_idx, v_step->>'stage', v_step->>'operation');
      end loop;
    end if;

    mfr_name := v_name;
    mfr_code := v_mfr_code;
    fp_item_code := v_fp_item_code;
    packaged_item_code := v_pkg_item_code;
    return next;
  end loop;
end $$;

-- No explicit grant needed — 0001_init.sql's
-- `alter default privileges in schema public grant execute on functions
-- to anon, authenticated` already covers every function created after
-- it (see 0037's/0048's own closing note).
