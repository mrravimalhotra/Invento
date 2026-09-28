-- ============================================================
-- FB-0043 — Production-issued Raw Material now goes through full sample
-- reservation + QC + retest, exactly like a purchased Raw Material batch.
-- Full scoping/design writeup: claude/fb-0043-production-rm-qc-
-- implementation-plan.md ("Start Implementation" — Ravi, 28 Sept 2026).
--
-- Recap of what changes, in one place (each piece below has its own
-- comment at the point it's built):
--   1. packaging_issues gains qc_qty/stability_qty/rnd_qty (Production
--      issues only — entered on the New Issue form's Production branch,
--      same UX Purchase's line form already has).
--   2. production_issue_batches gains its own qc_qty/stability_qty/rnd_qty
--      (already converted into the batch's own unit, mirroring
--      purchase_lines' convention) plus a real, netted live_remaining_qty
--      from the moment a batch is created — no more "the full issued
--      quantity is immediately available."
--   3. quality_checks.qc_one_subject widens from a 2-way to a 3-way
--      exclusive check, adding production_batch_id — a Production-issued
--      batch now gets a real, retestable QC history exactly like a
--      purchased one.
--   4. A new production_batch_status view (mirrors purchase_batch_status)
--      backs the new AR-per-batch partial unique index and the new QC
--      gate branch below.
--   5. check_batch_qc_approved() gains a real check for the
--      production_batch_id case — it used to no-op immediately (decision
--      at build time: "the FP batch's own QC approval already cleared
--      this material"). That decision is superseded by this ticket: a
--      Production-issued batch is now its own, separately gated batch.
--   6. trg_fn_packaging_transform_and_issue()'s Production branch reserves
--      QC/Stability/R&D samples at issue time, mirroring
--      submit_purchase_order()'s fixed (0028_ledger_sample_pull_fix.sql)
--      push-then-three-labelled-pulls pattern — never the older,
--      double-pull-prone trg_fn_qc_sample_pull path (retired by that same
--      migration and never revived here).
--   7. One-time backfill: every production_issue_batches row that
--      predates this migration (built under the old "no QC step" rule —
--      live data: RM-FP-00001, 10 kg on hand) is grandfathered in as
--      already QC-Approved, per Ravi's confirmed decision #4. Nothing
--      already consumed from it is disturbed — this only adds a
--      quality_checks row, it doesn't touch inventory_ledger or
--      live_remaining_qty for these rows.
--
-- The RM Intimation slip itself (vendor default "ATHARVA NATURE
-- HEALTHCARE PVT. LTD.", Invoice Number = packaging_issues.code, Invoice
-- Date = packaging_issues.created_at) is a client-side PDF export with no
-- schema footprint — built in app code only, nothing here.
-- ============================================================

-- ------------------------------------------------------------
-- 1. packaging_issues — QC/Stability/R&D sample quantities, Production
--    issues only. Nullable: Store/R&D rows never set these (packaging
--    materials are their own sampling concern, untouched by this
--    ticket). Already converted to the Finished Product's own unit by
--    the app layer before insert — same "no separate as-entered unit
--    column" convention purchase_lines and finished_product_batches both
--    use (see 0021_fp_stability_rnd_qty.sql's comment for why).
-- ------------------------------------------------------------
alter table public.packaging_issues
  add column if not exists qc_qty numeric,
  add column if not exists stability_qty numeric,
  add column if not exists rnd_qty numeric;

alter table public.packaging_issues drop constraint if exists packaging_sample_qty_not_negative;
alter table public.packaging_issues
  add constraint packaging_sample_qty_not_negative
  check (coalesce(qc_qty, 0) >= 0 and coalesce(stability_qty, 0) >= 0 and coalesce(rnd_qty, 0) >= 0);

-- `not valid`: every existing row (Store/R&D issues, and Production issues
-- created before this migration) has all three columns null, which passes
-- trivially — this only guards new inserts going forward. Same idiom
-- 0030_finished_product_ledger.sql used for its own analogous check.
alter table public.packaging_issues drop constraint if exists packaging_sample_qty_not_exceed_consumed;
alter table public.packaging_issues
  add constraint packaging_sample_qty_not_exceed_consumed
  check (
    fp_qty_consumed is null or
    (coalesce(qc_qty, 0) + coalesce(stability_qty, 0) + coalesce(rnd_qty, 0)) <= fp_qty_consumed
  ) not valid;

-- ------------------------------------------------------------
-- 2. production_issue_batches — its own qc_qty/stability_qty/rnd_qty,
--    matching purchase_lines' convention (already-converted, batch-unit
--    amounts). `not null default 0`: every existing row (built before
--    this migration, under the old "no sampling" rule) correctly
--    backfills to zero — no sample was ever reserved against them, and
--    decision #4 (grandfather, don't retrofit) means none should be.
-- ------------------------------------------------------------
alter table public.production_issue_batches
  add column if not exists qc_qty numeric not null default 0,
  add column if not exists stability_qty numeric not null default 0,
  add column if not exists rnd_qty numeric not null default 0;

-- `not valid`, same reasoning as above — trivially satisfied by every
-- existing row (qc_qty = stability_qty = rnd_qty = 0), only new inserts
-- are actually checked.
alter table public.production_issue_batches drop constraint if exists production_batch_sample_not_negative;
alter table public.production_issue_batches
  add constraint production_batch_sample_not_negative
  check (quantity - qc_qty - stability_qty - rnd_qty >= 0) not valid;

-- ------------------------------------------------------------
-- 3. quality_checks — production_batch_id, the third possible subject.
--    Widens qc_one_subject from a 2-way to a proper "exactly one of
--    three" check (equivalent to the old check when production_batch_id
--    is always null, so this is a strict superset of the old rule, not a
--    behavior change for any existing row).
-- ------------------------------------------------------------
alter table public.quality_checks
  add column if not exists production_batch_id uuid references public.production_issue_batches(id);

alter table public.quality_checks drop constraint if exists qc_one_subject;
alter table public.quality_checks
  add constraint qc_one_subject check (
    (case when purchase_line_id is not null then 1 else 0 end) +
    (case when finished_product_batch_id is not null then 1 else 0 end) +
    (case when production_batch_id is not null then 1 else 0 end) = 1
  );

-- At-most-one-open-AR-per-batch, same partial-unique-index shape
-- 0025_qc_retest_workflow.sql used for purchase_line_id and
-- 0054_qc_two_round_review.sql later widened to also cover
-- 'checker_approved' — built directly in that already-widened shape here
-- since this table only exists after both of those migrations.
create unique index if not exists quality_checks_production_batch_pending_unique
  on public.quality_checks (production_batch_id)
  where status in ('submitted', 'checker_approved');

-- ------------------------------------------------------------
-- 4. production_batch_status — the production_batch_id equivalent of
--    purchase_batch_status (0001_init.sql), same lateral-join-latest-row
--    shape, so it transparently supports a real retest history (multiple
--    quality_checks rows per batch) with zero extra logic, exactly like
--    the RM side.
-- ------------------------------------------------------------
create or replace view public.production_batch_status as
select pib.id as production_batch_id,
       coalesce(qc.status, 'not_submitted') as qc_status,
       qc.ar_number, qc.retest_date, qc.id as quality_check_id
from public.production_issue_batches pib
left join lateral (
  select * from public.quality_checks
  where production_batch_id = pib.id
  order by created_at desc limit 1
) qc on true;

-- ------------------------------------------------------------
-- 5. check_batch_qc_approved() — the production_batch_id branch is real
--    now, not a bypass. This supersedes 0050's original "no new QC step"
--    decision (that decision was explicitly scoped to "for now," and this
--    ticket is exactly the follow-up that changes it — see the plan doc).
--    The purchase_line_id branch is untouched (same two checks, same
--    exception wording, just re-scoped under its own `if`). Referencing
--    new.production_batch_id is safe against bmr_weighment_lines (which
--    has no such column at all) the same way 0050 already established
--    for new.purchase_line_id there: bmr_weighment_lines.purchase_line_id
--    is `not null`, so that first branch always returns before this
--    function ever evaluates the new field on that table's row.
-- ------------------------------------------------------------
create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
  v_prod_status public.production_batch_status%rowtype;
begin
  if new.purchase_line_id is not null then
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

-- ------------------------------------------------------------
-- 6. trg_fn_packaging_transform_and_issue() — Production branch gains
--    sample reservation. Unchanged from 0063_unit_count_rename_to_nos.sql
--    (the current, latest body) except: the production_issue_batches
--    insert now carries qc_qty/stability_qty/rnd_qty and a properly netted
--    live_remaining_qty, and three new labelled sample pulls follow it in
--    the same transaction — the exact submit_purchase_order() /
--    0028_ledger_sample_pull_fix.sql pattern, with the new batch's own id
--    (not the packaging_issues id) as both reference_id and the ledger
--    row's production_batch_id, matching how that function's sample pulls
--    use the purchase_line's own id for both purchase_line_id and
--    reference_id. Store/R&D branch (below the `if new.department =
--    'production'` block) is untouched, byte-for-byte.
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_transform_and_issue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mfr_definition_id uuid;
  v_fp_item_id uuid;
  v_fp_unit text;
  v_pkg_item_id uuid;
  v_rm_item_id uuid;
  v_rm_item_code text;
  v_fp_item_code text;
  v_fp_item_name text;
  v_fp_item_type_id uuid;
  v_batch_number text;
  v_qc_qty numeric;
  v_stability_qty numeric;
  v_rnd_qty numeric;
  v_prod_batch_id uuid;
begin
  if new.department not in ('store', 'rnd', 'production') then
    return new;
  end if;

  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  select fpb.mfr_definition_id into v_mfr_definition_id
    from public.finished_product_batches fpb
    where fpb.id = new.finished_product_batch_id;

  select md.finished_product_item_id into v_fp_item_id
    from public.mfr_definitions md
    where md.id = v_mfr_definition_id;

  if v_fp_item_id is null then
    return new;
  end if;

  if new.department = 'production' then
    select unit, item_code, name, item_type_id, production_rm_item_id
      into v_fp_unit, v_fp_item_code, v_fp_item_name, v_fp_item_type_id, v_rm_item_id
      from public.items where id = v_fp_item_id for update;

    if v_rm_item_id is null then
      v_rm_item_code := public.get_next_production_rm_item_code();
      insert into public.items (item_code, name, category, item_type_id, unit)
        values (v_rm_item_code, v_fp_item_name, 'raw', v_fp_item_type_id, v_fp_unit)
        returning id into v_rm_item_id;
      update public.items set production_rm_item_id = v_rm_item_id where id = v_fp_item_id;
    end if;

    perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('push', v_rm_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'production_rm_yield', new.id, auth.uid());

    v_batch_number := public.get_next_production_batch_number(v_rm_item_id);
    v_qc_qty := coalesce(new.qc_qty, 0);
    v_stability_qty := coalesce(new.stability_qty, 0);
    v_rnd_qty := coalesce(new.rnd_qty, 0);

    insert into public.production_issue_batches
      (packaging_issue_id, item_id, batch_number, quantity, unit, live_remaining_qty,
       qc_qty, stability_qty, rnd_qty, created_by)
    values
      (new.id, v_rm_item_id, v_batch_number, new.fp_qty_consumed, v_fp_unit,
       new.fp_qty_consumed - v_qc_qty - v_stability_qty - v_rnd_qty,
       v_qc_qty, v_stability_qty, v_rnd_qty, auth.uid())
    returning id into v_prod_batch_id;

    if v_qc_qty > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, production_batch_id, quantity, unit, department, reference_type, reference_id, event_by)
      values
        ('pull', v_rm_item_id, v_prod_batch_id, v_qc_qty, v_fp_unit, new.department, 'qc_sample', v_prod_batch_id, auth.uid());
    end if;

    if v_stability_qty > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, production_batch_id, quantity, unit, department, reference_type, reference_id, event_by)
      values
        ('pull', v_rm_item_id, v_prod_batch_id, v_stability_qty, v_fp_unit, new.department, 'stability_sample', v_prod_batch_id, auth.uid());
    end if;

    if v_rnd_qty > 0 then
      insert into public.inventory_ledger
        (event_type, item_id, production_batch_id, quantity, unit, department, reference_type, reference_id, event_by)
      values
        ('pull', v_rm_item_id, v_prod_batch_id, v_rnd_qty, v_fp_unit, new.department, 'rnd_sample', v_prod_batch_id, auth.uid());
    end if;

    return new;
  end if;

  select unit, packaged_item_id into v_fp_unit, v_pkg_item_id
    from public.items where id = v_fp_item_id;

  if v_pkg_item_id is null then
    return new;
  end if;

  perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('push', v_pkg_item_id, new.unit_count, 'nos', new.department, 'packaged_fp_yield', new.id, auth.uid());

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', v_pkg_item_id, new.unit_count, 'nos', new.department, 'packaged_fp_issue', new.id, auth.uid());

  return new;
end $$;

-- ------------------------------------------------------------
-- 7. Grandfather every pre-existing production_issue_batches row (built
--    under the old "no QC step" rule) as already QC-Approved — decision
--    #4, confirmed with Ravi. Idempotent: only rows with no
--    quality_checks row against them yet are touched, so re-running this
--    migration (or applying it a second time by accident) is a no-op the
--    second time. No retest period is invented for these — they simply
--    never enter the retest cycle, matching "grandfather in, don't
--    retrofit a fake history."
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_ar text;
begin
  for r in
    select pib.id, pib.item_id
    from public.production_issue_batches pib
    where not exists (
      select 1 from public.quality_checks qc where qc.production_batch_id = pib.id
    )
  loop
    v_ar := public.get_next_ar_number();
    insert into public.quality_checks
      (ar_number, production_batch_id, item_id, status, reviewed_at)
    values
      (v_ar, r.id, r.item_id, 'approved', now());
  end loop;
end $$;
