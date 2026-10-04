-- ============================================================
-- Rejected Materials (Ravi, 4 Oct 2026: inventory redesign; also closes
-- B41 / FB-0057 "rejected raw material still counted as stock").
--
-- Until now a raw material batch that QC rejected stayed inside On hand (it
-- was only labelled "rejected" on the batch screens), so the Stock Position
-- and every total over-stated what the plant can actually use.
--
-- From this migration:
--   * When QC rejects a raw material batch (bought, or made from a
--     production issue), the quantity still held in that batch is taken out
--     of On hand by a ledger movement with the new reason `qc_rejected`
--     (event 'pull'). The batch stays whole in the Rejected Materials tab;
--     the QC / Stability / R&D samples already taken stay as they are.
--   * If a rejected batch is later approved, the quantity goes back
--     (event 'push', same reason).
--   * Wastage against a rejected batch first returns that quantity to stock
--     and then writes it off, so On hand is unchanged by disposing of
--     rejected stock and the Rejected quantity goes down.
--   * Existing rejected batches (including rejected opening stock) are
--     moved out by the backfill at the end.
--   * item_position gets a `rejected` column (appended last) and On hand
--     still equals the breakdown.
--   * rejected_batches lists rejected raw material batches with their
--     quantities; rejected finished product batches are read from
--     finished_product_batches (they never entered the ledger).
--
-- Not changed: live_remaining_qty (still counts the rejected quantity, which
-- keeps the used-quantity check of PO reopen honest). Reopening a PO that has
-- a rejected batch is now refused (take the batch out of the PO another way).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. New ledger reason
-- ------------------------------------------------------------
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in (
    'purchase','qc','qc_sample','stability_sample','rnd_sample','finished_product',
    'packaging','fp_yield','fp_packaging_pull','packaged_fp_yield','packaged_fp_issue',
    'fp_draft_cancelled','production_rm_yield','qc_rejected'
  ));

-- ------------------------------------------------------------
-- 2. QC decision -> move the batch out of / back into On hand
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_rejected_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_item uuid;
  v_unit text;
  v_net numeric;
begin
  if new.purchase_line_id is null and new.production_batch_id is null then
    return new;   -- finished product: never in the ledger
  end if;

  select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0)
    into v_net
    from public.inventory_ledger l
   where l.reference_type = 'qc_rejected'
     and ((new.purchase_line_id is not null and l.purchase_line_id = new.purchase_line_id)
       or (new.production_batch_id is not null and l.production_batch_id = new.production_batch_id));

  if new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    if v_net > 0 then
      return new;   -- already moved out
    end if;
    if new.purchase_line_id is not null then
      select pl.live_remaining_qty, pl.item_id, pl.unit into v_remaining, v_item, v_unit
        from public.purchase_lines pl
       where pl.id = new.purchase_line_id and pl.pushed_at is not null;
    else
      select pb.live_remaining_qty, pb.item_id, pb.unit into v_remaining, v_item, v_unit
        from public.production_issue_batches pb
       where pb.id = new.production_batch_id;
    end if;
    if coalesce(v_remaining, 0) > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit,
         reference_type, reference_id, event_by)
      values ('pull', v_item, new.purchase_line_id, new.production_batch_id, v_remaining, v_unit,
              'qc_rejected', coalesce(new.purchase_line_id, new.production_batch_id), auth.uid());
    end if;
  elsif new.status = 'approved' and v_net > 0 then
    if new.purchase_line_id is not null then
      select pl.item_id, pl.unit into v_item, v_unit from public.purchase_lines pl where pl.id = new.purchase_line_id;
    else
      select pb.item_id, pb.unit into v_item, v_unit from public.production_issue_batches pb where pb.id = new.production_batch_id;
    end if;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit,
       reference_type, reference_id, event_by)
    values ('push', v_item, new.purchase_line_id, new.production_batch_id, v_net, v_unit,
            'qc_rejected', coalesce(new.purchase_line_id, new.production_batch_id), auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_qc_rejected_stock on public.quality_checks;
create trigger trg_qc_rejected_stock
  after insert or update of status on public.quality_checks
  for each row
  when (new.status in ('rejected', 'approved'))
  execute function public.trg_fn_qc_rejected_stock();

-- ------------------------------------------------------------
-- 3. Wastage on a rejected batch: return it to stock, then write it off
-- ------------------------------------------------------------
create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_line record;
  v_from text;
  v_to text;
  v_qty numeric;
  v_id uuid;
  v_rejected numeric;
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

  -- Rejected batch: its stock sits in "Rejected". Hand the written-off part
  -- back first so On hand is unchanged by the disposal.
  select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0)
    into v_rejected
    from public.inventory_ledger l
   where l.reference_type = 'qc_rejected' and l.purchase_line_id = v_line.id;
  if v_rejected > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
    values ('push', v_line.item_id, v_line.id, least(v_qty, v_rejected), v_line.unit, 'qc_rejected', v_line.id, auth.uid());
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

revoke all on function public.record_wastage(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.record_wastage(uuid, uuid, numeric, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Reopening a PO: refused while one of its batches is rejected
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
  v_rej record;
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

revoke all on function public.reopen_purchase_order(uuid) from public, anon;
grant execute on function public.reopen_purchase_order(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Undoing an opening load tolerates the rejected move
-- ------------------------------------------------------------
create or replace function public.undo_opening_load(p_load_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no      text;
  v_kind    text;
  v_line    uuid[];
  v_batch   uuid[];
  v_issue   uuid[];
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can undo an opening stock load.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed. Re-open it to undo a load.' using errcode = 'P0001';
  end if;
  select load_no, kind into v_no, v_kind from public.opening_loads where id = p_load_id for update;
  if v_no is null then
    raise exception 'Load not found.' using errcode = 'P0002';
  end if;

  if v_kind = 'finished' then
    select array_agg(id) into v_batch from public.finished_product_batches where opening_load_id = p_load_id;
    select array_agg(id) into v_issue from public.packaging_issues where opening_load_id = p_load_id;

    if exists (select 1 from public.packaging_issues pi
                where pi.finished_product_batch_id = any(v_batch) and pi.opening_load_id is distinct from p_load_id)
       or exists (select 1 from public.inventory_ledger il
                   where il.reference_id = any(v_batch) and il.reference_type <> 'fp_yield')
       or exists (select 1 from public.quality_checks q
                   where q.finished_product_batch_id = any(v_batch) and not q.is_legacy)
       or exists (select 1 from public.coa_records c where c.finished_product_batch_id = any(v_batch)) then
      raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
    end if;

    begin
      delete from public.inventory_ledger where reference_id = any(coalesce(v_issue, '{}') || coalesce(v_batch, '{}'));
      delete from public.packaging_issues where opening_load_id = p_load_id;
      delete from public.quality_checks where finished_product_batch_id = any(v_batch);
      delete from public.finished_product_batches where opening_load_id = p_load_id;
      delete from public.opening_loads where id = p_load_id;
    exception when foreign_key_violation then
      raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
    end;
    return;
  end if;

  select array_agg(pl.id) into v_line
    from public.purchase_lines pl
    join public.purchase_orders po on po.id = pl.purchase_order_id
   where po.opening_load_id = p_load_id;

  -- the rejected move (0104) of a rejected opening batch is part of the load
  if exists (
       select 1 from public.inventory_ledger il
        where il.purchase_line_id = any(v_line)
          and il.reference_type <> 'qc_rejected'
          and not (il.event_type = 'push' and il.reference_type = 'purchase' and il.reference_id = il.purchase_line_id)) then
    raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
  end if;
  if exists (
       select 1 from public.inventory_ledger il
        where il.purchase_line_id = any(v_line) and il.reference_type = 'qc_rejected'
          and il.event_type <> 'pull') then
    raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
  end if;
  if exists (
       select 1 from public.quality_checks q
        where q.purchase_line_id = any(v_line) and not q.is_legacy) then
    raise exception 'Load % cannot be undone: a QC record has been started on one of its batches.', v_no using errcode = 'P0001';
  end if;

  begin
    delete from public.inventory_ledger where purchase_line_id = any(v_line);
    delete from public.quality_checks where purchase_line_id = any(v_line);
    delete from public.purchase_lines where id = any(v_line);
    delete from public.purchase_orders where opening_load_id = p_load_id;
    delete from public.opening_loads where id = p_load_id;
  exception when foreign_key_violation then
    raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
  end;
end $$;

revoke all on function public.undo_opening_load(uuid) from public, anon;
grant execute on function public.undo_opening_load(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. Stock Position: a Rejected column (appended last)
-- ------------------------------------------------------------
create or replace view public.item_position as
select
  i.id as item_id,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'purchase' then -l.quantity
                    else 0 end), 0) as received,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'fp_yield' then l.quantity else 0 end), 0) as yielded,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample') then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'qc_sample' then -l.quantity
                    else 0 end), 0) as held_qc,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'stability_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'stability_sample' then -l.quantity
                    else 0 end), 0) as held_stability,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'rnd_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'rnd_sample' then -l.quantity
                    else 0 end), 0) as held_rnd,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'fp_draft_cancelled' then -l.quantity
                    else 0 end), 0) as consumed_by_fp,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaging' then l.quantity else 0 end), 0) as issued_packaging,
  coalesce(sum(case when l.event_type = 'wastage' then l.quantity else 0 end), 0) as wastage,
  coalesce(sum(case l.event_type when 'push' then l.quantity when 'wastage' then -l.quantity else -l.quantity end), 0) as on_hand,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'fp_packaging_pull' then l.quantity else 0 end), 0) as consumed_by_packaging,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'packaged_fp_yield' then l.quantity else 0 end), 0) as packaged_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then l.quantity else 0 end), 0) as issued_store,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then l.quantity else 0 end), 0) as issued_rnd,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'production_rm_yield' then l.quantity else 0 end), 0) as production_rm_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'qc_rejected' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'qc_rejected' then -l.quantity
                    else 0 end), 0) as rejected
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;

alter view public.item_position set (security_invoker = on);
revoke all on public.item_position from anon;
revoke insert, update, delete, truncate, references, trigger on public.item_position from authenticated;
grant select on public.item_position to authenticated;

-- ------------------------------------------------------------
-- 7. Rejected raw material batches (bought and production-made)
-- ------------------------------------------------------------
create or replace view public.rejected_batches
with (security_invoker = on) as
select 'purchase'::text as source,
       pl.id as batch_id,
       pl.item_id,
       pl.batch_number,
       pl.quantity as received_qty,
       coalesce(pl.qc_qty, 0) as qc_qty,
       coalesce(pl.stability_qty, 0) as stability_qty,
       coalesce(pl.rnd_qty, 0) as rnd_qty,
       pl.unit,
       pl.is_legacy,
       coalesce(r.net_qty, 0) as rejected_qty,
       q.ar_number,
       q.reviewed_at as rejected_at,
       q.review_comments
  from public.purchase_lines pl
  join lateral (
    select * from public.quality_checks x
     where x.purchase_line_id = pl.id
     order by x.created_at desc, x.id desc limit 1
  ) q on q.status = 'rejected'
  left join lateral (
    select sum(case l.event_type when 'pull' then l.quantity else -l.quantity end) as net_qty
      from public.inventory_ledger l
     where l.purchase_line_id = pl.id and l.reference_type = 'qc_rejected'
  ) r on true
 where pl.pushed_at is not null
union all
select 'production'::text,
       pb.id,
       pb.item_id,
       pb.batch_number,
       pb.quantity,
       coalesce(pb.qc_qty, 0),
       coalesce(pb.stability_qty, 0),
       coalesce(pb.rnd_qty, 0),
       pb.unit,
       false,
       coalesce(r.net_qty, 0),
       q.ar_number,
       q.reviewed_at,
       q.review_comments
  from public.production_issue_batches pb
  join lateral (
    select * from public.quality_checks x
     where x.production_batch_id = pb.id
     order by x.created_at desc, x.id desc limit 1
  ) q on q.status = 'rejected'
  left join lateral (
    select sum(case l.event_type when 'pull' then l.quantity else -l.quantity end) as net_qty
      from public.inventory_ledger l
     where l.production_batch_id = pb.id and l.reference_type = 'qc_rejected'
  ) r on true;

revoke all on public.rejected_batches from public, anon;
grant select on public.rejected_batches to authenticated;

-- ------------------------------------------------------------
-- 8. Backfill: batches already rejected leave On hand now
-- ------------------------------------------------------------
insert into public.inventory_ledger
  (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id)
select 'pull', pl.item_id, pl.id, pl.live_remaining_qty, pl.unit, 'qc_rejected', pl.id
  from public.purchase_lines pl
  join lateral (
    select x.status from public.quality_checks x
     where x.purchase_line_id = pl.id
     order by x.created_at desc, x.id desc limit 1
  ) q on q.status = 'rejected'
 where pl.pushed_at is not null
   and pl.live_remaining_qty > 0
   and not exists (select 1 from public.inventory_ledger l
                    where l.purchase_line_id = pl.id and l.reference_type = 'qc_rejected');

insert into public.inventory_ledger
  (event_type, item_id, production_batch_id, quantity, unit, reference_type, reference_id)
select 'pull', pb.item_id, pb.id, pb.live_remaining_qty, pb.unit, 'qc_rejected', pb.id
  from public.production_issue_batches pb
  join lateral (
    select x.status from public.quality_checks x
     where x.production_batch_id = pb.id
     order by x.created_at desc, x.id desc limit 1
  ) q on q.status = 'rejected'
 where pb.live_remaining_qty > 0
   and not exists (select 1 from public.inventory_ledger l
                    where l.production_batch_id = pb.id and l.reference_type = 'qc_rejected');

commit;
