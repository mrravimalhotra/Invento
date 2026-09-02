-- ============================================================
-- Inventory Ledger redesign, Phase 1 — fix the QC/Stability/R&D sample
-- double-count, give each its own visible ledger line.
--
-- Requested by Ravi: "help me think and re-design inventory page Ledger
-- page... Raw Material Items available for creating finished product
-- batch would be purchase - QC Sample - R&D Sample - Stability Sample -
-- Wastage." Scoped via AskUserQuestion (full writeup in the Invento
-- project doc claude/inventory-ledger-redesign.md) — this migration is
-- Phase 1 of 4: the double-count fix Ravi confirmed ("Yes, fix it").
--
-- THE BUG
-- --------
-- The real push path is submit_purchase_order() (0019_purchase_submit_
-- workflow.sql) — NOT trg_fn_purchase_line_push()/trg_purchase_line_push
-- (0002_transactions.sql): 0019 explicitly dropped that trigger ("Stop
-- pushing to inventory the instant a line is inserted. Pushing now
-- happens only inside submit_purchase_order(), once, for the whole PO.
-- The function is left in place (unused) rather than dropped") and left
-- the now-dead function untouched. Confirmed by grepping app code: only
-- submit_purchase_order/reopen_purchase_order are ever RPC'd from
-- lib/actions/purchase.ts. This migration was actually verified end to
-- end against a scratch local Postgres 16 (all 27 prior migrations +
-- this one, replayed with a minimal auth-schema shim) rather than by
-- inspection alone — that's what caught this: an earlier draft of this
-- migration edited the dead trigger function, which would have shipped
-- looking like a fix while changing nothing for real purchases. The
-- trigger function itself is left exactly as 0019 left it (untouched,
-- unused, on purpose) so nothing about that prior decision changes.
--
-- submit_purchase_order() pushes `remaining_qty` (quantity already net of
-- qc_qty/stability_qty/rnd_qty) once per line, at submit — so the sample
-- amounts are excluded from stock from submission onward.
-- trg_fn_qc_sample_pull() (0002_transactions.sql part B, unit-fixed by
-- 0020) then fires on every quality_checks insert with purchase_line_id
-- set and sample_qty > 0 and PULLS that amount again — sample_qty
-- defaults from purchase_lines.qc_qty at initial QC assignment
-- (qc-assign-form.tsx's computeBatchDisplay()) and from stability_qty at
-- every retest (0025_qc_retest_workflow.sql — same trigger, no changes
-- needed for retests to fire it, which is exactly the problem: it fires
-- again each time). Net effect on stock_balance: qc_qty
-- double-subtracted as soon as QC happens once; stability_qty
-- double-subtracted, and then subtracted again per additional retest.
-- rnd_qty has the opposite gap — excluded at submit, never pulled
-- anywhere, so it never appears on the ledger at all.
--
-- THE FIX (going forward)
-- ------------------------
-- Reservation now happens once, at submit: submit_purchase_order() pushes
-- the FULL quantity of each submitted line, then inserts three separately
-- labeled 'pull' events in the same transaction for qc_qty/stability_qty/
-- rnd_qty (each only if > 0). trg_fn_qc_sample_pull is retired to a
-- no-op: QC/retest record creation no longer moves stock (the reservation
-- already happened at submit).
--
-- reopen_purchase_order() reverses whatever submit actually wrote, so it
-- also needs to reverse the three new sample pulls now, not just the
-- purchase push — otherwise a reopen-then-resubmit would double-pull the
-- sample amounts a second time (submit re-runs for any line with
-- pushed_at null, which reopen clears).
--
-- inventory_ledger is append-only and never edited (same principle as
-- every prior migration here, e.g. 0020's compensating-entry approach) —
-- 'qc' stays a valid reference_type for the historical rows already
-- written by the old trigger; it is simply not written by anything new.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Widen reference_type to carry the three new, separately-labeled
--    sample-pull kinds. 'qc' is kept (not replaced) for the historical
--    rows already on the ledger from the old trg_fn_qc_sample_pull.
-- ------------------------------------------------------------
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in ('purchase','qc','qc_sample','stability_sample','rnd_sample','finished_product','packaging'));

-- ------------------------------------------------------------
-- 2. Final Submit -> push the FULL quantity of every newly-submitted
--    line (was remaining_qty), then reserve qc_qty/stability_qty/
--    rnd_qty as three separate labeled pulls in the same transaction.
--    reference_id stays the purchase line's own id for all four kinds,
--    matching the existing push row's convention.
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

  update public.purchase_orders
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid()
  where id = p_po_id;
end $$;

-- ------------------------------------------------------------
-- 3. Reopen -> reverse everything submit actually wrote for this PO's
--    lines: the purchase push (as before, unchanged logic — a
--    compensating 'pull' of whatever was pushed) AND, now, the three
--    sample pulls (a compensating 'push' of whatever was pulled). Both
--    read the amount back from the ledger row itself rather than the
--    line's current qc_qty/stability_qty/rnd_qty, so it's exact even if
--    the line gets edited before a later resubmit — same principle the
--    original purchase-push reversal already used.
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

  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
  select 'push', il.item_id, il.purchase_line_id, il.quantity, il.unit, il.reference_type, il.purchase_line_id, auth.uid()
  from public.inventory_ledger il
  join public.purchase_lines pl on pl.id = il.purchase_line_id
  where pl.purchase_order_id = p_po_id
    and pl.pushed_at is not null
    and il.event_type = 'pull'
    and il.reference_type in ('qc_sample', 'stability_sample', 'rnd_sample')
    and il.reference_id = il.purchase_line_id;

  update public.purchase_lines
  set pushed_at = null
  where purchase_order_id = p_po_id and pushed_at is not null;

  update public.purchase_orders
  set status = 'draft', reopened_at = now(), reopened_by = auth.uid()
  where id = p_po_id;
end $$;

-- ------------------------------------------------------------
-- 4. Retire the QC-time pull entirely. QC/retest record creation no
--    longer moves stock — the reservation already happened once, at
--    submit, above. The trigger and function are left in place (not
--    dropped) purely so nothing else has to change; it is now
--    permanently a no-op.
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_sample_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  return new;
end $$;

-- ------------------------------------------------------------
-- 5. Idempotent backfill for existing purchase_lines: active AND already
--    submitted (pushed_at is not null) — a still-draft line has no stock
--    effect at all today (FB-0018) and must stay that way; only a
--    submitted line's ledger state needs correcting.
--
--    Recomputes each line's ACTUAL current ledger state fresh on every
--    run (never assumes it wasn't already partially corrected), and
--    inserts only the remaining gap needed to reach the target state:
--      - total push = full quantity (was remaining_qty)
--      - qc_qty reserved exactly once, as a labeled pull, whether that
--        reservation already happened (an old-style 'qc' pull from the
--        original QC assignment) or needs inserting now
--      - stability_qty reserved exactly once the same way — but a batch
--        that went through MULTIPLE retests had trg_fn_qc_sample_pull
--        fire on every one of them (0025's explicit design note: no
--        trigger changes needed for retests to "work", which is exactly
--        how this over-pulled), so any pulls beyond the first
--        stability_qty are a second bug this same backfill corrects
--      - rnd_qty reserved once (it was never pulled by anything before
--        this migration, so this is purely additive)
--
--    Safe to run more than once: every insert is gated on the current
--    (freshly summed) state, so a second run computes zero gap.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_pushed_net numeric;
  v_qc_pulled_old numeric;
  v_stability_pulled_old numeric;
  v_qc_reserved boolean;
  v_stability_reserved boolean;
  v_rnd_reserved boolean;
  v_gap numeric;
  v_epsilon constant numeric := 0.000001;
begin
  for r in
    select id, item_id, unit, quantity, qc_qty, stability_qty, rnd_qty
    from public.purchase_lines
    where active = true and pushed_at is not null
  loop
    -- Net, not raw sum: a line that's been through a reopen/resubmit
    -- cycle (old-style OR new-style) already has offsetting push/pull
    -- 'purchase' rows, which a raw sum would double-count. Net is what
    -- actually reflects "how much of this line's quantity is currently
    -- pushed", regardless of how many submit/reopen cycles produced it.
    select coalesce(sum(case when event_type = 'push' then quantity else -quantity end), 0)
      into v_pushed_net
      from public.inventory_ledger
      where purchase_line_id = r.id and reference_type = 'purchase';

    -- Old-style pulls (from the retired trg_fn_qc_sample_pull, tagged
    -- 'qc' and tied to a real quality_checks row) represent genuine lab
    -- consumption that already happened — never reversed, so a plain
    -- sum (not net) is correct and intentional here.
    select coalesce(sum(l.quantity), 0) into v_qc_pulled_old
      from public.inventory_ledger l
      join public.quality_checks qc on qc.id = l.reference_id
      where l.purchase_line_id = r.id and l.event_type = 'pull' and l.reference_type = 'qc'
        and qc.is_retest = false;

    select coalesce(sum(l.quantity), 0) into v_stability_pulled_old
      from public.inventory_ledger l
      join public.quality_checks qc on qc.id = l.reference_id
      where l.purchase_line_id = r.id and l.event_type = 'pull' and l.reference_type = 'qc'
        and qc.is_retest = true;

    -- "Already reserved" must recognize BOTH an old-style pull (real QC/
    -- retest already happened) and a new-style qc_sample/stability_sample/
    -- rnd_sample row already on the ledger (this line already went
    -- through the new submit_purchase_order() — e.g. submitted after this
    -- migration's code deployed but before the backfill ran, or this is a
    -- second run of the backfill itself). Checking only the old-style
    -- join here was the actual bug this fix replaces: it made the
    -- backfill re-insert a reservation that already existed, on both a
    -- second run and on any already-correct line, which is exactly the
    -- double-count this migration exists to remove.
    v_qc_reserved := v_qc_pulled_old > v_epsilon or exists (
      select 1 from public.inventory_ledger
      where purchase_line_id = r.id and event_type = 'pull' and reference_type = 'qc_sample'
    );
    v_stability_reserved := v_stability_pulled_old > v_epsilon or exists (
      select 1 from public.inventory_ledger
      where purchase_line_id = r.id and event_type = 'pull' and reference_type = 'stability_sample'
    );
    v_rnd_reserved := exists (
      select 1 from public.inventory_ledger
      where purchase_line_id = r.id and event_type = 'pull' and reference_type = 'rnd_sample'
    );

    -- Full-quantity push gap (net-based, see above), plus a compensating
    -- push for any multiple-retest over-pull beyond the first
    -- stability_qty — old-style retests only; the new model can't
    -- over-pull since QC/retest no longer moves stock at all.
    v_gap := (r.quantity - v_pushed_net) + greatest(v_stability_pulled_old - coalesce(r.stability_qty, 0), 0);
    if v_gap > v_epsilon then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('push', r.item_id, r.id, v_gap, r.unit, 'purchase', r.id, null);
    end if;

    if coalesce(r.qc_qty, 0) > v_epsilon and not v_qc_reserved then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', r.item_id, r.id, r.qc_qty, r.unit, 'qc_sample', r.id, null);
    end if;

    if coalesce(r.stability_qty, 0) > v_epsilon and not v_stability_reserved then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', r.item_id, r.id, r.stability_qty, r.unit, 'stability_sample', r.id, null);
    end if;

    if coalesce(r.rnd_qty, 0) > v_epsilon and not v_rnd_reserved then
      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', r.item_id, r.id, r.rnd_qty, r.unit, 'rnd_sample', r.id, null);
    end if;
  end loop;
end $$;
