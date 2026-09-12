-- ============================================================
-- Sufficient-stock check for pull-side operations with no existing
-- backstop (claude/known-issues.md, Sixth pass's "not yet addressed"
-- item, scoped and confirmed with Ravi before building).
--
-- WHAT WAS ALREADY COVERED (confirmed by reading the actual trigger code,
-- not assumed) — no change needed for these:
--   - QC/Stability/R&D sample pulls: reserved automatically inside
--     submit_purchase_order() (0028_ledger_sample_pull_fix.sql), and
--     createPurchaseLine()/updatePurchaseLine() (lib/actions/purchase.ts)
--     already reject qc_qty+stability_qty+rnd_qty > quantity at entry
--     time — this pull can never exceed what's available, by construction.
--   - FP component pulls (raw material consumed composing a Finished
--     Product batch): already a real hard block via
--     0029_purchase_line_live_remaining_qty.sql's
--     live_remaining_not_negative CHECK constraint on the purchase
--     batch's own live_remaining_qty, enforced on every new insert.
--   - Wastage against a specific batch: same 0029 constraint covers it —
--     record_wastage() already decrements purchase_lines.live_remaining_qty
--     and that CHECK rejects the update if it would go negative.
--
-- THE TWO REAL GAPS, both confirmed to have zero stock check today:
--   1. Wastage recorded with NO batch specified (the Wastage form's batch
--      field is optional — "leave blank for wastage not tied to a
--      specific received batch"). Nothing bounds this against the item's
--      actual on-hand balance.
--   2. Packaging pulls — both the packaging-material pulls (bottles, caps,
--      etc. consumed in a packaging issue, trg_fn_packaging_item_pull)
--      and the bulk Finished Product consumed when transforming into
--      Packaged FP (trg_fn_packaging_transform_and_issue's
--      fp_packaging_pull). Neither has ever checked stock_balance before
--      inserting its pull.
--
-- Decisions confirmed with Ravi: hard block (reject the transaction, not
-- a warn-and-allow), scoped to these two real gaps. The two known
-- legacy-negative packaging items (LEG-PKG-00055, LEG-PKG-00115 — see
-- known-issues.md's Sixth pass) are deliberately left as-is: if anything
-- ever tries to pull against them, correctly hitting this new block is
-- the right behavior (you can't consume from stock that's already
-- negative), not a regression to work around.
-- ============================================================

-- ------------------------------------------------------------
-- Shared guard. Locks the item row first (same `for update` serialization
-- idiom already used by submit_purchase_order()/reopen_purchase_order() in
-- 0019/0028 to close a different double-submit race) so two concurrent
-- pulls against the same item can't both read the same "available" figure
-- and each pass the check — the second caller blocks until the first's
-- transaction commits or rolls back, then re-reads a balance that already
-- reflects it. stock_balance (0001_init.sql) has no row at all for an item
-- with zero ledger activity yet (a plain `group by`, not a left join), so
-- an absent row means 0 available, not "unknown" — coalesced explicitly.
-- ------------------------------------------------------------
create or replace function public.check_sufficient_stock(p_item_id uuid, p_quantity numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item_name text;
  v_available numeric;
begin
  select name into v_item_name from public.items where id = p_item_id for update;

  select on_hand into v_available from public.stock_balance where item_id = p_item_id;
  v_available := coalesce(v_available, 0);

  if p_quantity > v_available then
    raise exception 'Not enough stock on hand for %: % available, % requested.',
      coalesce(v_item_name, 'this item'), v_available, p_quantity;
  end if;
end $$;

-- ------------------------------------------------------------
-- Gap 1: wastage with no batch specified.
-- ------------------------------------------------------------
create or replace function public.record_wastage(
  p_item_id uuid, p_purchase_line_id uuid, p_quantity numeric, p_unit text, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer') then
    raise exception 'not authorized to record wastage';
  end if;

  -- A batch-specified wastage is already bounded by the
  -- live_remaining_not_negative CHECK below (via the purchase_lines
  -- update further down) — only the no-batch case had no backstop at all.
  if p_purchase_line_id is null then
    perform public.check_sufficient_stock(p_item_id, p_quantity);
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

-- ------------------------------------------------------------
-- Gap 2a: packaging-material pulls (packaging_issue_items).
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_item_pull()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_department text;
begin
  select department into v_department
  from public.packaging_issues
  where id = new.packaging_issue_id;

  perform public.check_sufficient_stock(new.item_id, new.quantity);

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', new.item_id, new.quantity, new.unit, v_department, 'packaging', new.packaging_issue_id, auth.uid());
  return new;
end $$;
-- trg_packaging_item_pull already points at this function by name —
-- create or replace alone picks up the new body, no trigger redefinition
-- needed.

-- ------------------------------------------------------------
-- Gap 2b: bulk Finished Product consumed transforming into Packaged FP.
-- The packaged_fp_yield push immediately followed by packaged_fp_issue
-- pull (further down in this function, unchanged) always nets to zero
-- within the same transaction — nothing to check there, it can never go
-- negative by construction.
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_transform_and_issue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mfr_definition_id uuid;
  v_fp_item_id uuid;
  v_fp_unit text;
  v_pkg_item_id uuid;
begin
  -- Production is explicitly held back for now — see 0032's header and
  -- claude/packaged-fp-redesign.md. Nothing below this line ever runs for
  -- a production issue.
  if new.department not in ('store', 'rnd') then
    return new;
  end if;

  -- Defensive: the server action always sets this for store/rnd issues,
  -- but this trigger never fabricates a pull against a null/zero amount.
  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  select fpb.mfr_definition_id into v_mfr_definition_id
    from public.finished_product_batches fpb
    where fpb.id = new.finished_product_batch_id;

  select md.finished_product_item_id into v_fp_item_id
    from public.mfr_definitions md
    where md.id = v_mfr_definition_id;

  -- Graceful skip, same posture as Phase 3's fp_yield trigger: a legacy
  -- MFR with no linked FP item has nothing to transform.
  if v_fp_item_id is null then
    return new;
  end if;

  select unit, packaged_item_id into v_fp_unit, v_pkg_item_id
    from public.items where id = v_fp_item_id;

  -- Graceful skip: the FP item predates this feature's paired-item
  -- backfill, or was never paired for some other reason. Nothing to
  -- transform into — the packaging-material pulls above still happened
  -- normally; only the bulk-FP transform is skipped.
  if v_pkg_item_id is null then
    return new;
  end if;

  -- 1. Pull the bulk Finished Product consumed into this packaging run.
  perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

  -- 2. Push the Packaged Finished Product created — counted in packaged
  --    units (unit_count), not bulk volume.
  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('push', v_pkg_item_id, new.unit_count, 'count', new.department, 'packaged_fp_yield', new.id, auth.uid());

  -- 3. Immediately issue it back out. "Always fully issued, one-shot" —
  --    Packaged FP never sits in stock partially issued; on_hand for this
  --    item always nets back to zero right after this insert.
  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_pkg_item_id, new.unit_count, 'count', new.department, 'packaged_fp_issue', new.id, auth.uid());

  return new;
end $$;
-- trg_packaging_transform_and_issue already points at this function by
-- name — create or replace alone picks up the new body.
