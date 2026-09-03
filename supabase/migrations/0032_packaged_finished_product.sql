-- ============================================================
-- Task F — "how Finished Product which is only incremental right now in
-- inventory will go out of inventory" (Ravi, 3 Sept 2026).
--
-- Full design/rationale: claude/packaged-fp-redesign.md (project doc).
-- Short version: this is built into the existing Packaging screen, not a
-- new module. A "New Packaging Issue" for department Store or R&D now, in
-- one transaction: (1) pulls bulk Finished Product + Packaging Material
-- as today, (2) pushes a brand-new paired item "Packaged Finished
-- Product" (e.g. PKG-FP-00001 for FP-00001 — same item name, different
-- code/category), (3) immediately pulls that same quantity back out as
-- "issued to Store"/"issued to R&D" — always fully issued, one-shot.
-- Department = Production is explicitly held back ("We will work on this
-- later") — its existing trg_fn_packaging_pull/trg_fn_packaging_item_pull
-- behavior is byte-for-byte unchanged by this migration.
--
-- Entirely additive: one new items.category value, one new nullable
-- self-referencing items column, one new sequence, three new nullable
-- packaging_issues columns, three new inventory_ledger reference_type
-- values, one new trigger (alongside, not replacing, the existing two),
-- and four new item_position columns. No existing row, trigger, or
-- column is altered destructively.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New items.category value: 'packaged_fp'. Distinct from the
--    pre-existing 'packaging' (materials — bottles, caps) despite the
--    similar-looking code prefix chosen below, and distinct from
--    'processed' (bulk Finished Product) — see the design doc for why a
--    fourth value was chosen over reusing either.
-- ------------------------------------------------------------
alter table public.items drop constraint if exists items_category_check;
alter table public.items
  add constraint items_category_check
  check (category in ('raw','processed','packaging','packaged_fp'));

-- ------------------------------------------------------------
-- 2. Pairing column: set once, on the bulk FP ('processed') item, to the
--    id of its paired Packaged FP ('packaged_fp') item. Mirrors
--    mfr_definitions.finished_product_item_id (0010) one level further
--    down the chain. `unique` enforces the strict 1:1 relationship the
--    spec calls for ("For each Finished Product code ... there will be a
--    unique packaged Finished Product code"). Not DB-enforced that the
--    target actually has category = 'packaged_fp' — same lightweight-
--    trust precedent as the mfr_definitions link, which likewise doesn't
--    constrain finished_product_item_id's target category.
-- ------------------------------------------------------------
alter table public.items add column if not exists packaged_item_id uuid references public.items(id);
alter table public.items drop constraint if exists items_packaged_item_id_unique;
alter table public.items add constraint items_packaged_item_id_unique unique (packaged_item_id);
alter table public.items drop constraint if exists items_packaged_item_id_not_self;
alter table public.items add constraint items_packaged_item_id_not_self check (packaged_item_id is null or packaged_item_id <> id);

-- ------------------------------------------------------------
-- 3. Item code generator: new sequence + branch for 'packaged_fp',
--    prefix 'PKG-FP' (-> PKG-FP-00001), matching Ravi's own example code
--    exactly. peek_next_item_code() (0012) updated the same way so a
--    preview never falls through to the wrong prefix if this category is
--    ever surfaced on a preview screen.
-- ------------------------------------------------------------
create sequence if not exists public.item_code_seq_pkgfp start 1;
grant usage, select on public.item_code_seq_pkgfp to anon, authenticated;

create or replace function public.get_next_item_code(p_category text)
returns text language plpgsql as $$
declare v_num int; v_prefix text;
begin
  if p_category = 'packaging' then
    v_num := nextval('public.item_code_seq_pkg'); v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_num := nextval('public.item_code_seq_fp'); v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_num := nextval('public.item_code_seq_pkgfp'); v_prefix := 'PKG-FP';
  else
    v_num := nextval('public.item_code_seq_raw'); v_prefix := 'RM';
  end if;
  return v_prefix || '-' || lpad(v_num::text, 5, '0');
end $$;

create or replace function public.peek_next_item_code(p_category text)
returns text language plpgsql stable as $$
declare
  v_num bigint;
  v_prefix text;
  v_seq regclass;
begin
  if p_category = 'packaging' then
    v_seq := 'public.item_code_seq_pkg'; v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_seq := 'public.item_code_seq_fp'; v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_seq := 'public.item_code_seq_pkgfp'; v_prefix := 'PKG-FP';
  else
    v_seq := 'public.item_code_seq_raw'; v_prefix := 'RM';
  end if;

  execute format(
    'select case when is_called then last_value + 1 else last_value end from %s',
    v_seq
  ) into v_num;

  return v_prefix || '-' || lpad(v_num::text, 5, '0');
end $$;

-- ------------------------------------------------------------
-- 4. packaging_issues: three new nullable columns, populated only by
--    createPackagingIssue() and only for department in ('store','rnd').
--    Production rows leave all three null and go on using free-text
--    pack_size exactly as before this migration — nothing here changes
--    Production's existing shape or behavior.
--
--    pack_size_qty / pack_size_unit: the structured "how much bulk FP per
--    packaged unit" the user enters (e.g. 1 + 'ltr' for a 1L bottle).
--    fp_qty_consumed: pack_size_qty * unit_count, already converted (via
--    lib/constants/units.ts convertUnit(), app-side) into the FP item's
--    own base unit — so the trigger below is a straight read, never unit
--    arithmetic in SQL.
-- ------------------------------------------------------------
alter table public.packaging_issues add column if not exists pack_size_qty numeric;
alter table public.packaging_issues add column if not exists pack_size_unit text;
alter table public.packaging_issues add column if not exists fp_qty_consumed numeric;
alter table public.packaging_issues drop constraint if exists packaging_pack_size_qty_positive;
alter table public.packaging_issues add constraint packaging_pack_size_qty_positive check (pack_size_qty is null or pack_size_qty > 0);
alter table public.packaging_issues drop constraint if exists packaging_fp_qty_consumed_positive;
alter table public.packaging_issues add constraint packaging_fp_qty_consumed_positive check (fp_qty_consumed is null or fp_qty_consumed > 0);

-- ------------------------------------------------------------
-- 5. Three new inventory_ledger reference_type values for the transform-
--    and-issue flow. Store vs R&D is distinguished by the existing
--    `department` column on each row, not by separate reference_type
--    values per department — same pattern the pre-existing 'packaging'
--    pulls already use.
-- ------------------------------------------------------------
alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reference_type_check;
alter table public.inventory_ledger
  add constraint inventory_ledger_reference_type_check
  check (reference_type in (
    'purchase','qc','qc_sample','stability_sample','rnd_sample','finished_product',
    'packaging','fp_yield','fp_packaging_pull','packaged_fp_yield','packaged_fp_issue'
  ));

-- ------------------------------------------------------------
-- 6. The transform-and-issue trigger. Fires alongside (not instead of)
--    the existing trg_packaging_pull (packaged_qty bump) and
--    trg_packaging_item_pull (packaging-material pulls, unchanged, fires
--    for every department including production). This one is a no-op for
--    production and for any row the server action didn't populate
--    fp_qty_consumed on.
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_transform_and_issue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mfr_definition_id uuid;
  v_fp_item_id uuid;
  v_fp_unit text;
  v_pkg_item_id uuid;
begin
  -- Production is explicitly held back for now — see the migration header
  -- and claude/packaged-fp-redesign.md. Nothing below this line ever runs
  -- for a production issue.
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

drop trigger if exists trg_packaging_transform_and_issue on public.packaging_issues;
create trigger trg_packaging_transform_and_issue
  after insert on public.packaging_issues
  for each row execute function public.trg_fn_packaging_transform_and_issue();

-- ------------------------------------------------------------
-- 7. item_position (0031_stock_position.sql) extended with four more
--    additive columns. Every new reference_type value above is covered
--    by exactly one bucket here, preserving the view's existing
--    reconciliation invariant (every inventory_ledger reference_type is
--    covered by exactly one item_position bucket). on_hand's generic
--    push-minus-pull expression is unchanged — it already nets a
--    Packaged FP item to zero automatically once yield and issue both
--    land.
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
  -- New columns appended after the pre-existing ones (`create or replace
  -- view` requires every existing column to keep its exact name, type and
  -- ordinal position — new columns can only ever be added at the end).
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'fp_packaging_pull' then l.quantity else 0 end), 0) as consumed_by_packaging,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'packaged_fp_yield' then l.quantity else 0 end), 0) as packaged_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then l.quantity else 0 end), 0) as issued_store,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then l.quantity else 0 end), 0) as issued_rnd
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;
