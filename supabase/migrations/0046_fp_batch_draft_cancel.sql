-- ============================================================
-- Ravi (15 Sept 2026), on the FP batch detail screen (FP-0002
-- screenshot): "there should be a 'Create Batch' Button and a cancel
-- button, till 'Create Batch' is clicked batch should be in draft
-- status and if clicked on cancelled, the batch should be cancelled...
-- Till 'Create Batch' is clicked, 'Complete Batch' Should be disabled or
-- invisible. Only when 'Create Batch' is clicked... batch will move to
-- 'In Progress' state. If batch is in draft state for more than 30 mins,
-- it should automatically cancelled and raw material reserved should be
-- returned back to inventory. A smaller timer should be displayed to
-- remind to create batch."
--
-- Scoped via AskUserQuestion (three open questions):
-- 1. Where "draft" begins — confirmed: the existing compose/Step-2
--    submit (createFinishedProductBatch, lib/actions/finished-product.ts)
--    already pulls RM immediately via finished_product_components inserts
--    (trg_fp_component_pull, 0002_transactions.sql) and lands the user on
--    this exact detail page. That submit now creates the batch in
--    'draft' instead of 'in_process' — RM is pulled at the same moment
--    as before, nothing about that part changes. This detail page gets
--    the new Create Batch / Cancel buttons while status = 'draft'.
-- 2. Ravi initially described manual Cancel as NOT returning RM, but the
--    30-minute auto-cancel AS returning it — flagged as an apparent
--    inconsistency and asked to confirm. Ravi's answer: no, always
--    return RM on any cancel, manual or automatic. So there is exactly
--    one reversal rule, independent of what triggered the cancellation.
-- 3. This app has no scheduled/background job of any kind (checked:
--    no pg_cron, no vercel.json cron, no edge function). Ravi chose the
--    lazy option over adding real cron infrastructure: a stale draft
--    (>30 min old) is only actually flipped to 'cancelled' the next time
--    someone loads the FP list or that batch's detail page. Until then
--    its status row still literally says 'draft' — the on-screen
--    countdown timer (app-side, this migration doesn't need to know
--    about it) is a reminder, not the enforcement.
--
-- WHAT THIS MIGRATION DOES:
-- 1. Widens finished_product_batches.status to add 'draft' and
--    'cancelled', and flips the column default from 'in_process' to
--    'draft' (defense-in-depth backstop matching this app's established
--    pattern of a DB-level default/constraint mirroring an app-level
--    decision — see fp_completion_fields_required_together, 0044).
-- 2. Adds one new inventory_ledger reference_type, 'fp_draft_cancelled',
--    for the reversal push.
-- 3. One new trigger, symmetric to trg_fp_component_pull (which pulls RM
--    for finished_product_components on insert): fires on the
--    draft -> cancelled transition (however it happens — manual Cancel
--    and the lazy auto-expire below both just do the same UPDATE, so one
--    trigger keyed on the status transition covers both, the same shape
--    trg_fn_qc_review_finished_product already uses for its own
--    approved/rejected transition) and, per finished_product_components
--    row on that batch: (a) inserts an offsetting inventory_ledger push
--    (item-level stock_balance, same bookkeeping shape as every other
--    push/pull pair in this app) and (b) — found while verifying
--    locally, easy to miss — ALSO increments that exact purchase line's
--    live_remaining_qty back up, the same maintained column
--    trg_fn_fp_component_live_remaining_pull (0029_purchase_line_live_
--    remaining_qty.sql) decremented at draft-creation time. That column
--    is NOT derived live from inventory_ledger (it's a maintained figure,
--    only moved by specific triggers), so the FP compose picker's FIFO
--    allocation — which reads live_remaining_qty, not the ledger — would
--    still see this stock as unavailable after "cancel" without this
--    second update, even though the ledger-level push above makes
--    item-level stock_balance look correct. Confirmed exactly this gap
--    locally: after adding only the ledger push, live_remaining_qty
--    stayed at its drawn-down figure through a manual cancel; adding this
--    UPDATE fixed it (batch consumed 15kg, live_remaining_qty went
--    50 -> 35 -> 50 through create-draft -> cancel).
-- 4. One new function, expire_stale_fp_drafts() — the lazy check itself.
--    security definer (like every other ledger-writing trigger function
--    in this app) since fp_write (0001_init.sql) is scoped to
--    system_admin/mfr_manager/inventory_manager, and this needs to
--    self-heal for ANY signed-in user who happens to load a stale draft,
--    not just those roles. Called from the FP list and FP detail Server
--    Components before they query batches (app-side change, not in this
--    migration) — a bulk, idempotent UPDATE ... WHERE status = 'draft'
--    AND created_at < now() - 30 minutes, safe to call on every page load
--    by any number of concurrent users.
--
-- Purely additive: no existing finished_product_batches row's status
-- changes, and no existing data is touched. batch_start_date (0044) and
-- everything else on this table is unaffected.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Status: add 'draft' and 'cancelled'; new rows default to 'draft'.
-- ------------------------------------------------------------
alter table public.finished_product_batches
  drop constraint if exists finished_product_batches_status_check;
alter table public.finished_product_batches
  add constraint finished_product_batches_status_check
  check (status in ('draft', 'in_process', 'submitted_to_qc', 'approved', 'rejected', 'cancelled'));
alter table public.finished_product_batches
  alter column status set default 'draft';

-- ------------------------------------------------------------
-- 2. New reference_type for the reversal push.
-- ------------------------------------------------------------
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in (
    'purchase', 'qc', 'qc_sample', 'stability_sample', 'rnd_sample', 'finished_product',
    'packaging', 'fp_yield', 'fp_packaging_pull', 'packaged_fp_yield', 'packaged_fp_issue',
    'fp_draft_cancelled'
  ));

-- ------------------------------------------------------------
-- 3. Reversal trigger.
-- ------------------------------------------------------------
create or replace function public.trg_fn_fp_batch_draft_cancel_reversal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, quantity, reference_type, reference_id, event_by)
  select 'push', fpc.item_id, fpc.purchase_line_id, fpc.quantity, 'fp_draft_cancelled', new.id, auth.uid()
  from public.finished_product_components fpc
  where fpc.finished_product_batch_id = new.id;

  update public.purchase_lines pl
  set live_remaining_qty = pl.live_remaining_qty + agg.total_qty
  from (
    select purchase_line_id, sum(quantity) as total_qty
    from public.finished_product_components
    where finished_product_batch_id = new.id
    group by purchase_line_id
  ) agg
  where pl.id = agg.purchase_line_id;

  return new;
end $$;

drop trigger if exists trg_fp_batch_draft_cancel_reversal on public.finished_product_batches;
create trigger trg_fp_batch_draft_cancel_reversal
  after update on public.finished_product_batches
  for each row
  when (old.status = 'draft' and new.status = 'cancelled')
  execute function public.trg_fn_fp_batch_draft_cancel_reversal();

-- ------------------------------------------------------------
-- 4. Lazy 30-minute auto-expire.
-- ------------------------------------------------------------
create or replace function public.expire_stale_fp_drafts()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.finished_product_batches
  set status = 'cancelled'
  where status = 'draft' and created_at < now() - interval '30 minutes';
end $$;
