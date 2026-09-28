-- ============================================================
-- SEC-06 (docs/AI_TESTING_SECURITY_PERFORMANCE_REFERENCE.md):
-- record_wastage() trusted whatever it was given.
--
-- The previous definition (0036_wastage_batch_required.sql) wrote
-- p_item_id and p_unit into inventory_ledger verbatim and subtracted
-- p_quantity from the batch's live_remaining_qty without checking that:
--   * the batch belongs to that item (item A's stock could be reduced in
--     the ledger while item B's batch balance shrank);
--   * the unit matches the batch's unit — a "500 g" entry against a kg
--     batch removed 500 kg. This was reachable from the normal Wastage
--     screen, whose Unit dropdown offered every unit and defaulted to the
--     ITEM's unit, not the batch's;
--   * the quantity is positive;
--   * the batch is actually in stock (its purchase order submitted).
-- A read-only check on production (28 Sept 2026) found no past wastage
-- entry affected, so no data correction is needed — this only prevents it.
--
-- New behaviour (same name, arguments and return type, so the app keeps
-- calling it unchanged):
--   * the batch row is looked up and locked (FOR UPDATE), so two wastage
--     entries against one batch are applied one after the other;
--   * the ledger row always uses the batch's own item and unit;
--   * p_item_id, if given, must match the batch's item;
--   * p_unit is compared ignoring case/spaces; a different unit in the same
--     family is converted with convert_unit() (e.g. 500 g -> 0.5 kg), an
--     incompatible one is refused;
--   * quantity must be > 0; the batch's PO must be submitted and the line
--     pushed to stock;
--   * live_remaining_not_negative (0029) still caps it at what's left.
--
-- Wrapped in a transaction with a self-check that the function is still
-- SECURITY DEFINER with the expected signature, and that the conversion it
-- relies on behaves as expected.
-- ============================================================

begin;

create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_line record;
  v_from text;
  v_to text;
  v_qty numeric;
  v_id uuid;
begin
  if not public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer') then
    raise exception 'not authorized to record wastage';
  end if;

  if p_purchase_line_id is null then
    raise exception 'Batch (purchase line) is required to record wastage.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Wastage quantity must be greater than zero.';
  end if;

  select pl.id, pl.item_id, pl.unit, pl.batch_number, pl.pushed_at, po.status as po_status
    into v_line
  from public.purchase_lines pl
  join public.purchase_orders po on po.id = pl.purchase_order_id
  where pl.id = p_purchase_line_id
  for update of pl;

  if not found then
    raise exception 'That batch could not be found.';
  end if;

  if v_line.po_status <> 'submitted' or v_line.pushed_at is null then
    raise exception 'Batch % has not been received into stock yet (its purchase order is not submitted), so wastage cannot be recorded against it.',
      v_line.batch_number;
  end if;

  if p_item_id is not null and p_item_id <> v_line.item_id then
    raise exception 'Batch % does not belong to the selected item.', v_line.batch_number;
  end if;

  v_to := lower(trim(v_line.unit));
  v_from := lower(trim(coalesce(nullif(trim(p_unit), ''), v_line.unit)));

  if v_from = v_to then
    v_qty := p_quantity;
  else
    v_qty := public.convert_unit(p_quantity, v_from, v_to);
    if v_qty is null then
      raise exception 'Batch % is held in %, so wastage cannot be recorded in "%". Use % or a unit that converts to it.',
        v_line.batch_number, v_line.unit, p_unit, v_line.unit;
    end if;
  end if;

  insert into public.inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, event_by, reason)
  values ('wastage', v_line.item_id, v_line.id, v_qty, v_line.unit, 'purchase', auth.uid(), p_reason)
  returning id into v_id;

  -- live_remaining_not_negative (0029) is still the real bound on how much
  -- can be written off from this batch.
  update public.purchase_lines
  set live_remaining_qty = live_remaining_qty - v_qty
  where id = v_line.id;

  return v_id;
end $$;

do $$
declare
  v_secdef boolean;
begin
  select p.prosecdef into v_secdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_wastage'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text';
  if v_secdef is null then
    raise exception '0071 self-check failed: record_wastage with the expected signature is missing.';
  end if;
  if not v_secdef then
    raise exception '0071 self-check failed: record_wastage must be SECURITY DEFINER.';
  end if;
  if public.convert_unit(500, 'g', 'kg') <> 0.5
     or public.convert_unit(250, 'ml', 'ltr') <> 0.25
     or public.convert_unit(1, 'nos', 'kg') is not null then
    raise exception '0071 self-check failed: convert_unit() does not behave as record_wastage expects.';
  end if;
end $$;

commit;
