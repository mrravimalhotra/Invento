-- ============================================================
-- FB-0018 ("there should be a final submit button post which the record
-- should be committed. Before that all users should have access to
-- review/edit entered record.") — draft/submit workflow for Purchase.
--
-- Design decisions confirmed with Ravi 2 Sept 2026:
--  1. A draft PO's lines do NOT push to inventory at all — only Final
--     Submit pushes everything at once. (Today, trg_purchase_line_push
--     pushes the instant a line is inserted — see 0002_transactions.sql —
--     which is also why a PO with any line can't be cleanly deleted; see
--     claude/known-issues.md "Fourth pass".)
--  2. Once submitted, a normal write-role user (system_admin,
--     inventory_manager — same as "purchase" write today) can no longer
--     edit/delete its lines. system_admin alone can Reopen it, which
--     reverses whatever was pushed (via a compensating ledger entry, never
--     by deleting/editing the original — inventory_ledger is an audit
--     trail) and puts it back in draft.
--  3. Final Submit is whole-PO, not per-line.
--
-- purchase_orders/purchase_lines already existed with ~92k legacy rows and
-- real inventory_ledger activity behind every one of them (pushed either
-- by the old trigger or by whatever loaded the legacy dataset) — so this
-- migration explicitly backfills every EXISTING row to 'submitted'/
-- 'pushed' before the new 'draft' default takes effect for anything
-- created after this runs. Getting this backfill wrong would either
-- silently re-push ~92k lines' worth of stock (if left as draft and
-- someone hit Submit) or hide every existing batch from QC/BMR/Wastage/
-- Finished-Product/Labels pickers (once those are filtered to
-- submitted-only, in the same app deploy as this migration).
-- ============================================================

-- ------------------------------------------------------------
-- 1. New columns — nullable first, so existing rows get backfilled
--    explicitly rather than picking up whatever default is added later.
-- ------------------------------------------------------------
alter table public.purchase_orders
  add column status text,
  add column submitted_at timestamptz,
  add column submitted_by uuid references auth.users(id),
  add column reopened_at timestamptz,
  add column reopened_by uuid references auth.users(id);

alter table public.purchase_lines
  add column pushed_at timestamptz;

-- ------------------------------------------------------------
-- 2. Backfill: every purchase order that already exists predates this
--    feature and is treated as already submitted, as of when it was
--    created. Every purchase line that already has a 'push' ledger row
--    is marked pushed as of when that row was written. A line with
--    remaining_qty = 0 never got a ledger row in the first place (the old
--    trigger's own `if new.remaining_qty > 0` guard, see
--    0002_transactions.sql) — pushed_at correctly stays NULL for those;
--    there's nothing to reverse for them if their PO is ever reopened.
-- ------------------------------------------------------------
update public.purchase_orders set status = 'submitted', submitted_at = created_at;

update public.purchase_lines pl
set pushed_at = il.event_at
from public.inventory_ledger il
where il.purchase_line_id = pl.id
  and il.event_type = 'push'
  and il.reference_type = 'purchase'
  and pl.pushed_at is null;

-- ------------------------------------------------------------
-- 3. Now that every existing row has an explicit status, make it
--    required and default new rows to 'draft'.
-- ------------------------------------------------------------
alter table public.purchase_orders
  alter column status set not null,
  alter column status set default 'draft',
  add constraint po_status_check check (status in ('draft', 'submitted'));

-- ------------------------------------------------------------
-- 4. Stop pushing to inventory the instant a line is inserted. Pushing
--    now happens only inside submit_purchase_order() below, once, for
--    the whole PO. The function is left in place (unused) rather than
--    dropped, in case anything still references it.
-- ------------------------------------------------------------
drop trigger if exists trg_purchase_line_push on public.purchase_lines;

-- ------------------------------------------------------------
-- 5. Final Submit — pushes every not-yet-pushed line on the PO in one
--    transaction, then flips the PO to 'submitted'. SECURITY DEFINER so
--    it can write inventory_ledger despite its "no direct write" policy
--    (ledger_no_direct_write, 0001_init.sql) — same pattern as every
--    other ledger-writing function in 0002_transactions.sql. Row-locks
--    the PO first (`for update`) so two concurrent submits on the same
--    PO can't both push.
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

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'push', pl.item_id, pl.id, pl.remaining_qty, pl.unit, 'purchase', pl.id, auth.uid()
  from public.purchase_lines pl
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is null
    and pl.remaining_qty > 0;

  update public.purchase_lines
  set pushed_at = now()
  where purchase_order_id = p_po_id and pushed_at is null;

  update public.purchase_orders
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_po_id;
end $$;

-- ------------------------------------------------------------
-- 6. Reopen (system_admin only) — reverses every line this PO actually
--    pushed with a compensating 'pull' of the SAME quantity that was
--    originally pushed (read back from the ledger row itself, not the
--    line's current remaining_qty, so it's exact even if the line gets
--    edited before a later resubmit). The original 'push' row is never
--    deleted or edited — inventory_ledger is an audit trail — this just
--    nets its effect back to zero. Then clears pushed_at so a later
--    Final Submit re-pushes with whatever the lines say at that time,
--    and flips the PO back to 'draft'.
-- ------------------------------------------------------------
create or replace function public.reopen_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_status text;
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

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'pull', il.item_id, il.purchase_line_id, il.quantity, il.unit, 'purchase', il.purchase_line_id, auth.uid()
  from public.inventory_ledger il
  join public.purchase_lines pl on pl.id = il.purchase_line_id
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is not null
    and il.event_type = 'push'
    and il.reference_type = 'purchase'
    and il.reference_id = il.purchase_line_id;

  update public.purchase_lines
  set pushed_at = null
  where purchase_order_id = p_po_id and pushed_at is not null;

  update public.purchase_orders
  set status = 'draft', reopened_at = now(), reopened_by = auth.uid()
  where id = p_po_id;
end $$;

-- Note: po_update/pl_update (0018_purchase_delete_policy.sql) already let
-- system_admin/inventory_manager update any column of purchase_orders/
-- purchase_lines directly, same as before this migration — the app itself
-- only ever changes `status` through the two functions above (never a
-- raw .update() on status from client code), consistent with the trust
-- already placed in those two roles for every other write in this app
-- (e.g. they could already update qc_qty directly, bypassing FB-0017's
-- conversion logic, if they chose to call the API by hand).
