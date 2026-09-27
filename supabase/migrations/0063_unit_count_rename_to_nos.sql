-- ============================================================
-- FB-0039 (Namrata, 24 Sept 2026), refined 27 Sept 2026: "in Item Master,
-- unit count change to 'nos'" — Ravi's own follow-up widened this from a
-- display-only relabel to a real rename of the stored unit value,
-- app-wide, "including data" ("we only have test data currently so no
-- data migration needed as we would purge all current data anyways" —
-- the cleanup UPDATEs below still run so this migration itself doesn't
-- get rejected by the new, stricter CHECK constraints below on whatever
-- rows exist at the moment it's applied; nothing here assumes the purge
-- already happened).
--
-- Scope, confirmed with Ravi: only the unit value literally spelled
-- "count" — the one set on an Item Master item (Raw Material, Packaging,
-- or the Packaged Finished Product item auto-created at MFR approval) —
-- becomes "nos". `unit_count` (a numeric quantity column on
-- packaging_issues, "how many packaged units") is a same-word, unrelated
-- field and is NOT touched anywhere in this migration.
--
-- Four things needed, in this order (constraints dropped before the data
-- cleanup runs, so the cleanup UPDATEs below don't get rejected by the
-- OLD constraint on their way to the new value):
--   1. Drop the two CHECK constraints that hard-code the old unit list.
--   2. Data cleanup: every column that can carry an item's unit onto a
--      transaction row, updated from 'count' to 'nos'.
--   3. Re-add both CHECK constraints with 'nos' in place of 'count'.
--   4. Re-create the three functions that insert the literal 'count':
--      approve_mfr_definition() (0041), bulk_create_mfr_definitions()
--      (0053, the latest of three prior versions), and
--      trg_fn_packaging_transform_and_issue() (0050, the latest of three
--      prior versions) — bodies otherwise unchanged from their current
--      (already-applied) definitions.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the old CHECK constraints.
-- ------------------------------------------------------------
alter table public.items drop constraint if exists items_unit_check;
alter table public.items drop constraint if exists items_default_sample_unit_check;

-- ------------------------------------------------------------
-- 2. Data cleanup — every column that stores an item's unit (or a copy of
--    it on a transaction row). Harmless no-op on any column with zero
--    'count' rows.
-- ------------------------------------------------------------
update public.items set unit = 'nos' where unit = 'count';
update public.items set default_sample_unit = 'nos' where default_sample_unit = 'count';
update public.purchase_lines set unit = 'nos' where unit = 'count';
update public.quality_checks set sample_unit = 'nos' where sample_unit = 'count';
update public.inventory_ledger set unit = 'nos' where unit = 'count';
update public.mfr_definitions set batch_size_unit = 'nos' where batch_size_unit = 'count';
update public.mfr_lines set unit = 'nos' where unit = 'count';
update public.finished_product_batches set unit = 'nos' where unit = 'count';
update public.packaging_issues set pack_size_unit = 'nos' where pack_size_unit = 'count';
update public.packaging_issue_items set unit = 'nos' where unit = 'count';
update public.production_issue_batches set unit = 'nos' where unit = 'count';

-- ------------------------------------------------------------
-- 3. Re-add both CHECK constraints, 'nos' replacing 'count'.
-- ------------------------------------------------------------
alter table public.items
  add constraint items_unit_check
  check (unit in ('kg','g','mg','ltr','ml','nos','bottle','pack'));

alter table public.items
  add constraint items_default_sample_unit_check
  check (default_sample_unit in ('kg','g','mg','ltr','ml','nos','bottle','pack'));

-- ------------------------------------------------------------
-- 4a. approve_mfr_definition() — unchanged from 0041_mfr_deferred_approval.sql
--     except the Packaged FP item's unit literal.
-- ------------------------------------------------------------
create or replace function public.approve_mfr_definition(p_id uuid)
returns table(fp_item_code text, packaged_item_code text, items_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def record;
  v_fp_item_id uuid;
  v_pkg_item_id uuid;
  v_fp_item_code text;
  v_pkg_item_code text;
  v_created boolean := false;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to approve an MFR definition.';
  end if;

  select * into v_def from public.mfr_definitions where mfr_definitions.id = p_id for update;
  if not found then
    raise exception 'MFR definition not found.';
  end if;
  if v_def.approved_by is not null then
    raise exception 'This MFR is already approved.';
  end if;

  if v_def.finished_product_item_id is null then
    v_fp_item_code := public.get_next_item_code('processed');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_fp_item_code, v_def.name, 'processed', v_def.item_type_id, v_def.batch_size_unit)
      returning items.id into v_fp_item_id;

    v_pkg_item_code := public.get_next_item_code('packaged_fp');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_pkg_item_code, v_def.name, 'packaged_fp', v_def.item_type_id, 'nos')
      returning items.id into v_pkg_item_id;

    update public.items set packaged_item_id = v_pkg_item_id where items.id = v_fp_item_id;

    update public.mfr_definitions set finished_product_item_id = v_fp_item_id where mfr_definitions.id = p_id;
    v_created := true;
  else
    v_fp_item_id := v_def.finished_product_item_id;
    select item_code, packaged_item_id into v_fp_item_code, v_pkg_item_id
      from public.items where items.id = v_fp_item_id;
    if v_pkg_item_id is not null then
      select item_code into v_pkg_item_code from public.items where items.id = v_pkg_item_id;
    end if;
  end if;

  update public.mfr_definitions
    set approved_by = auth.uid(), approved_at = now()
    where mfr_definitions.id = p_id;

  fp_item_code := v_fp_item_code;
  packaged_item_code := v_pkg_item_code;
  items_created := v_created;
  return next;
end $$;

-- ------------------------------------------------------------
-- 4b. bulk_create_mfr_definitions() — unchanged from
--     0053_bulk_upload_mfr_procedure.sql except the Packaged FP item's
--     unit literal. Same OUT columns as 0053 (fp_item_code/
--     packaged_item_code included), so no drop-first needed here.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4c. trg_fn_packaging_transform_and_issue() — unchanged from
--     0050_production_rm_from_packaging.sql except the two Packaged FP
--     ledger-row unit literals (push/pull). The existing trigger
--     (0032_packaged_finished_product.sql) already points at this
--     function by name — create or replace alone picks up the new body,
--     same note 0050 itself left.
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_transform_and_issue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mfr_definition_id uuid;
  v_fp_item_id uuid;
  v_fp_unit text;
  v_pkg_item_id uuid;
  v_rm_item_id uuid;
  v_rm_item_code text;
  v_fp_item_code text;
  v_fp_item_name text;
  v_fp_item_type_id uuid;
  v_batch_number text;
begin
  if new.department not in ('store', 'rnd', 'production') then
    return new;
  end if;

  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  select fpb.mfr_definition_id into v_mfr_definition_id
    from public.finished_product_batches fpb
    where fpb.id = new.finished_product_batch_id;

  select md.finished_product_item_id into v_fp_item_id
    from public.mfr_definitions md
    where md.id = v_mfr_definition_id;

  if v_fp_item_id is null then
    return new;
  end if;

  if new.department = 'production' then
    select unit, item_code, name, item_type_id, production_rm_item_id
      into v_fp_unit, v_fp_item_code, v_fp_item_name, v_fp_item_type_id, v_rm_item_id
      from public.items where id = v_fp_item_id for update;

    if v_rm_item_id is null then
      v_rm_item_code := public.get_next_production_rm_item_code();
      insert into public.items (item_code, name, category, item_type_id, unit)
        values (v_rm_item_code, v_fp_item_name, 'raw', v_fp_item_type_id, v_fp_unit)
        returning id into v_rm_item_id;
      update public.items set production_rm_item_id = v_rm_item_id where id = v_fp_item_id;
    end if;

    perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('push', v_rm_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'production_rm_yield', new.id, auth.uid());

    v_batch_number := public.get_next_production_batch_number(v_rm_item_id);
    insert into public.production_issue_batches
      (packaging_issue_id, item_id, batch_number, quantity, unit, live_remaining_qty, created_by)
    values
      (new.id, v_rm_item_id, v_batch_number, new.fp_qty_consumed, v_fp_unit, new.fp_qty_consumed, auth.uid());

    return new;
  end if;

  select unit, packaged_item_id into v_fp_unit, v_pkg_item_id
    from public.items where id = v_fp_item_id;

  if v_pkg_item_id is null then
    return new;
  end if;

  perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('push', v_pkg_item_id, new.unit_count, 'nos', new.department, 'packaged_fp_yield', new.id, auth.uid());

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_pkg_item_id, new.unit_count, 'nos', new.department, 'packaged_fp_issue', new.id, auth.uid());

  return new;
end $$;
