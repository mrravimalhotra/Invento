-- ============================================================
-- Packaging Issue identifier (planned in claude/packaging-issue-
-- identifier-options.md, confirmed by Ravi 28 Sept 2026 — "ok, lets
-- start implementing"). packaging_issues had no human-readable
-- identifier at all, just a UUID primary key, while every other record
-- type in the app already has one (PO-0001, AR-.../F-0001, COA-0001-2026,
-- RM-01/26 batch codes). This adds a plain sequential PKG-#### code
-- (Option A from the planning doc), kept as a separate displayed field
-- alongside the FP batch number rather than fused into one string —
-- Option B (a PKG-01/26 year-scoped code) was rejected because it would
-- visually collide in shape with production_issue_batches' own
-- PROD-NN/YY code on the same event, and Option C (embedding the FP
-- batch number directly) was rejected because it repeats FB-0044's exact
-- compound-string complaint and still isn't unique on its own.
--
-- Built overflow-safe from day one, unlike most of this app's other code
-- generators. get_next_equipment_code() and its siblings use a plain
-- lpad(n, 4, '0'), which Postgres truncates from the LEFT once n exceeds
-- 4 digits (lpad('10000', 4, '0') = '1000', not '10000') — silently
-- colliding with an earlier, shorter code once the sequence crosses
-- 9999. This exact bug class was already found and fixed twice in this
-- codebase (migration 0052 for RM batch numbers, 0066 for FP batch
-- numbers). Since this generator is brand new, it's free to build
-- correctly from the start with lpad(n, greatest(4, length(n)), '0')
-- instead of retrofitting later — the ~10 other pre-existing generators
-- still on the old pattern are tracked as their own separate open item
-- in claude/known-issues.md, not touched by this migration.
-- ============================================================

create sequence if not exists public.packaging_issue_code_seq start 1;

-- Nullable for now — every existing row (all test data) is backfilled
-- below, then the column is locked down with not null + unique. Adding a
-- not-null column straight onto an already-populated table fails
-- outright, so the ordering here matters: add nullable, backfill,
-- *then* constrain.
alter table public.packaging_issues
  add column if not exists code text;

create or replace function public.get_next_packaging_issue_code()
returns text language plpgsql as $$
declare
  v_n text := nextval('public.packaging_issue_code_seq')::text;
begin
  return 'PKG-' || lpad(v_n, greatest(4, length(v_n)), '0');
end;
$$;

-- Non-consuming preview, same pattern as peek_next_vendor_code()/
-- peek_next_item_code() (0012_peek_next_codes.sql) and
-- peek_next_equipment_code() (0034_equipment_master.sql) — kept
-- overflow-safe the same way as the real generator above, for the same
-- reason.
create or replace function public.peek_next_packaging_issue_code()
returns text language sql stable as $$
  select 'PKG-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    greatest(4, length((case when is_called then last_value + 1 else last_value end)::text)),
    '0'
  )
  from public.packaging_issue_code_seq;
$$;

-- ------------------------------------------------------------
-- Backfill every existing packaging_issues row (all of it test data
-- created during this project's live verification passes, per the
-- standing "fine to leave test data during this testing phase"
-- preference — nothing here needs cleanup first). Ordered by
-- created_at, tie-broken by id so the assignment is reproducible rather
-- than dependent on incidental row order.
-- ------------------------------------------------------------
with numbered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.packaging_issues
  where code is null
)
update public.packaging_issues p
set code = 'PKG-' || lpad(numbered.rn::text, greatest(4, length(numbered.rn::text)), '0')
from numbered
where p.id = numbered.id;

-- Advance the sequence past however many rows were just backfilled, so
-- the next call to get_next_packaging_issue_code() continues right after
-- them rather than colliding with a backfilled code. Only touches the
-- sequence when there's actually something to advance past — on a
-- genuinely empty table (a brand-new install, or right after a Purge
-- Test Data run) this is a no-op, so the very first issue still gets
-- PKG-0001 rather than the sequence being nudged to skip it.
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.packaging_issues;
  if v_count > 0 then
    perform setval('public.packaging_issue_code_seq', v_count, true);
  end if;
end $$;

alter table public.packaging_issues
  alter column code set not null;

alter table public.packaging_issues
  drop constraint if exists packaging_issues_code_unique;
alter table public.packaging_issues
  add constraint packaging_issues_code_unique unique (code);

-- ------------------------------------------------------------
-- purge_test_data() (0039_purge_test_data.sql) resets every other
-- code-generation sequence it's aware of on a purge; packaging_issue_
-- code_seq didn't exist yet when that function was written, so it needs
-- to be added to the reset list now — otherwise a future Purge Test Data
-- run would correctly wipe every packaging_issues row but leave PKG
-- numbering wherever it was, unlike every other code type. Return type
-- is unchanged (table(table_name text, rows_purged bigint)), so this is
-- a plain CREATE OR REPLACE, no DROP FUNCTION needed first.
-- ------------------------------------------------------------
create or replace function public.purge_test_data()
returns table(table_name text, rows_purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'bmr_observations', 'bmr_records', 'bmr_weighment_lines', 'coa_records',
    'dead_stock_items', 'documents', 'environmental_control_readings', 'equipment',
    'finished_product_batches', 'finished_product_components', 'inventory_ledger',
    'item_types', 'items', 'line_clearance_checks', 'mfr_definitions', 'mfr_lines',
    'packaging_issue_items', 'packaging_issues', 'purchase_lines', 'purchase_orders',
    'quality_checks', 'vendors'
  ];
  -- feedback_ticket_seq intentionally excluded — page_feedback is kept.
  v_sequences text[] := array[
    'item_code_seq_raw', 'item_code_seq_pkg', 'item_code_seq_fp', 'item_code_seq_pkgfp',
    'vendor_code_seq', 'po_number_seq', 'ar_number_seq', 'mfr_code_seq', 'fp_batch_seq',
    'coa_number_seq', 'equipment_code_seq', 'dead_stock_code_seq', 'packaging_issue_code_seq'
  ];
  v_tbl text;
  v_seq text;
  v_count bigint;
  v_truncate_list text;
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only System Admin can purge test data.';
  end if;

  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I', v_tbl) into v_count;
    table_name := v_tbl;
    rows_purged := v_count;
    return next;
  end loop;

  select string_agg(format('public.%I', t), ', ') into v_truncate_list from unnest(v_tables) as t;
  execute format('truncate table %s restart identity cascade', v_truncate_list);

  foreach v_seq in array v_sequences loop
    execute format('alter sequence public.%I restart with 1', v_seq);
  end loop;
end $$;
