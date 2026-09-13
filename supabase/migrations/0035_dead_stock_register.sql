-- ============================================================
-- Dead Stock Register
--
-- Requested per the open-requirements-log gap analysis (12-13 Sept 2026):
-- spec.md 4.3 "Asset Register: Dead Stock Log — track purchase date,
-- original value, and 25% Depreciation to show Balance Value." A real
-- legacy spreadsheet ("Dead Stock Register.xlsx") is on hand, but it
-- contains only a single worked example row (one PC, qty 4, purchased at
-- 40000, 25% depreciated, one unit rejected, three remaining) — a template
-- to build the field set against, not a historical backlog to import. So
-- this migration ships the schema only, with no seed data.
--
-- Per Ravi (13 Sept 2026): balance_qty/balance_value are plain editable
-- fields, not an auto-computed running ledger like Inventory Ledger's
-- push/pull model — this register is reviewed and adjusted by hand a few
-- times a year in practice, so a v1 that mirrors that (enter a rejection,
-- manually update the balance) is lower-risk than building disposal-event
-- triggers for a low-volume module.
--
-- purchase_price is a PER-UNIT price, not a line total — confirmed by
-- reconciling the source sheet's one worked example against its own
-- numbers: Qty 4, Purchase Price 40000, 25% depreciation -> "Value" 30000,
-- Balance Qty 3 -> "Value" 90000. That only holds together if 40000 is the
-- per-unit price (40000 * 0.75 = 30000 depreciated value per unit; 3 *
-- 30000 = 90000 balance value) — a line-total reading (40000 for all 4)
-- does not reconcile. depreciated_unit_value is the one figure that IS
-- computed, since it's a pure function of purchase_price and
-- depreciation_pct with no write-side ambiguity: the value one unit is
-- still worth after applying the depreciation percentage (NOT the amount
-- lost to depreciation). rejected_value/balance_value stay manual, since
-- a written-off unit's value in the source data is a business call (0),
-- not a formula.
-- ============================================================

create sequence public.dead_stock_code_seq start 1;

create table public.dead_stock_items (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  article_name text not null,
  date_of_purchase date,
  quantity numeric not null default 1,
  purchase_price numeric, -- per unit, not a line total — see note above
  depreciation_pct numeric not null default 25,
  depreciated_unit_value numeric generated always as (
    round(coalesce(purchase_price, 0) * (100 - coalesce(depreciation_pct, 0)) / 100, 2)
  ) stored,
  resolution_date date,
  rejected_qty numeric not null default 0,
  rejected_value numeric not null default 0,
  balance_qty numeric,
  balance_value numeric,
  remark text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_dead_stock_items_updated before update on public.dead_stock_items
  for each row execute function public.set_updated_at();
alter table public.dead_stock_items enable row level security;
create policy dead_stock_items_select on public.dead_stock_items for select using (public.is_signed_in());
-- Insert/update role set matches Equipment (Ravi's 13 Sept 2026 decision
-- applied consistently to both new modules) — mirrors
-- MODULE_WRITE_ROLES.dead_stock in roles.ts. Delete is split out and kept
-- admin-only, same convention as 0009_master_data_delete_policy.sql.
create policy dead_stock_items_insert on public.dead_stock_items for insert
  with check (public.has_any_role('system_admin', 'inventory_manager', 'mfr_manager', 'quality_checker', 'qc_reviewer'));
create policy dead_stock_items_update on public.dead_stock_items for update
  using (public.has_any_role('system_admin', 'inventory_manager', 'mfr_manager', 'quality_checker', 'qc_reviewer'))
  with check (public.has_any_role('system_admin', 'inventory_manager', 'mfr_manager', 'quality_checker', 'qc_reviewer'));
create policy dead_stock_items_delete on public.dead_stock_items for delete
  using (public.has_any_role('system_admin'));

create or replace function public.get_next_dead_stock_code()
returns text language sql as $$
  select 'DS-' || lpad(nextval('public.dead_stock_code_seq')::text, 4, '0');
$$;

-- Non-consuming preview, same pattern as peek_next_vendor_code() /
-- peek_next_item_code() in 0012_peek_next_codes.sql.
create or replace function public.peek_next_dead_stock_code()
returns text language sql stable as $$
  select 'DS-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text,
    4, '0'
  )
  from public.dead_stock_code_seq;
$$;
