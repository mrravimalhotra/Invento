-- ============================================================
-- Part A batch 2 — database hardening (A7–A14 of the open-items master
-- list; audit items DES-04, DES-05, DES-06, DES-07, DES-08, DES-12,
-- DES-13). Nothing here changes existing rows: every new CHECK is NOT
-- VALID (applies to new writes only), the guards only look at future
-- writes, and the drops remove objects nothing references.
--
-- A7  Delete rights only while a record is still editable:
--       * finished_product_components — no screen ever edits or deletes
--         one; the rows are written by the batch-creation RPC and each
--         insert has already pulled stock, so a direct edit/delete would
--         leave the ledger and the batch balance out of step. Direct
--         client UPDATE/DELETE is now refused (Draft-cancel, the stale-
--         draft expiry and an admin deleting the whole batch are
--         unaffected: they run as postgres or through the FK cascade).
--       * documents, coa_templates — QC roles keep add/edit; delete is
--         System Admin only, like every other master table.
--       * mfr_lines — already locked once the MFR is approved (0070).
--       * mfr_procedure_steps — editable at any time by design (0048).
--       * bmr_* — deprecated, deliberately untouched.
-- A8  CHECK constraints on equipment quantity, dead-stock amounts, MFR
--     batch size (NOT VALID).
-- A9  purge_test_data(): also resets item_code_seq_rmfp, drops the
--     retired fp_batch_seq, and reports the four tables that were being
--     emptied by the cascade but not listed in its result.
-- A10 bulk_create_mfr_definitions(): no longer creates the Finished
--     Product / Packaged FP items at import. They are created when the
--     MFR is approved, exactly as for a single MFR (0041), so an
--     unapproved bulk MFR no longer leaves orphan items or burns codes.
-- A11 Paired items must be the right category (packaged_item_id ->
--     packaged_fp, production_rm_item_id -> raw, holder = processed;
--     mfr_definitions.finished_product_item_id -> processed).
-- A13 page_feedback.submitted_by_name is taken from the submitter's
--     profile by a trigger, so it cannot be faked through the API.
-- A14 Dead code removed: trg_qc_sample_pull + trg_fn_qc_sample_pull (a
--     no-op since 0028), trg_fn_purchase_line_push (trigger dropped in
--     0019) and fp_batch_seq (unused since 0045). Unused columns stay.
-- ============================================================

-- ------------------------------------------------------------
-- A7. finished_product_components: no direct edits or deletes
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_fp_components_locked()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_direct_client_write() then
    return coalesce(new, old);
  end if;

  -- A parent that no longer exists (an admin deleting the whole batch,
  -- which cascades here) is not blocked.
  if not exists (
    select 1 from public.finished_product_batches where id = old.finished_product_batch_id
  ) then
    return coalesce(new, old);
  end if;

  raise exception 'Batch components are recorded when the batch is created and can''t be changed or deleted directly. Cancel the draft batch instead.'
    using errcode = '42501';
end $$;

drop trigger if exists trg_00_guard_fp_components_locked on public.finished_product_components;
create trigger trg_00_guard_fp_components_locked
  before update or delete on public.finished_product_components
  for each row execute function public.trg_fn_guard_fp_components_locked();

-- ------------------------------------------------------------
-- A7. documents / coa_templates: split the catch-all write policy so
--     delete is System Admin only (add and edit unchanged).
-- ------------------------------------------------------------
drop policy if exists documents_write on public.documents;
create policy documents_insert on public.documents for insert
  with check (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'));
create policy documents_update on public.documents for update
  using (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'))
  with check (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'));
create policy documents_delete on public.documents for delete
  using (public.has_any_role('system_admin'));

drop policy if exists coa_templates_write on public.coa_templates;
create policy coa_templates_insert on public.coa_templates for insert
  with check (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'));
create policy coa_templates_update on public.coa_templates for update
  using (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'))
  with check (public.has_any_role('system_admin', 'quality_checker', 'qc_reviewer'));
create policy coa_templates_delete on public.coa_templates for delete
  using (public.has_any_role('system_admin'));

-- ------------------------------------------------------------
-- A8. Sanity CHECKs (new writes only; existing rows are not scanned)
-- ------------------------------------------------------------
alter table public.equipment
  drop constraint if exists equipment_quantity_positive,
  add constraint equipment_quantity_positive check (quantity > 0) not valid;

alter table public.dead_stock_items
  drop constraint if exists dead_stock_quantity_positive,
  drop constraint if exists dead_stock_price_nonneg,
  drop constraint if exists dead_stock_depreciation_range,
  drop constraint if exists dead_stock_rejected_nonneg,
  drop constraint if exists dead_stock_balance_nonneg,
  add constraint dead_stock_quantity_positive check (quantity > 0) not valid,
  add constraint dead_stock_price_nonneg check (purchase_price is null or purchase_price >= 0) not valid,
  add constraint dead_stock_depreciation_range check (depreciation_pct >= 0 and depreciation_pct <= 100) not valid,
  add constraint dead_stock_rejected_nonneg check (rejected_qty >= 0 and rejected_value >= 0) not valid,
  add constraint dead_stock_balance_nonneg check (
    (balance_qty is null or balance_qty >= 0) and (balance_value is null or balance_value >= 0)
  ) not valid;

alter table public.mfr_definitions
  drop constraint if exists mfr_definitions_batch_size_positive,
  add constraint mfr_definitions_batch_size_positive check (batch_size_qty > 0) not valid;

-- ------------------------------------------------------------
-- A9 + A14 (fp_batch_seq). purge_test_data(): complete lists.
--     Recreated without fp_batch_seq (dropped below) and with
--     item_code_seq_rmfp. The four extra tables were already emptied by
--     the TRUNCATE ... CASCADE; listing them just makes the result
--     table report them.
-- ------------------------------------------------------------
create or replace function public.purge_test_data()
returns table(table_name text, rows_purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'bmr_observations', 'bmr_records', 'bmr_weighment_lines', 'coa_records',
    'coa_template_lines', 'coa_templates',
    'dead_stock_items', 'documents', 'environmental_control_readings', 'equipment',
    'finished_product_batches', 'finished_product_components', 'inventory_ledger',
    'item_types', 'items', 'line_clearance_checks', 'mfr_definitions', 'mfr_lines',
    'mfr_procedure_steps', 'packaging_issue_items', 'packaging_issues',
    'production_issue_batches', 'purchase_lines', 'purchase_orders',
    'quality_checks', 'vendors'
  ];
  -- feedback_ticket_seq intentionally excluded — page_feedback is kept.
  v_sequences text[] := array[
    'item_code_seq_raw', 'item_code_seq_pkg', 'item_code_seq_fp', 'item_code_seq_pkgfp',
    'item_code_seq_rmfp',
    'vendor_code_seq', 'po_number_seq', 'ar_number_seq', 'mfr_code_seq',
    'coa_number_seq', 'equipment_code_seq', 'dead_stock_code_seq', 'packaging_issue_code_seq'
  ];
  v_tbl text;
  v_seq text;
  v_count bigint;
  v_truncate_list text;
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only System Admin can purge test data.';
  end if;

  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I', v_tbl) into v_count;
    table_name := v_tbl;
    rows_purged := v_count;
    return next;
  end loop;

  select string_agg(format('public.%I', t), ', ') into v_truncate_list from unnest(v_tables) as t;
  execute format('truncate table %s restart identity cascade', v_truncate_list);

  foreach v_seq in array v_sequences loop
    execute format('alter sequence public.%I restart with 1', v_seq);
  end loop;
end $$;

-- ------------------------------------------------------------
-- A10. bulk_create_mfr_definitions(): defer item creation to approval
--      (same as create_mfr_definition, 0041). The return shape shrinks
--      to (mfr_name, mfr_code), so the old function is dropped first.
-- ------------------------------------------------------------
drop function if exists public.bulk_create_mfr_definitions(jsonb);

create function public.bulk_create_mfr_definitions(p_payload jsonb)
returns table(mfr_name text, mfr_code text)
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

    -- No Finished Product / Packaged FP items here — approve_mfr_definition()
    -- creates them (finished_product_item_id stays null until then).
    v_mfr_code := public.get_next_mfr_code();
    insert into public.mfr_definitions (
      code, name, batch_size_qty, batch_size_unit, item_type_id,
      procedure_intro, theoretical_yield_pct, permissible_yield_pct
    )
      values (
        v_mfr_code, v_name, v_batch_qty, v_batch_unit, v_item_type_id,
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
    return next;
  end loop;
end $$;

revoke all on function public.bulk_create_mfr_definitions(jsonb) from public, anon;
grant execute on function public.bulk_create_mfr_definitions(jsonb) to authenticated;

-- ------------------------------------------------------------
-- A11. Pairing pointers must point at the right category
--      Checked only when the pointer is set or changed, so unrelated
--      updates to a legacy row are never blocked.
-- ------------------------------------------------------------
create or replace function public.trg_fn_check_item_pairing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
begin
  if new.packaged_item_id is not null
     and (tg_op = 'INSERT' or new.packaged_item_id is distinct from old.packaged_item_id) then
    select category into v_cat from public.items where id = new.packaged_item_id;
    if new.category <> 'processed' or v_cat is distinct from 'packaged_fp' then
      raise exception 'A Finished Product item can only be paired with a Packaged Finished Product item.'
        using errcode = '23514';
    end if;
  end if;

  if new.production_rm_item_id is not null
     and (tg_op = 'INSERT' or new.production_rm_item_id is distinct from old.production_rm_item_id) then
    select category into v_cat from public.items where id = new.production_rm_item_id;
    if new.category <> 'processed' or v_cat is distinct from 'raw' then
      raise exception 'A Finished Product item can only be paired with a Raw Material item as its production stock.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_items_check_pairing on public.items;
create trigger trg_items_check_pairing
  before insert or update of packaged_item_id, production_rm_item_id on public.items
  for each row execute function public.trg_fn_check_item_pairing();

create or replace function public.trg_fn_check_mfr_fp_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cat text;
begin
  if new.finished_product_item_id is not null
     and (tg_op = 'INSERT' or new.finished_product_item_id is distinct from old.finished_product_item_id) then
    select category into v_cat from public.items where id = new.finished_product_item_id;
    if v_cat is distinct from 'processed' then
      raise exception 'An MFR can only be linked to a Finished Product item.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_mfr_def_check_fp_item on public.mfr_definitions;
create trigger trg_mfr_def_check_fp_item
  before insert or update of finished_product_item_id on public.mfr_definitions
  for each row execute function public.trg_fn_check_mfr_fp_item();

-- ------------------------------------------------------------
-- A13. Feedback: the submitter's name comes from their profile
--      (or their email when the profile has no name — the same
--      fallback the app uses), never from the request.
-- ------------------------------------------------------------
create or replace function public.trg_fn_feedback_set_submitter_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if new.submitted_by is null then
    return new;
  end if;
  select coalesce(p.full_name, u.email)
    into v_name
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = new.submitted_by;
  if v_name is not null then
    new.submitted_by_name := v_name;
  end if;
  return new;
end $$;

drop trigger if exists trg_00_feedback_submitter_name on public.page_feedback;
create trigger trg_00_feedback_submitter_name
  before insert on public.page_feedback
  for each row execute function public.trg_fn_feedback_set_submitter_name();

-- ------------------------------------------------------------
-- A14. Dead code
-- ------------------------------------------------------------
drop trigger if exists trg_qc_sample_pull on public.quality_checks;
drop function if exists public.trg_fn_qc_sample_pull();
drop function if exists public.trg_fn_purchase_line_push();
drop sequence if exists public.fp_batch_seq;

-- ------------------------------------------------------------
-- Self-check: abort everything if a piece is missing.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_00_guard_fp_components_locked')
     or not exists (select 1 from pg_trigger where tgname = 'trg_items_check_pairing')
     or not exists (select 1 from pg_trigger where tgname = 'trg_mfr_def_check_fp_item')
     or not exists (select 1 from pg_trigger where tgname = 'trg_00_feedback_submitter_name') then
    raise exception '0086 self-check failed: a trigger is missing.';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_qc_sample_pull')
     or exists (select 1 from pg_class where relname = 'fp_batch_seq') then
    raise exception '0086 self-check failed: dead objects still present.';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public'
        and policyname in ('documents_insert','documents_update','documents_delete',
                           'coa_templates_insert','coa_templates_update','coa_templates_delete')) <> 6 then
    raise exception '0086 self-check failed: split policies missing.';
  end if;
end $$;
