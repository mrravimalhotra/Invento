-- ============================================================
-- Part A batch 3 — indexes and bulk code generation (A16 / A17 / A18,
-- audit items PERF-02 / PERF-03 / PERF-04).
-- Postgres does not index foreign-key columns by itself, so deleting or
-- joining on these columns scans the whole table. Checked against a
-- 400,000-row ledger: the lookup the QC-review trigger does on
-- (reference_type, reference_id) goes from a full scan (~30 ms) to an
-- index hit (~0.03 ms); the other indexes matter for joins, cascades and
-- "where is this used" checks as the tables grow.
--
-- Nothing changes in behaviour or data. Two older single-column indexes
-- are dropped because the new composite ones start with the same column
-- and serve the same lookups:
--   inventory_ledger_item_id_idx           -> inventory_ledger_item_event_idx
--   quality_checks_purchase_line_id_idx    -> quality_checks_pl_created_idx
-- Not added on purpose: purchase_orders(status) (only two values, an
-- index would not be used), the deprecated bmr_* tables, and the legacy
-- unused packaging_issues.packaging_item_id column.
-- Plain CREATE INDEX (not CONCURRENTLY) so it runs in the SQL Editor; the
-- tables hold test data only, so the brief lock is not a concern.
-- ============================================================

-- Ledger
create index if not exists inventory_ledger_item_event_idx
  on public.inventory_ledger (item_id, event_at, seq);
create index if not exists inventory_ledger_reference_idx
  on public.inventory_ledger (reference_type, reference_id);
create index if not exists inventory_ledger_production_batch_idx
  on public.inventory_ledger (production_batch_id) where production_batch_id is not null;
drop index if exists public.inventory_ledger_item_id_idx;

-- Quality control
create index if not exists quality_checks_pl_created_idx
  on public.quality_checks (purchase_line_id, created_at desc);
drop index if exists public.quality_checks_purchase_line_id_idx;

-- COA
create index if not exists coa_records_quality_check_id_idx
  on public.coa_records (quality_check_id);
create index if not exists coa_records_fp_batch_id_idx
  on public.coa_records (finished_product_batch_id);
create index if not exists coa_records_template_id_idx
  on public.coa_records (coa_template_id);

-- Purchase, items, MFR
create index if not exists purchase_orders_vendor_id_idx
  on public.purchase_orders (vendor_id);
create index if not exists items_item_type_id_idx
  on public.items (item_type_id);
create index if not exists mfr_definitions_item_type_id_idx
  on public.mfr_definitions (item_type_id);
create index if not exists mfr_lines_item_id_idx
  on public.mfr_lines (item_id);

-- Packaging
create index if not exists packaging_issues_fp_batch_id_idx
  on public.packaging_issues (finished_product_batch_id);
create index if not exists packaging_issue_items_issue_id_idx
  on public.packaging_issue_items (packaging_issue_id);
create index if not exists packaging_issue_items_item_id_idx
  on public.packaging_issue_items (item_id);
create index if not exists production_issue_batches_issue_id_idx
  on public.production_issue_batches (packaging_issue_id);

-- ------------------------------------------------------------
-- A18. Bulk code generation in one call (PERF-04)
-- Bulk uploads used to ask the database for one code per row (up to 500
-- round trips) before the single insert. These return N codes from the
-- same sequences in one call, in order, so a 500-row import makes one
-- request instead of 500. The single-code functions are unchanged.
-- ------------------------------------------------------------
create or replace function public.get_next_item_codes(p_category text, p_count int)
returns setof text language plpgsql as $$
declare i int;
begin
  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'Code count must be between 1 and 5000.' using errcode = '22023';
  end if;
  for i in 1 .. p_count loop
    return next public.get_next_item_code(p_category);
  end loop;
end $$;

create or replace function public.get_next_vendor_codes(p_count int)
returns setof text language plpgsql as $$
declare i int;
begin
  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'Code count must be between 1 and 5000.' using errcode = '22023';
  end if;
  for i in 1 .. p_count loop
    return next public.get_next_vendor_code();
  end loop;
end $$;

create or replace function public.get_next_equipment_codes(p_count int)
returns setof text language plpgsql as $$
declare i int;
begin
  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'Code count must be between 1 and 5000.' using errcode = '22023';
  end if;
  for i in 1 .. p_count loop
    return next public.get_next_equipment_code();
  end loop;
end $$;

create or replace function public.get_next_dead_stock_codes(p_count int)
returns setof text language plpgsql as $$
declare i int;
begin
  if p_count is null or p_count < 1 or p_count > 5000 then
    raise exception 'Code count must be between 1 and 5000.' using errcode = '22023';
  end if;
  for i in 1 .. p_count loop
    return next public.get_next_dead_stock_code();
  end loop;
end $$;

revoke all on function public.get_next_item_codes(text, int), public.get_next_vendor_codes(int),
  public.get_next_equipment_codes(int), public.get_next_dead_stock_codes(int) from public, anon;
grant execute on function public.get_next_item_codes(text, int), public.get_next_vendor_codes(int),
  public.get_next_equipment_codes(int), public.get_next_dead_stock_codes(int) to authenticated;

-- Self-check
do $$
begin
  if (select count(*) from pg_indexes where schemaname = 'public' and indexname in (
        'inventory_ledger_item_event_idx','inventory_ledger_reference_idx','inventory_ledger_production_batch_idx',
        'quality_checks_pl_created_idx','coa_records_quality_check_id_idx','coa_records_fp_batch_id_idx',
        'coa_records_template_id_idx','purchase_orders_vendor_id_idx','items_item_type_id_idx',
        'mfr_definitions_item_type_id_idx','mfr_lines_item_id_idx','packaging_issues_fp_batch_id_idx',
        'packaging_issue_items_issue_id_idx','packaging_issue_items_item_id_idx',
        'production_issue_batches_issue_id_idx')) <> 15
     or (select count(*) from pg_proc where proname in ('get_next_item_codes','get_next_vendor_codes',
        'get_next_equipment_codes','get_next_dead_stock_codes')) <> 4 then
    raise exception '0087 self-check failed: an index is missing.';
  end if;
end $$;
