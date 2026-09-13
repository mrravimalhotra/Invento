-- ============================================================
-- FB-0033 / FB-0034 (exact duplicates of each other, per the 12 Sept 2026
-- tester triage in claude/feedback-status.md's Fifteenth pass): "In
-- wastage entry, batch number of RM/FP should be compulsory."
--
-- Today the Wastage form's batch (purchase line) field is optional —
-- record_wastage() happily accepts p_purchase_line_id = null, in which
-- case the wastage is only checked against the item's overall on-hand
-- balance (check_sufficient_stock(), 0033_sufficient_stock_check.sql),
-- never tied to a specific received batch. Ravi wants batch selection
-- required going forward, but explicitly NOT retroactively — existing
-- wastage rows recorded without a batch (historical records, predating
-- this change) are left exactly as they are, no backfill, no cleanup.
--
-- THE FIX
-- --------
-- 1. record_wastage() now raises a friendly exception if
--    p_purchase_line_id is null, before doing anything else. This is the
--    real enforcement — RLS's ledger_no_direct_write policy (0001_init.sql,
--    `for insert with check (false)`) already means this
--    security-definer RPC is the ONLY way any code path can insert an
--    inventory_ledger row, so there's no other route into the table to
--    close.
-- 2. A `not valid` CHECK constraint on inventory_ledger, same idiom as
--    0016_quantity_check_constraints.sql and 0029's
--    live_remaining_not_negative: defense-in-depth for the (currently
--    hypothetical) case of a future write path, without scanning or
--    rejecting a single existing row. `not valid` means it only applies
--    to new inserts/updates from here on — every historical wastage row
--    with a null purchase_line_id is grandfathered in untouched, and
--    every non-wastage event_type (push/pull, which legitimately use
--    purchase_line_id in their own ways, including null for some pull
--    types) is unaffected since the constraint only constrains rows
--    where event_type = 'wastage'.
-- ============================================================

alter table public.inventory_ledger
  drop constraint if exists wastage_requires_batch;
alter table public.inventory_ledger
  add constraint wastage_requires_batch
  check (event_type <> 'wastage' or purchase_line_id is not null) not valid;

create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer') then
    raise exception 'not authorized to record wastage';
  end if;

  if p_purchase_line_id is null then
    raise exception 'Batch (purchase line) is required to record wastage.';
  end if;

  insert into public.inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, event_by, reason)
  values ('wastage', p_item_id, p_purchase_line_id, p_quantity, p_unit, 'purchase', auth.uid(), p_reason)
  returning id into v_id;

  -- live_remaining_not_negative (0029) is still the real bound on a
  -- batch-tied wastage — unchanged from before this migration.
  update public.purchase_lines
  set live_remaining_qty = live_remaining_qty - p_quantity
  where id = p_purchase_line_id;

  return v_id;
end $$;
