-- ============================================================
-- Packaging issued to Production converts Finished Product into a new,
-- standing Raw Material batch another Finished Product's recipe can draw
-- on (Ravi, 19 Sept 2026):
--
--   "when Packaging is issued to production - it would become available
--   as Raw material for another Finished Product... similar to how
--   PKG-FP-00001 is created, we should create a new Raw Material code
--   example RM-FP-00001 when a finished product is issued to Production.
--   In this case the finished Product FP-00001 quantity issued to
--   production will be deducted from inventory and new Raw Material
--   RM-FP-00001 will be added to inventory. There are no packaging items
--   required when a finished product is issued to Production."
--
-- Full design/rationale: claude/packaged-fp-redesign.md's "Packaging
-- issued to Production" addendum. Four decisions confirmed with Ravi via
-- AskUserQuestion before writing this:
--   1. No new QC step — the underlying Finished Product batch was already
--      QC-approved before Packaging could touch it at all; that clearance
--      carries through to the Raw Material it's converted into.
--   2. A new, lightweight batch table (not a synthetic purchase_lines/
--      vendor row) tracks the produced/remaining quantity — keeps
--      Purchase Register/RM Stock reports untouched by internal
--      repackaging.
--   3. This REPLACES the old Production packaging-issue behavior
--      (materials-only, no FP involved) going forward — new Production
--      issues always do the FP -> RM-FP conversion; no packaging
--      materials are required or accepted for a production issue.
--   4. RM-FP-00001 (and its pairing to FP-00001) is created LAZILY, the
--      first time that FP is actually issued to Production — not eagerly
--      at MFR approval, unlike PKG-FP-00001.
--
-- Unlike PKG-FP (always counted in "count", packaging units), RM-FP is a
-- straight same-quantity, same-unit conversion of the bulk Finished
-- Product — no pack-size multiplication, no unit selector.
--
-- Entirely additive: one new nullable self-referencing items column, one
-- new sequence, one new table, two new nullable columns (one each on
-- finished_product_components / inventory_ledger), one new reference_type
-- value, one new item_position column, and targeted `create or replace`
-- rewrites of five existing trigger/gate functions (each already
-- `security definer` / already shared across call sites, so a rewrite
-- picks up the new behavior everywhere it's used with no trigger
-- redefinition needed). No existing row, trigger, or column is altered
-- destructively.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pairing column: set once, on the bulk FP ('processed') item, to the
--    id of its paired production-sourced Raw Material item. Second slot
--    alongside packaged_item_id (0032) — a bulk FP item can have both a
--    Packaged FP pairing (Store/R&D) and a Production-RM pairing, set
--    independently and lazily.
-- ------------------------------------------------------------
alter table public.items add column if not exists production_rm_item_id uuid references public.items(id);
alter table public.items drop constraint if exists items_production_rm_item_id_unique;
alter table public.items add constraint items_production_rm_item_id_unique unique (production_rm_item_id);
alter table public.items drop constraint if exists items_production_rm_item_id_not_self;
alter table public.items add constraint items_production_rm_item_id_not_self check (production_rm_item_id is null or production_rm_item_id <> id);

-- ------------------------------------------------------------
-- 2. Item code generator for the lazily-created Raw Material item.
--    Deliberately NOT folded into get_next_item_code(p_category) — that
--    function already maps category='raw' to prefix 'RM' for every
--    ordinary, purchased raw material (Item Master / bulk upload), and
--    this item, while genuinely category='raw', needs the distinct
--    'RM-FP' prefix Ravi specified. A dedicated function keeps the two
--    numbering sequences (and their prefixes) from ever colliding.
-- ------------------------------------------------------------
create sequence if not exists public.item_code_seq_rmfp start 1;
grant usage, select on public.item_code_seq_rmfp to anon, authenticated;

create or replace function public.get_next_production_rm_item_code()
returns text language sql as $$
  select 'RM-FP-' || lpad(nextval('public.item_code_seq_rmfp')::text, 5, '0');
$$;

-- ------------------------------------------------------------
-- 3. Batch tracking for Production-sourced Raw Material stock. Plays the
--    same functional role purchase_lines plays for purchased Raw
--    Material (a lot with a live, maintained remaining quantity that
--    Finished Product composition's FIFO allocator draws down) — kept as
--    its own table rather than a synthetic purchase_lines row so
--    Purchase-scoped reports (Purchase Register, RM Stock) never need to
--    filter out internal repackaging.
-- ------------------------------------------------------------
create table public.production_issue_batches (
  id uuid primary key default gen_random_uuid(),
  packaging_issue_id uuid not null references public.packaging_issues(id) on delete cascade,
  item_id uuid not null references public.items(id),
  batch_number text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  live_remaining_qty numeric not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index production_issue_batches_item_batch_unique
  on public.production_issue_batches (item_id, batch_number);
alter table public.production_issue_batches
  add constraint production_live_remaining_not_negative check (live_remaining_qty >= 0) not valid;

alter table public.production_issue_batches enable row level security;
create policy production_issue_batches_select on public.production_issue_batches
  for select using (public.is_signed_in());
-- Same "no direct write" shape as inventory_ledger (0001_init.sql,
-- ledger_no_direct_write): every row here is written exclusively by the
-- SECURITY DEFINER trigger below, as a side effect of a Production
-- packaging issue, inside that same transaction.
create policy production_issue_batches_no_direct_write on public.production_issue_batches
  for insert with check (false);

-- Batch numbering, same shape/race-safety idiom as get_next_batch_number
-- (0001_init.sql / 0013_batch_number_integrity.sql): item-scoped,
-- year-suffixed. Always called with the target item's row already locked
-- by the caller (see the trigger below), so — unlike purchase_lines'
-- original count(*)+1 race — two concurrent Production issues against the
-- same Raw Material item can't compute the same batch number here; no
-- separate unique-index-plus-retry backstop is needed the way 0013 needed
-- one for purchase_lines.
create or replace function public.get_next_production_batch_number(p_item_id uuid)
returns text language plpgsql as $$
declare v_year text := to_char(now(), 'YY'); v_n int;
begin
  select count(*) + 1 into v_n from public.production_issue_batches
  where item_id = p_item_id and to_char(created_at, 'YY') = v_year;
  return 'PROD-' || lpad(v_n::text, 2, '0') || '/' || v_year;
end $$;

-- ------------------------------------------------------------
-- 4. finished_product_components can now source a component from either
--    a purchased Raw Material batch (purchase_line_id, unchanged) or a
--    Production-sourced Raw Material batch (production_batch_id, new) —
--    never both, never neither.
-- ------------------------------------------------------------
alter table public.finished_product_components
  alter column purchase_line_id drop not null;
alter table public.finished_product_components
  add column if not exists production_batch_id uuid references public.production_issue_batches(id);
alter table public.finished_product_components
  drop constraint if exists fp_components_exactly_one_source;
alter table public.finished_product_components
  add constraint fp_components_exactly_one_source check (
    (purchase_line_id is not null and production_batch_id is null) or
    (purchase_line_id is null and production_batch_id is not null)
  );

-- ------------------------------------------------------------
-- 5. inventory_ledger gets the same second, alternate reference column —
--    mirrors purchase_line_id so a pull sourced from a Production batch
--    stays traceable back to it, same as a purchase-sourced pull already
--    is. Plus the one new reference_type value for the RM-FP push itself.
-- ------------------------------------------------------------
alter table public.inventory_ledger
  add column if not exists production_batch_id uuid references public.production_issue_batches(id);
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in (
    'purchase','qc','qc_sample','stability_sample','rnd_sample','finished_product',
    'packaging','fp_yield','fp_packaging_pull','packaged_fp_yield','packaged_fp_issue',
    'fp_draft_cancelled','production_rm_yield'
  ));

-- ------------------------------------------------------------
-- 6. QC gate (shared by finished_product_components AND
--    bmr_weighment_lines, 0001/0026): skip the QC-approval/retest check
--    entirely when there's no purchase_line_id — a Production-sourced
--    component has nothing to check against (production_issue_batches
--    carries no QC state), and per the confirmed decision above, needs
--    none: the original FP batch's own QC approval already cleared this
--    material before it could be converted. bmr_weighment_lines rows
--    always have a real purchase_line_id (untouched by this migration),
--    so this new branch is a no-op for BMR — only finished_product_
--    components can actually hit it.
-- ------------------------------------------------------------
create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
begin
  if new.purchase_line_id is null then
    return new;
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
end $$;

-- ------------------------------------------------------------
-- 7. finished_product_components -> inventory_ledger pull, and the
--    matching live_remaining_qty decrement, both now branch on which
--    source column is set.
-- ------------------------------------------------------------
create or replace function public.trg_fn_fp_component_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, production_batch_id, quantity, reference_type, reference_id, event_by)
  values
    ('pull', new.item_id, new.purchase_line_id, new.production_batch_id, new.quantity, 'finished_product', new.finished_product_batch_id, auth.uid());
  return new;
end $$;

create or replace function public.trg_fn_fp_component_live_remaining_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purchase_line_id is not null then
    update public.purchase_lines
    set live_remaining_qty = live_remaining_qty - new.quantity
    where id = new.purchase_line_id;
  else
    update public.production_issue_batches
    set live_remaining_qty = live_remaining_qty - new.quantity
    where id = new.production_batch_id;
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- 8. Draft-batch cancel reversal (0046_fp_batch_draft_cancel.sql):
--    reverse whichever source each component actually drew from.
-- ------------------------------------------------------------
create or replace function public.trg_fn_fp_batch_draft_cancel_reversal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_ledger
    (event_type, item_id, purchase_line_id, production_batch_id, quantity, reference_type, reference_id, event_by)
  select 'push', fpc.item_id, fpc.purchase_line_id, fpc.production_batch_id, fpc.quantity, 'fp_draft_cancelled', new.id, auth.uid()
  from public.finished_product_components fpc
  where fpc.finished_product_batch_id = new.id;

  update public.purchase_lines pl
  set live_remaining_qty = pl.live_remaining_qty + agg.total_qty
  from (
    select purchase_line_id, sum(quantity) as total_qty
    from public.finished_product_components
    where finished_product_batch_id = new.id and purchase_line_id is not null
    group by purchase_line_id
  ) agg
  where pl.id = agg.purchase_line_id;

  update public.production_issue_batches pb
  set live_remaining_qty = pb.live_remaining_qty + agg.total_qty
  from (
    select production_batch_id, sum(quantity) as total_qty
    from public.finished_product_components
    where finished_product_batch_id = new.id and production_batch_id is not null
    group by production_batch_id
  ) agg
  where pb.id = agg.production_batch_id;

  return new;
end $$;

-- ------------------------------------------------------------
-- 9. The transform trigger itself. Production now runs a genuinely
--    different transform than Store/R&D (no packaging materials, no
--    "packaged units" concept, no immediate issue-out) — branched inside
--    the same function/trigger rather than a second trigger, since both
--    branches still share the FP-item/unit lookup at the top.
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
begin
  if new.department not in ('store', 'rnd', 'production') then
    return new;
  end if;

  -- Defensive: the server action always sets this for every department
  -- this trigger now handles, but this trigger never fabricates a pull
  -- against a null/zero amount.
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

  if new.department = 'production' then
    -- Lock the FP item row first — it's what carries the
    -- production_rm_item_id pairing pointer, so this single lock
    -- serializes every concurrent Production issue against this same FP
    -- (both the lazy-create-the-RM-item race on the very first issue,
    -- and the batch-numbering race on every issue after that), the same
    -- `for update` idiom check_sufficient_stock()/submit_purchase_order()
    -- already use elsewhere in this app.
    select unit, item_code, name, item_type_id, production_rm_item_id
      into v_fp_unit, v_fp_item_code, v_fp_item_name, v_fp_item_type_id, v_rm_item_id
      from public.items where id = v_fp_item_id for update;

    if v_rm_item_id is null then
      -- First-ever Production issue for this FP — create its paired Raw
      -- Material item now (Ravi, 19 Sept 2026: lazily, on first use, not
      -- eagerly at MFR approval like PKG-FP). Same unit as the bulk FP —
      -- unlike PKG-FP this is a straight quantity/unit conversion, never
      -- counted in "count".
      v_rm_item_code := public.get_next_production_rm_item_code();
      insert into public.items (item_code, name, category, item_type_id, unit)
        values (v_rm_item_code, v_fp_item_name, 'raw', v_fp_item_type_id, v_fp_unit)
        returning id into v_rm_item_id;
      update public.items set production_rm_item_id = v_rm_item_id where id = v_fp_item_id;
    end if;

    -- 1. Pull the Finished Product quantity issued to Production.
    perform public.check_sufficient_stock(v_fp_item_id, new.fp_qty_consumed);

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('pull', v_fp_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'fp_packaging_pull', new.id, auth.uid());

    -- 2. Push the same quantity into the paired Raw Material item — a
    --    straight conversion, same quantity and unit, no packaging-count
    --    transform.
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('push', v_rm_item_id, new.fp_qty_consumed, v_fp_unit, new.department, 'production_rm_yield', new.id, auth.uid());

    -- 3. Unlike Store/R&D's Packaged FP, this stock is NOT immediately
    --    issued back out — it stays on hand as real, available Raw
    --    Material stock. Record it as a new batch so Finished Product
    --    composition's FIFO allocator has something to draw from.
    v_batch_number := public.get_next_production_batch_number(v_rm_item_id);
    insert into public.production_issue_batches
      (packaging_issue_id, item_id, batch_number, quantity, unit, live_remaining_qty, created_by)
    values
      (new.id, v_rm_item_id, v_batch_number, new.fp_qty_consumed, v_fp_unit, new.fp_qty_consumed, auth.uid());

    return new;
  end if;

  -- Store / R&D — unchanged from before this migration.
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
-- trg_packaging_transform_and_issue (0032) already points at this
-- function by name — create or replace alone picks up the new body.

-- ------------------------------------------------------------
-- 10. packaged_qty (finished_product_batches) is specifically "how much
--     of this batch has been packaged into materials for distribution" —
--     a Production conversion involves no packaging materials at all, so
--     it should not bump this counter the way a real Store/R&D pack event
--     does. (packaged_qty has no UI consumer today — grepped, nothing
--     reads it yet — so this is a correctness fix ahead of a future
--     reader, not a behavior change anyone would see right now.)
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.department <> 'production' then
    update public.finished_product_batches
      set packaged_qty = packaged_qty +
        case new.transaction_type when 'unpack' then -new.unit_count else new.unit_count end
      where id = new.finished_product_batch_id;
  end if;
  return new;
end $$;
-- trg_packaging_pull (0002/0027) already points at this function by
-- name — create or replace alone picks up the new body.

-- ------------------------------------------------------------
-- 11. item_position: one more additive column for the new push bucket,
--     same pattern 0032 used (new columns appended at the end only,
--     `create or replace view` requires every existing column to keep
--     its exact name/type/position). Consumption of a Production-sourced
--     Raw Material batch (by a later Finished Product) is already
--     covered by the existing consumed_by_fp bucket — it's the same
--     reference_type ('finished_product') regardless of which source
--     column the component drew from, so no change is needed there.
-- ------------------------------------------------------------
create or replace view public.item_position as
select
  i.id as item_id,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity else 0 end), 0) as received,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'fp_yield' then l.quantity else 0 end), 0) as yielded,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample') then l.quantity else 0 end), 0) as held_qc,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'stability_sample' then l.quantity else 0 end), 0) as held_stability,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'rnd_sample' then l.quantity else 0 end), 0) as held_rnd,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity else 0 end), 0) as consumed_by_fp,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaging' then l.quantity else 0 end), 0) as issued_packaging,
  coalesce(sum(case when l.event_type = 'wastage' then l.quantity else 0 end), 0) as wastage,
  coalesce(sum(case l.event_type when 'push' then l.quantity when 'wastage' then -l.quantity else -l.quantity end), 0) as on_hand,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'fp_packaging_pull' then l.quantity else 0 end), 0) as consumed_by_packaging,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'packaged_fp_yield' then l.quantity else 0 end), 0) as packaged_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then l.quantity else 0 end), 0) as issued_store,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then l.quantity else 0 end), 0) as issued_rnd,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'production_rm_yield' then l.quantity else 0 end), 0) as production_rm_yield
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;
