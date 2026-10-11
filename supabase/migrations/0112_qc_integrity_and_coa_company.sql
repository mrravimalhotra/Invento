-- ============================================================
-- 0112 - Approved batches stay as approved (SCAN-P3-01), expired
--        material is not retested (SCAN-P4-03), and an issued COA keeps
--        the company details it was issued with (SCAN-P2-13)
--
-- Ravi's decisions, 12 Oct 2026:
--  * P3-01: once QC has a record on a batch (any status), the purchase order
--    can no longer be reopened, and the batch's item, batch number, unit,
--    quantity and sample quantities are locked. Price and GST % stay editable.
--  * P4-03: a retest cannot start on an expired batch. (The rule that a retest
--    approval can not set a later expiry than the original is in the app,
--    like the other QC approval rules.)
--  * P2-13: coa_records.company_snapshot holds the company name, address and
--    licence label and number as they were when the certificate was issued,
--    so a reprint after a licence renewal or address change still shows what
--    was issued. Certificates issued before this migration have no copy and
--    keep printing the current details.
--
-- reopen_purchase_order() is the 0104 body plus the QC check (after the
-- "rejected" and "already used" checks, so their messages are unchanged);
-- trg_fn_guard_purchase_line_workflow() is the 0109 body plus the lock;
-- start_retest() is the 0080 body plus the expiry check.
-- ============================================================

create or replace function public.reopen_purchase_order(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_used record;
  v_rej record;
  v_qc record;
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Not authorized.';
  end if;

  select status into v_status from public.purchase_orders where id = p_po_id for update;
  if v_status is null then
    raise exception 'Purchase order not found.';
  end if;
  if v_status <> 'submitted' then
    raise exception 'This purchase order is not currently submitted.';
  end if;

  select pl.batch_number into v_rej
    from public.purchase_lines pl
   where pl.purchase_order_id = p_po_id
     and pl.pushed_at is not null
     and exists (select 1 from public.inventory_ledger l
                  where l.purchase_line_id = pl.id and l.reference_type = 'qc_rejected')
   order by pl.batch_number
   limit 1;
  if found then
    raise exception 'This purchase order can''t be reopened: batch % was rejected by QC and is listed under Rejected Materials.',
      v_rej.batch_number
      using errcode = 'P0001';
  end if;

  select pl.batch_number, pl.unit,
         (pl.quantity - coalesce(pl.qc_qty, 0) - coalesce(pl.stability_qty, 0) - coalesce(pl.rnd_qty, 0))
           - pl.live_remaining_qty as used_qty
    into v_used
    from public.purchase_lines pl
   where pl.purchase_order_id = p_po_id
     and pl.pushed_at is not null
     and (pl.quantity - coalesce(pl.qc_qty, 0) - coalesce(pl.stability_qty, 0) - coalesce(pl.rnd_qty, 0))
           - pl.live_remaining_qty > 0
   order by pl.batch_number
   limit 1;
  if found then
    raise exception 'This purchase order can''t be reopened: batch % has already been used (% % taken for production or written off). Reverse that use first.',
      v_used.batch_number, trim_scale(v_used.used_qty), v_used.unit
      using errcode = 'P0001';
  end if;

  -- SCAN-P3-01 (Ravi, 12 Oct 2026): once QC has a record on a batch (any status),
  -- the order can no longer be reopened. Before this, an approved batch could be
  -- reopened and its quantity, batch number or item changed while the QC approval,
  -- AR number and any printed COA or label kept pointing at the old values.
  select pl.batch_number, qc.ar_number into v_qc
    from public.purchase_lines pl
    join public.quality_checks qc on qc.purchase_line_id = pl.id
   where pl.purchase_order_id = p_po_id
   order by pl.batch_number, qc.created_at
   limit 1;
  if found then
    raise exception 'This purchase order can''t be reopened: QC has started on batch % (Analytical Report No. %). A purchase order can''t be changed once QC has a record on one of its batches.',
      v_qc.batch_number, v_qc.ar_number
      using errcode = 'P0001';
  end if;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'pull', pl.item_id, pl.id, n.net_qty, pl.unit, 'purchase', pl.id, auth.uid()
  from public.purchase_lines pl
  join lateral (
    select sum(case il.event_type when 'push' then il.quantity else -il.quantity end) as net_qty
      from public.inventory_ledger il
     where il.purchase_line_id = pl.id
       and il.reference_type = 'purchase'
       and il.reference_id = pl.id
  ) n on true
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is not null
    and n.net_qty > 0;

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'push', pl.item_id, pl.id, n.net_qty, pl.unit, n.reference_type, pl.id, auth.uid()
  from public.purchase_lines pl
  join lateral (
    select il.reference_type,
           sum(case il.event_type when 'pull' then il.quantity else -il.quantity end) as net_qty
      from public.inventory_ledger il
     where il.purchase_line_id = pl.id
       and il.reference_type in ('qc_sample', 'stability_sample', 'rnd_sample')
       and il.reference_id = pl.id
     group by il.reference_type
  ) n on true
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is not null
    and n.net_qty > 0;

  update public.purchase_lines
  set pushed_at = null
  where purchase_order_id = p_po_id and pushed_at is not null;

  update public.purchase_orders
  set status = 'draft', reopened_at = now(), reopened_by = auth.uid()
  where id = p_po_id;
end $$;

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
    -- SCAN-P3-01: a batch that has a QC record keeps its item, batch number, unit,
    -- quantity and sample quantities. Price and GST % can still be edited.
    if (new.item_id is distinct from old.item_id
        or new.batch_number is distinct from old.batch_number
        or new.unit is distinct from old.unit
        or new.quantity is distinct from old.quantity
        or new.qc_qty is distinct from old.qc_qty
        or new.stability_qty is distinct from old.stability_qty
        or new.rnd_qty is distinct from old.rnd_qty)
       and exists (select 1 from public.quality_checks qc where qc.purchase_line_id = old.id) then
      raise exception 'Batch % has a QC record, so its item, batch number, unit, quantity and sample quantities can no longer be changed. Price and GST %% can still be edited.',
        old.batch_number
        using errcode = 'P0001';
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

create or replace function public.start_retest(
  p_purchase_line_id uuid,
  p_production_batch_id uuid,
  p_sample_qty numeric,
  p_sample_unit text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_unit text;
  v_batch_number text;
  v_live numeric;
  v_pushed timestamptz;
  v_latest record;
  v_qty numeric;
  v_reserve numeric;
  v_from_reserve numeric;
  v_from_stock numeric;
  v_id uuid;
begin
  if not public.has_any_role('system_admin', 'inventory_manager', 'quality_checker', 'qc_reviewer') then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  if (p_purchase_line_id is null) = (p_production_batch_id is null) then
    raise exception 'Choose one batch to retest.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('batch-qc'),
                                public._batch_qc_lock_key(p_purchase_line_id, p_production_batch_id));

  if p_purchase_line_id is not null then
    select item_id, unit, batch_number, live_remaining_qty, pushed_at
      into v_item_id, v_unit, v_batch_number, v_live, v_pushed
      from public.purchase_lines where id = p_purchase_line_id for update;
    if v_item_id is null then
      raise exception 'Batch not found.' using errcode = 'P0002';
    end if;
    if v_pushed is null then
      raise exception 'Batch %: its purchase order isn''t submitted.', v_batch_number using errcode = 'P0001';
    end if;
    select status, retest_date, expiry_date into v_latest
      from public.quality_checks where purchase_line_id = p_purchase_line_id
     order by created_at desc limit 1;
  else
    select item_id, unit, batch_number, live_remaining_qty
      into v_item_id, v_unit, v_batch_number, v_live
      from public.production_issue_batches where id = p_production_batch_id for update;
    if v_item_id is null then
      raise exception 'Batch not found.' using errcode = 'P0002';
    end if;
    select status, retest_date, expiry_date into v_latest
      from public.quality_checks where production_batch_id = p_production_batch_id
     order by created_at desc limit 1;
  end if;

  if v_latest.status is distinct from 'approved' then
    raise exception 'Batch % is not due for retest (it isn''t currently approved).', v_batch_number using errcode = 'P0001';
  end if;
  -- SCAN-P4-03 (Ravi, 12 Oct 2026): expired material is never retested.
  if v_latest.expiry_date is not null and v_latest.expiry_date < current_date then
    raise exception 'Batch % expired on %, so it can''t be retested. Expired material is not brought back into use.',
      v_batch_number, to_char(v_latest.expiry_date, 'DD-MM-YYYY') using errcode = 'P0001';
  end if;
  if v_latest.retest_date is null or v_latest.retest_date > current_date then
    raise exception 'Batch %''s retest date has not arrived yet.', v_batch_number using errcode = 'P0001';
  end if;

  if p_sample_qty is null or p_sample_qty <= 0 then
    raise exception 'Enter the retest sample quantity.' using errcode = 'P0001';
  end if;
  v_qty := public.convert_unit(p_sample_qty, p_sample_unit, v_unit);
  if v_qty is null then
    raise exception 'Batch % is kept in %, so a sample in % can''t be used.', v_batch_number, v_unit, p_sample_unit
      using errcode = 'P0001';
  end if;

  v_reserve := public.stability_reserve_left(p_purchase_line_id, p_production_batch_id);
  v_from_reserve := least(v_reserve, v_qty);
  v_from_stock := v_qty - v_from_reserve;

  if v_from_stock > coalesce(v_live, 0) + 0.0000001 then
    raise exception 'Batch % has only % % of stability reserve and % % of stock left — not enough for a % % sample.',
      v_batch_number, trim_scale(v_reserve), v_unit, trim_scale(coalesce(v_live, 0)), v_unit, trim_scale(v_qty), v_unit
      using errcode = 'P0001';
  end if;

  if v_from_stock > 0 then
    if p_purchase_line_id is not null then
      update public.purchase_lines set live_remaining_qty = live_remaining_qty - v_from_stock where id = p_purchase_line_id;
    else
      update public.production_issue_batches set live_remaining_qty = live_remaining_qty - v_from_stock where id = p_production_batch_id;
    end if;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit, reference_type, reference_id, event_by, reason)
    values
      ('pull', v_item_id, p_purchase_line_id, p_production_batch_id, v_from_stock, v_unit, 'qc_sample',
       coalesce(p_purchase_line_id, p_production_batch_id), auth.uid(), 'Retest sample');
  end if;

  insert into public.quality_checks
    (ar_number, purchase_line_id, production_batch_id, item_id, sample_qty, sample_unit, is_retest,
     stability_reserve_used, stock_sample_used)
  values
    (public.get_next_ar_number(), p_purchase_line_id, p_production_batch_id, v_item_id, p_sample_qty, p_sample_unit, true,
     v_from_reserve, v_from_stock)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.reopen_purchase_order(uuid) from public, anon;
grant execute on function public.reopen_purchase_order(uuid) to authenticated;
revoke all on function public.start_retest(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.start_retest(uuid, uuid, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- SCAN-P2-13: company details as issued
-- ------------------------------------------------------------
alter table public.coa_records add column if not exists company_snapshot jsonb;
comment on column public.coa_records.company_snapshot is
  'Company name, address and licence label/number (keys name, address, licenceLabel, licenceNo) as they were when the certificate was issued. Null on certificates issued before 0112; those print the current details.';
