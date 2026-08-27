-- ============================================================
-- Invento v2 — fixes found while building the modules against
-- 0001_init.sql / 0002_transactions.sql (see docs/modules/*.md for the
-- agent reports that flagged each of these).
-- ============================================================

-- 1. finished-product.md: an mfr_manager could do everything on the
--    Finished Product module except "Submit to QC", because the
--    quality_checks insert policy didn't include mfr_manager. Finished
--    Product batches are legitimately mfr_manager's to submit.
drop policy if exists qc_insert on public.quality_checks;
create policy qc_insert on public.quality_checks for insert
  with check (public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer','mfr_manager'));

-- 2. inventory.md: record_wastage() accepted p_reason but never stored it —
--    the wastage form collects and submits a reason today with nowhere for
--    it to land.
alter table public.inventory_ledger add column if not exists reason text;

create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer') then
    raise exception 'not authorized to record wastage';
  end if;
  insert into public.inventory_ledger (event_type, item_id, purchase_line_id, quantity, unit, reference_type, event_by, reason)
  values ('wastage', p_item_id, p_purchase_line_id, p_quantity, p_unit, 'purchase', auth.uid(), p_reason)
  returning id into v_id;
  return v_id;
end $$;

-- 3. bmr.md: one BMR per finished-product batch was enforced only by the
--    /bmr/new picker filtering out batches that already have one — a race
--    could produce two. Make it a real constraint.
alter table public.bmr_records
  add constraint bmr_records_one_per_batch unique (finished_product_batch_id);
