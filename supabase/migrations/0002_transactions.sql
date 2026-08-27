-- ============================================================
-- Invento v2 — transactional side effects (inventory ledger)
-- All SECURITY DEFINER so they can write to inventory_ledger despite its
-- "no direct write" RLS policy. Each fires inside the same transaction as
-- the triggering insert, so a partial failure rolls back everything —
-- this is the DB-level fix for the baseline's "not built atomically" gaps.
-- ============================================================

-- A. Purchase line insert -> push remaining_qty (never the full quantity —
--    this is the "Automatic Sampling Deduction" fix, DESIGN.md §7.1).
create or replace function public.trg_fn_purchase_line_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.remaining_qty > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('push', new.item_id, new.id, new.remaining_qty, new.unit, 'purchase', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_purchase_line_push
  after insert on public.purchase_lines
  for each row execute function public.trg_fn_purchase_line_push();

-- B. QC record insert against an RM batch -> pull the sample out of stock
--    at the moment testing actually starts, not at purchase time.
create or replace function public.trg_fn_qc_sample_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purchase_line_id is not null and coalesce(new.sample_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', new.item_id, new.purchase_line_id, new.sample_qty, new.sample_unit, 'qc', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger trg_qc_sample_pull
  after insert on public.quality_checks
  for each row execute function public.trg_fn_qc_sample_pull();

-- C. Finished Product composition line insert -> pull the scaled quantity
--    from the chosen (QC-Approved — enforced by trg_fp_component_qc_gate)
--    RM batch.
create or replace function public.trg_fn_fp_component_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, reference_type, reference_id, event_by)
  values
    ('pull', new.item_id, new.purchase_line_id, new.quantity, 'finished_product', new.finished_product_batch_id, auth.uid());
  return new;
end $$;
create trigger trg_fp_component_pull
  after insert on public.finished_product_components
  for each row execute function public.trg_fn_fp_component_pull();

-- D. Packaging issue insert -> pull the packaging material used, and bump
--    the FP batch's running packaged_qty (see DESIGN.md §9 — a simple
--    running counter, not unit-converted against net_weight in this pass).
create or replace function public.trg_fn_packaging_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_ledger
    (event_type, item_id, quantity, department, reference_type, reference_id, event_by)
  values
    ('pull', new.packaging_item_id, new.packaging_qty_used, new.department, 'packaging', new.id, auth.uid());

  update public.finished_product_batches
    set packaged_qty = packaged_qty +
      case new.transaction_type when 'unpack' then -new.unit_count else new.unit_count end
    where id = new.finished_product_batch_id;
  return new;
end $$;
create trigger trg_packaging_pull
  after insert on public.packaging_issues
  for each row execute function public.trg_fn_packaging_pull();

-- E. Wastage helper — RPC used by the Inventory Ledger module's "record
--    wastage" action (a dedicated event type the baseline never had).
create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer') then
    raise exception 'not authorized to record wastage';
  end if;
  insert into public.inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, event_by)
  values ('wastage', p_item_id, p_purchase_line_id, p_quantity, p_unit, 'purchase', auth.uid())
  returning id into v_id;
  return v_id;
end $$;
