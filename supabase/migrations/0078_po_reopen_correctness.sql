-- ============================================================
-- Reopening a purchase order: correct stock, every time (accuracy audit
-- ACC-01, ACC-06, ACC-27 — claude/app-accuracy-audit-2026-09-28.md; Ravi,
-- 29 Sept 2026: "lets start implementation").
--
-- Three problems with reopen_purchase_order() (0028):
--
-- ACC-01  Reopening the same PO a SECOND time reversed its stock twice.
--         Each reopen reversed every receipt and sample pull the PO had ever
--         made — including the ones an earlier reopen had already reversed.
--         100 kg line: submit 94 → reopen 0 → submit 94 → reopen −94 →
--         submit 0 (should be 94).
--         Now: reopen reverses only what is still NET in stock for each
--         line (receipts minus earlier reversals; sample pulls minus earlier
--         returns), so any number of submit/reopen cycles comes out right.
--
-- ACC-27  Reopening after a batch had been used (in a finished-product
--         batch, or written off as wastage) reversed the full receipt while
--         the used stock was already gone, driving stock negative.
--         Now: reopen is refused while any batch on the PO has been used,
--         naming the batch and how much. (A cancelled FP draft gives its
--         stock back first, so it doesn't block.)
--
-- ACC-06  A batch on a reopened (draft) PO kept its QC approval and could
--         still be used in production, taking stock that was no longer on
--         hand.
--         Now: the QC gate (check_batch_qc_approved) also requires the
--         batch's purchase order to be submitted. The FP compose screen and
--         New AR also only offer submitted batches (app code).
--
-- Nothing else changes: Final Submit, QC, and the first submit/reopen cycle
-- behave exactly as before.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- reopen_purchase_order: net reversal + refuse when stock was used
-- ------------------------------------------------------------
create or replace function public.reopen_purchase_order(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_used record;
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

  -- ACC-27: refuse if any batch has been used. live_remaining_qty is the
  -- batch's received quantity less samples, less everything consumed or
  -- written off (and plus anything returned by a cancelled FP draft).
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

  -- ACC-01: take back only what is still net in stock from each line's
  -- receipt (receipts minus earlier reversals).
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

  -- ...and give back only the sample pulls still outstanding (pulls minus
  -- earlier returns), per sample type.
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

revoke all on function public.reopen_purchase_order(uuid) from public, anon;
grant execute on function public.reopen_purchase_order(uuid) to authenticated;

-- ------------------------------------------------------------
-- QC gate: a batch can only be used while its PO is submitted (ACC-06)
-- ------------------------------------------------------------
-- Same function as 0075 (shared per-batch lock, QC status, retest date),
-- plus the submitted-PO check for purchased batches.
create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
  v_prod_status public.production_batch_status%rowtype;
  v_pushed_at timestamptz;
  v_batch_number text;
begin
  if new.purchase_line_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(new.purchase_line_id, null));

    select pushed_at, batch_number into v_pushed_at, v_batch_number
      from public.purchase_lines where id = new.purchase_line_id;
    if v_pushed_at is null then
      raise exception 'Batch % can''t be used: its purchase order isn''t submitted (it may have been reopened for editing).',
        coalesce(v_batch_number, new.purchase_line_id::text)
        using errcode = 'P0001';
    end if;

    select * into v_status
    from public.purchase_batch_status
    where purchase_line_id = new.purchase_line_id;

    if v_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (purchase_line_id=%) is not QC-Approved and cannot be consumed', new.purchase_line_id;
    end if;

    if v_status.retest_date is not null and v_status.retest_date <= current_date then
      raise exception 'Batch (purchase_line_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.purchase_line_id, v_status.retest_date;
    end if;

    return new;
  end if;

  if new.production_batch_id is not null then
    perform pg_advisory_xact_lock_shared(hashtext('batch-qc'),
                                         public._batch_qc_lock_key(null, new.production_batch_id));

    select * into v_prod_status
    from public.production_batch_status
    where production_batch_id = new.production_batch_id;

    if v_prod_status.qc_status is distinct from 'approved' then
      raise exception 'Batch (production_batch_id=%) is not QC-Approved and cannot be consumed', new.production_batch_id;
    end if;

    if v_prod_status.retest_date is not null and v_prod_status.retest_date <= current_date then
      raise exception 'Batch (production_batch_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
        new.production_batch_id, v_prod_status.retest_date;
    end if;

    return new;
  end if;

  return new;
end $$;

commit;
