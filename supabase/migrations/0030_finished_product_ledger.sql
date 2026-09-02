-- ============================================================
-- Inventory Ledger redesign, Phase 3 — Finished Product as a real,
-- ledger-tracked item.
--
-- Ravi's ask (claude/inventory-ledger-redesign.md, Gap 3): "available
-- finished product" should be computable the same way raw material and
-- packaging stock already are. Scoped via AskUserQuestion: Full — real
-- items, not just summing packaged_qty — with stock becoming available
-- "at QC approval" (not at packaging), and nothing yet consuming/
-- dispatching it (no such flow exists in the app).
--
-- THE GOOD NEWS: most of the "real item" infrastructure already exists.
-- 0010_mfr_finished_product_link.sql (2 Sept 2026) already gives every
-- MFR its own `items` row (category = 'processed', an FP-00001-style
-- code) via `mfr_definitions.finished_product_item_id`, created together
-- by createMfrDefinition(). What was actually missing, confirmed by
-- checking items.category (still exactly 'raw'/'processed'/'packaging' —
-- no new category needed) and by grepping for any trigger that writes to
-- inventory_ledger on finished_product_batches/quality_checks activity
-- (there is none): nothing ever PUSHES to inventory_ledger when a batch
-- is produced. This migration is that push, not a new items category.
--
-- WHERE IT HOOKS IN: reviewQualityCheck() (lib/actions/qc.ts) is the one
-- place quality_checks.status ever becomes 'approved'/'rejected' — for
-- BOTH raw-material batches (purchase_line_id set) and Finished Product
-- batches (finished_product_batch_id set; qc_one_subject, 0001_init.sql,
-- guarantees exactly one of the two). A trigger on that transition,
-- scoped to the FP case, is the single natural place to push stock "at
-- QC approval."
--
-- A SECOND KNOWN GAP THIS SAME HOOK CLOSES: lib/finished-product-status.ts
-- has carried this comment since it was written — "A DB trigger syncing
-- finished_product_batches.status from quality_checks would be the clean
-- fix, but this pass is not allowed to add new migrations — so instead
-- we compute the *displayed* status at read time... Known follow-up: add
-- that trigger in a later migration so finished_product_batches.status
-- itself stays authoritative." That trigger is added here, in the same
-- migration, since it's the same transition this phase already hooks —
-- resolveDisplayStatus()/latestQcByBatch() are left in place as a
-- harmless safety net (they now just confirm what the DB already says)
-- rather than ripped out across every caller, which is a larger, separate
-- change this phase doesn't need to make.
--
-- WHY A BATCH CAN ONLY BE APPROVED ONCE (simplifying this considerably
-- compared to Phase 1's RM retest handling): quality_checks_fp_batch_
-- unique (0015_qc_duplicate_backstop.sql) is a real, still-standing
-- UNIQUE constraint on finished_product_batch_id — unlike purchase_
-- line_id's later relaxation for retests (0025_qc_retest_workflow.sql),
-- nothing loosened this one. There is no FP retest workflow anywhere in
-- this codebase (startRetestQualityCheck, lib/actions/qc.ts, is scoped
-- to purchase_line_id only) — an FP batch's quality_checks row is
-- created exactly once and reviewed exactly once. No compounding-pull
-- risk to guard against here.
--
-- WHAT GETS PUSHED, mirroring Phase 1's RM pattern exactly: the full
-- batch_yield ("how much Finished Product has been created," entered at
-- Complete Batch — 0022_fp_batch_yield.sql) as a push, then qc_sample_
-- qty/stability_qty/rnd_qty (captured on the same screen, mirroring
-- purchase_lines' qc_qty/stability_qty/rnd_qty) as three separately
-- labeled pulls — reusing the existing 'qc_sample'/'stability_sample'/
-- 'rnd_sample' reference_type values from Phase 1 (a QC sample is a QC
-- sample whether it came from a purchase batch or a production batch;
-- reference_id already means different things per reference_type
-- throughout this schema — see FB-0013, docs/modules/inventory.md — this
-- is consistent with that, not a new kind of ambiguity). The push itself
-- gets its own new reference_type, 'fp_yield', distinct from the
-- existing 'finished_product' (which already means something else: RM
-- pulled *for* FP composition, not the FP batch's own output).
--
-- GRACEFUL, NOT BLOCKING: a legacy mfr_definitions row created before
-- 0010 can have finished_product_item_id = null (that migration
-- deliberately didn't guess at pairing old rows up). If so, this trigger
-- skips the ledger push (nothing to push against) but still syncs
-- finished_product_batches.status — a QC reviewer approving an old
-- recipe's batch is never blocked by a missing link on that recipe.
-- Same defensive posture for a null/zero batch_yield (shouldn't happen —
-- submitFinishedProductToQc() already requires it before a QC record can
-- even be created — but the trigger doesn't assume the app is the only
-- caller).
--
-- A new `not valid` check constraint (batch_yield can't be oversampled
-- past zero) mirrors purchase_lines' remaining_not_negative the same way
-- Phase 2 mirrored it for live_remaining_qty — nothing enforced this for
-- Finished Product at all before now.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New reference_type for the FP batch's own push.
-- ------------------------------------------------------------
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in ('purchase','qc','qc_sample','stability_sample','rnd_sample','finished_product','packaging','fp_yield'));

-- ------------------------------------------------------------
-- 2. Defensive parity with purchase_lines.remaining_not_negative — never
--    enforced for Finished Product before. `not valid`: existing rows
--    are never scanned/rejected by adding this; only new inserts/updates
--    are checked going forward (0016_quantity_check_constraints.sql's
--    idiom, reused again after Phase 2).
-- ------------------------------------------------------------
alter table public.finished_product_batches
  drop constraint if exists fp_batch_yield_not_negative;
alter table public.finished_product_batches
  add constraint fp_batch_yield_not_negative
  check (
    batch_yield is null or
    (batch_yield - coalesce(qc_sample_qty, 0) - coalesce(stability_qty, 0) - coalesce(rnd_qty, 0)) >= 0
  ) not valid;

-- ------------------------------------------------------------
-- 3. The trigger itself.
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_review_finished_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_batch record;
  v_item_id uuid;
begin
  update public.finished_product_batches
  set status = new.status
  where id = new.finished_product_batch_id;

  if new.status <> 'approved' then
    return new;
  end if;

  select fpb.batch_yield, fpb.qc_sample_qty, fpb.stability_qty, fpb.rnd_qty, fpb.unit, fpb.mfr_definition_id
    into v_batch
    from public.finished_product_batches fpb
    where fpb.id = new.finished_product_batch_id;

  select md.finished_product_item_id into v_item_id
    from public.mfr_definitions md
    where md.id = v_batch.mfr_definition_id;

  -- Graceful skip, not a hard failure — see the migration header comment
  -- for why both of these are possible and neither should block a real
  -- QC approval.
  if v_item_id is null or v_batch.batch_yield is null or v_batch.batch_yield <= 0 then
    return new;
  end if;

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
  values
    ('push', v_item_id, v_batch.batch_yield, v_batch.unit, 'fp_yield', new.finished_product_batch_id, auth.uid());

  if coalesce(v_batch.qc_sample_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.qc_sample_qty, v_batch.unit, 'qc_sample', new.finished_product_batch_id, auth.uid());
  end if;

  if coalesce(v_batch.stability_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.stability_qty, v_batch.unit, 'stability_sample', new.finished_product_batch_id, auth.uid());
  end if;

  if coalesce(v_batch.rnd_qty, 0) > 0 then
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', v_item_id, v_batch.rnd_qty, v_batch.unit, 'rnd_sample', new.finished_product_batch_id, auth.uid());
  end if;

  return new;
end $$;

drop trigger if exists trg_qc_review_finished_product on public.quality_checks;
create trigger trg_qc_review_finished_product
  after update on public.quality_checks
  for each row
  when (new.finished_product_batch_id is not null and old.status = 'submitted' and new.status in ('approved', 'rejected'))
  execute function public.trg_fn_qc_review_finished_product();

-- ------------------------------------------------------------
-- 4. Idempotent backfill: every FP batch whose (at most one,
--    quality_checks_fp_batch_unique-guaranteed) quality_checks row is
--    already approved/rejected but hasn't been synced/pushed yet — same
--    logic as the trigger, applied once for existing data. Guarded by
--    "no fp_yield push already on file for this batch" so a second run
--    is a true no-op.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_item_id uuid;
begin
  for r in
    select fpb.id, fpb.status as batch_status, fpb.batch_yield, fpb.qc_sample_qty, fpb.stability_qty,
           fpb.rnd_qty, fpb.unit, fpb.mfr_definition_id, qc.status as qc_status
    from public.finished_product_batches fpb
    join public.quality_checks qc on qc.finished_product_batch_id = fpb.id
    where qc.status in ('approved', 'rejected')
  loop
    if r.batch_status is distinct from r.qc_status then
      update public.finished_product_batches set status = r.qc_status where id = r.id;
    end if;

    if r.qc_status <> 'approved' then
      continue;
    end if;

    if exists (select 1 from public.inventory_ledger where reference_type = 'fp_yield' and reference_id = r.id) then
      continue;
    end if;

    select md.finished_product_item_id into v_item_id
      from public.mfr_definitions md
      where md.id = r.mfr_definition_id;

    if v_item_id is null or r.batch_yield is null or r.batch_yield <= 0 then
      continue;
    end if;

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('push', v_item_id, r.batch_yield, r.unit, 'fp_yield', r.id, null);

    if coalesce(r.qc_sample_qty, 0) > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', v_item_id, r.qc_sample_qty, r.unit, 'qc_sample', r.id, null);
    end if;

    if coalesce(r.stability_qty, 0) > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', v_item_id, r.stability_qty, r.unit, 'stability_sample', r.id, null);
    end if;

    if coalesce(r.rnd_qty, 0) > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
      values
        ('pull', v_item_id, r.rnd_qty, r.unit, 'rnd_sample', r.id, null);
    end if;
  end loop;
end $$;
