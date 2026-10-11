-- ============================================================
-- Purchase fixes from the full-app scan (Ravi, 11 Oct 2026):
--
-- SCAN-P2-07  The Excel purchase upload accepted lines with no unit price or
--             GST %, although the 15 Sept 2026 rule makes both mandatory
--             (0 is allowed). bulk_create_purchase_orders now refuses a line
--             without them. Lines already saved without them are left alone.
--
-- SCAN-P3-03  Submitting a purchase order with no lines was accepted and left
--             an empty submitted order that only a System Admin could reopen.
--             submit_purchase_order now refuses it.
--
-- SCAN-P10-01 A line saved at the same moment as a submit read the order as
--             "draft" (no lock), was accepted, and never entered stock. The
--             line guard now reads the order with a shared lock, so it waits
--             for a submit in progress and then sees "submitted". submit also
--             checks that no line was left without its stock push.
--
-- SCAN-P4-14  Raw material labels printed the vendor's invoice date as
--             "Date of Receipt". A purchase order can now carry the date the
--             goods were received (typed on the order); the label uses it.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- SCAN-P4-14: the date the goods were received
-- ------------------------------------------------------------
alter table public.purchase_orders add column if not exists received_on date;
comment on column public.purchase_orders.received_on is
  'Date the goods were received (typed on the order). Blank on older orders: labels then use the date the order was submitted into stock.';

-- ------------------------------------------------------------
-- SCAN-P2-07: bulk upload needs a unit price and GST % on every line
-- (same body as 0038 plus the one check)
-- ------------------------------------------------------------
create or replace function public.bulk_create_purchase_orders(p_payload jsonb)
returns table(po_number text, invoice_number text, line_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po jsonb;
  v_line jsonb;
  v_vendor_id uuid;
  v_invoice_number text;
  v_invoice_date date;
  v_lines jsonb;
  v_po_number text;
  v_po_id uuid;
  v_batch_number text;
  v_line_count int;
  v_idx int := 0;
begin
  if not public.has_any_role('system_admin', 'inventory_manager') then
    raise exception 'Not authorized to bulk-create purchase orders.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No purchase orders to create.';
  end if;

  for v_po in select * from jsonb_array_elements(p_payload)
  loop
    v_idx := v_idx + 1;
    v_vendor_id := nullif(v_po->>'vendor_id', '')::uuid;
    v_invoice_number := trim(both from coalesce(v_po->>'invoice_number', ''));
    v_invoice_date := nullif(v_po->>'invoice_date', '')::date;
    v_lines := v_po->'lines';

    if v_vendor_id is null then
      raise exception 'Purchase order #%: vendor is required.', v_idx;
    end if;
    if v_invoice_number = '' then
      raise exception 'Purchase order #%: invoice number is required.', v_idx;
    end if;
    if v_invoice_date is null then
      raise exception 'Purchase order "%": invoice date is required.', v_invoice_number;
    end if;
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'Purchase order "%": needs at least one line.', v_invoice_number;
    end if;

    v_po_number := public.get_next_po_number();
    insert into public.purchase_orders (po_number, vendor_id, invoice_number, invoice_date)
      values (v_po_number, v_vendor_id, v_invoice_number, v_invoice_date)
      returning id into v_po_id;

    v_line_count := 0;
    for v_line in select * from jsonb_array_elements(v_lines)
    loop
      if (v_line->>'item_id') is null or (v_line->>'quantity') is null
         or v_line->>'unit' is null or v_line->>'unit' = '' then
        raise exception 'Purchase order "%": every line needs an item, quantity, and unit.', v_invoice_number;
      end if;
      if (v_line->>'quantity')::numeric <= 0 then
        raise exception 'Purchase order "%": line quantity must be greater than 0.', v_invoice_number;
      end if;
      -- SCAN-P2-07: unit price and GST % are mandatory (0 is fine).
      if nullif(v_line->>'unit_price', '') is null or nullif(v_line->>'gst_pct', '') is null then
        raise exception 'Purchase order "%": every line needs a unit price and a GST %% (enter 0 if there is none).', v_invoice_number;
      end if;

      v_batch_number := public.get_next_batch_number((v_line->>'item_id')::uuid);
      insert into public.purchase_lines
        (purchase_order_id, item_id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct)
        values (
          v_po_id,
          (v_line->>'item_id')::uuid,
          v_batch_number,
          (v_line->>'quantity')::numeric,
          v_line->>'unit',
          coalesce((v_line->>'qc_qty')::numeric, 0),
          coalesce((v_line->>'stability_qty')::numeric, 0),
          coalesce((v_line->>'rnd_qty')::numeric, 0),
          (v_line->>'unit_price')::numeric,
          (v_line->>'gst_pct')::numeric
        );
      v_line_count := v_line_count + 1;
    end loop;

    po_number := v_po_number;
    invoice_number := v_invoice_number;
    line_count := v_line_count;
    return next;
  end loop;
end $$;

-- ------------------------------------------------------------
-- SCAN-P3-03 / SCAN-P10-01: submit refuses an empty order and checks that no
-- line was left without its stock push (same body as 0028 plus the checks)
-- ------------------------------------------------------------
create or replace function public.submit_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
begin
  if not public.has_any_role('system_admin', 'inventory_manager') then
    raise exception 'Not authorized.';
  end if;

  select status into v_status from public.purchase_orders where id = p_po_id for update;
  if v_status is null then
    raise exception 'Purchase order not found.';
  end if;
  if v_status <> 'draft' then
    raise exception 'This purchase order has already been submitted.';
  end if;
  if not exists (select 1 from public.purchase_lines where purchase_order_id = p_po_id) then
    raise exception 'This purchase order has no lines. Add at least one line before submitting.' using errcode = 'P0001';
  end if;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'push', pl.item_id, pl.id, pl.quantity, pl.unit, 'purchase', pl.id, auth.uid()
  from public.purchase_lines pl
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is null
    and pl.quantity > 0;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'pull', pl.item_id, pl.id, pl.qc_qty, pl.unit, 'qc_sample', pl.id, auth.uid()
  from public.purchase_lines pl
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is null
    and coalesce(pl.qc_qty, 0) > 0;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'pull', pl.item_id, pl.id, pl.stability_qty, pl.unit, 'stability_sample', pl.id, auth.uid()
  from public.purchase_lines pl
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is null
    and coalesce(pl.stability_qty, 0) > 0;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'pull', pl.item_id, pl.id, pl.rnd_qty, pl.unit, 'rnd_sample', pl.id, auth.uid()
  from public.purchase_lines pl
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is null
    and coalesce(pl.rnd_qty, 0) > 0;

  update public.purchase_lines
  set pushed_at = now()
  where purchase_order_id = p_po_id and pushed_at is null;

  -- SCAN-P10-01: nothing may be left on a submitted order without its push.
  if exists (select 1 from public.purchase_lines where purchase_order_id = p_po_id and pushed_at is null) then
    raise exception 'A line on this purchase order could not be received into stock. Nothing was submitted; try again.';
  end if;

  update public.purchase_orders
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_po_id;
end $$;

-- ------------------------------------------------------------
-- SCAN-P10-01: the line guard reads the order with a shared lock (same body as
-- 0070 apart from "for share"): a line saved while a submit is still open now
-- waits for it, then sees "submitted" and is refused.
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_purchase_line_workflow()
returns trigger language plpgsql set search_path = public as $$
declare
  v_po record;
begin
  if not public._is_direct_client_write() then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select po_number, status into v_po from public.purchase_orders where id = old.purchase_order_id for share;
    if found and v_po.status <> 'draft' then
      raise exception 'Purchase order % is submitted, so its lines are locked. Ask a System Admin to reopen it first.', v_po.po_number
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.purchase_order_id is distinct from old.purchase_order_id then
      raise exception 'A purchase line cannot be moved to a different purchase order.'
        using errcode = '42501';
    end if;
    if new.pushed_at is distinct from old.pushed_at
       or new.live_remaining_qty is distinct from old.live_remaining_qty then
      raise exception 'Stock fields on a purchase line are maintained automatically and cannot be set directly.'
        using errcode = '42501';
    end if;
  end if;

  select po_number, status into v_po from public.purchase_orders where id = new.purchase_order_id for share;
  if found and v_po.status <> 'draft' then
    raise exception 'Purchase order % is submitted, so lines cannot be added or changed. Ask a System Admin to reopen it first.', v_po.po_number
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.pushed_at is not null then
    raise exception 'Stock fields on a purchase line are maintained automatically and cannot be set directly.'
      using errcode = '42501';
  end if;
  return new;
end $$;

commit;
