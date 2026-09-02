-- ============================================================
-- Inventory Ledger redesign, Phase 2 — a live, maintained per-batch
-- remaining quantity.
--
-- Ravi's ask (see claude/inventory-ledger-redesign.md, Gap 2): a purchase
-- batch's "how much is left" needs to reflect Finished Product consumption
-- and any wastage recorded against that specific batch, not just what was
-- left right after QC/Stability/R&D sampling at receipt.
--
-- THE GAP
-- --------
-- purchase_lines.remaining_qty is a Postgres GENERATED column
-- (quantity - qc_qty - stability_qty - rnd_qty) — static, fixed at
-- purchase time. It never decreases when that specific batch is later
-- consumed by a finished_product_components insert, or has wastage
-- recorded against it (record_wastage(), when a batch is picked).
-- purchase_lines-table.tsx, the FP compose picker, RM Report As On Date,
-- the wastage batch dropdown, and the Purchase Register report all show
-- this static figure as if it were live "what's left in this batch" —
-- most consequentially the FP compose picker, whose "X avail." hint (and,
-- until this migration, its total absence of any DB-level check) could
-- suggest consuming from a batch well past what's actually left in it.
-- Only item-level stock_balance (Phase 1, now correct) reflects
-- consumption at all today; nothing reflects it per-batch.
--
-- Scoped with Ravi via AskUserQuestion before building: a maintained
-- column kept current by a trigger (not computed on read), and — a
-- follow-up question this migration's design surfaced — batch-tied
-- wastage counts as consumption here too, not just FP composition
-- (matches Ravi's original formula: "available raw material = purchase -
-- QC sample - R&D sample - stability sample - wastage").
--
-- THE FIX
-- --------
-- purchase_lines.live_remaining_qty: starts at remaining_qty for every
-- line (set by a BEFORE INSERT trigger — new.remaining_qty itself isn't
-- readable yet at BEFORE-trigger time since it's a generated column, so
-- the same formula is computed directly from new.quantity/qc_qty/
-- stability_qty/rnd_qty), then decremented by:
--   - a finished_product_components insert against that purchase_line_id
--     (new AFTER INSERT trigger)
--   - record_wastage() when a batch is specified (rewritten below)
--
-- A draft line's quantity/qc_qty/stability_qty/rnd_qty can still be
-- edited before Final Submit (updatePurchaseLine, lib/actions/
-- purchase.ts) — the same trigger handles UPDATE OF those four columns
-- too, recomputing the new base figure while PRESERVING whatever's
-- already been consumed (always zero for a genuine draft edit, since
-- nothing can be pushed/consumed before submit — FB-0018 — but this also
-- covers the rarer System-Admin-reopens-then-edits-then-resubmits path
-- without silently erasing real consumption history that happened before
-- the reopen).
--
-- A `not valid` check constraint (same idiom as 0016_quantity_check_
-- constraints.sql) makes this a real DB-level guard going forward: an FP
-- composition or a wastage record that would drive a batch's live
-- remaining below zero is now rejected outright, instead of silently
-- succeeding the way it always has until now. `not valid` means existing
-- rows are never scanned/rejected by this migration itself — only
-- confirmed safe by the backfill below actually landing at a
-- non-negative figure for everything active (verified locally, see
-- docs/modules/purchase.md).
-- ============================================================

-- ------------------------------------------------------------
-- 1. New column, nullable first (see 0019's staged pattern for the same
--    reason — backfill explicitly before anything requires a value).
-- ------------------------------------------------------------
alter table public.purchase_lines
  add column if not exists live_remaining_qty numeric;

-- ------------------------------------------------------------
-- 2. Backfill every existing line: start from the same base
--    (quantity - qc_qty - stability_qty - rnd_qty) remaining_qty already
--    computes, then subtract everything actually consumed from THAT
--    batch so far — finished_product_components quantities, and wastage
--    recorded against it (inventory_ledger event_type = 'wastage',
--    purchase_line_id = this line — record_wastage()'s only reference_type
--    is 'purchase', so no reference_type filter is needed/possible here).
-- ------------------------------------------------------------
update public.purchase_lines pl
set live_remaining_qty =
  (pl.quantity - coalesce(pl.qc_qty, 0) - coalesce(pl.stability_qty, 0) - coalesce(pl.rnd_qty, 0))
  - coalesce((select sum(fpc.quantity) from public.finished_product_components fpc where fpc.purchase_line_id = pl.id), 0)
  - coalesce((select sum(il.quantity) from public.inventory_ledger il
              where il.purchase_line_id = pl.id and il.event_type = 'wastage'), 0);

alter table public.purchase_lines
  alter column live_remaining_qty set not null;

alter table public.purchase_lines
  drop constraint if exists live_remaining_not_negative;
alter table public.purchase_lines
  add constraint live_remaining_not_negative check (live_remaining_qty >= 0) not valid;

-- ------------------------------------------------------------
-- 3. Keep it current on insert (new line) and on update of the four
--    quantity-defining columns (a draft-line edit, per updatePurchaseLine
--    — see the comment block above for why this preserves already-
--    consumed amounts rather than resetting them).
-- ------------------------------------------------------------
create or replace function public.trg_fn_purchase_line_live_remaining()
returns trigger language plpgsql as $$
declare
  v_new_base numeric;
  v_consumed numeric;
begin
  v_new_base := new.quantity - coalesce(new.qc_qty, 0) - coalesce(new.stability_qty, 0) - coalesce(new.rnd_qty, 0);
  if tg_op = 'INSERT' then
    new.live_remaining_qty := v_new_base;
  else
    v_consumed := (old.quantity - coalesce(old.qc_qty, 0) - coalesce(old.stability_qty, 0) - coalesce(old.rnd_qty, 0))
      - coalesce(old.live_remaining_qty, 0);
    new.live_remaining_qty := v_new_base - v_consumed;
  end if;
  return new;
end $$;
drop trigger if exists trg_purchase_line_live_remaining on public.purchase_lines;
create trigger trg_purchase_line_live_remaining
  before insert or update of quantity, qc_qty, stability_qty, rnd_qty on public.purchase_lines
  for each row execute function public.trg_fn_purchase_line_live_remaining();

-- ------------------------------------------------------------
-- 4. Finished Product composition consumes from a specific batch —
--    decrement it. SECURITY DEFINER: the app role that can insert
--    finished_product_components (finished_product write roles) isn't
--    necessarily granted UPDATE on purchase_lines directly (that's
--    system_admin/inventory_manager, per pl_update in
--    0018_purchase_delete_policy.sql) — same cross-module-write pattern
--    every other ledger-writing trigger in this app already uses.
-- ------------------------------------------------------------
create or replace function public.trg_fn_fp_component_live_remaining_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.purchase_lines
  set live_remaining_qty = live_remaining_qty - new.quantity
  where id = new.purchase_line_id;
  return new;
end $$;
drop trigger if exists trg_fp_component_live_remaining_pull on public.finished_product_components;
create trigger trg_fp_component_live_remaining_pull
  after insert on public.finished_product_components
  for each row execute function public.trg_fn_fp_component_live_remaining_pull();

-- ------------------------------------------------------------
-- 5. record_wastage(): decrement the batch's live remaining too, when a
--    batch was specified (the "Batch" field on Record Wastage is
--    optional — p_purchase_line_id can be null, in which case there's no
--    per-batch figure to touch, same as before).
-- ------------------------------------------------------------
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

  if p_purchase_line_id is not null then
    update public.purchase_lines
    set live_remaining_qty = live_remaining_qty - p_quantity
    where id = p_purchase_line_id;
  end if;

  return v_id;
end $$;
