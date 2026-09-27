-- ============================================================
-- Fixes a latent bug in the migration history, found (not caused) while
-- verifying migration 0063 — flagged to Ravi and fixed at his request
-- (27 Sept 2026), unrelated to FB-0039/0063's own change.
--
-- 0037_bulk_upload_mfr.sql originally created bulk_create_mfr_definitions()
-- returning 4 columns (mfr_name, mfr_code, fp_item_code, packaged_item_code).
-- 0041_mfr_deferred_approval.sql needed to drop the item-code columns
-- (item creation moved to approve_mfr_definition()) and correctly did
-- `drop function if exists ...` before recreating it with just 2 columns
-- (mfr_name, mfr_code) — Postgres requires the drop whenever a function's
-- OUT/return-table columns change; plain CREATE OR REPLACE can't do it.
-- 0053_bulk_upload_mfr_procedure.sql then needed to go back to 4 columns
-- (adding fp_item_code/packaged_item_code back, since bulk MFR creation
-- reverted to eager item creation) but used a plain `create or replace
-- function` with no drop first.
--
-- On a fresh database, replaying every migration in strict order (0001
-- through the latest) fails at 0053 with:
--   ERROR: cannot change return type of existing function
--   DETAIL: Row type defined by OUT parameters is different.
--   HINT: Use DROP FUNCTION bulk_create_mfr_definitions(jsonb) first.
-- confirmed by actually doing that replay, locally, against Postgres 16,
-- while verifying 0063.
--
-- This migration is a pure repair of that replay path — not a behavior
-- change. The function body below is byte-for-byte the same as 0053's
-- (itself unchanged since), just preceded by the DROP that migration
-- should have had. Run on a database that already has the 4-column
-- version live (drop + immediate recreate with the same signature), it's
-- a no-op; run during a fresh from-scratch replay, it's what lets 0053
-- (and everything after it, including 0063) actually apply.
-- ============================================================

drop function if exists public.bulk_create_mfr_definitions(jsonb);

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
    if v_theoretical_yield_pct is not null and v_theoretical_yield_pct <= 0 then
      raise exception 'MFR "%": theoretical yield must be greater than 0.', v_name;
    end if;
    if v_permissible_yield_pct is not null and v_permissible_yield_pct <= 0 then
      raise exception 'MFR "%": permissible yield must be greater than 0.', v_name;
    end if;

    v_fp_item_code := public.get_next_item_code('processed');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_fp_item_code, v_name, 'processed', v_item_type_id, v_batch_unit)
      returning id into v_fp_item_id;

    v_pkg_item_code := public.get_next_item_code('packaged_fp');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_pkg_item_code, v_name, 'packaged_fp', v_item_type_id, 'nos')
      returning id into v_pkg_item_id;

    update public.items set packaged_item_id = v_pkg_item_id where id = v_fp_item_id;

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
