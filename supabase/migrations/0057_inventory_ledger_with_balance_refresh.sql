-- ============================================================
-- Fix: Inventory Ledger page showing "Could not find a relationship
-- between 'inventory_ledger_with_balance' and 'production_issue_batches'
-- in the schema cache" (Ravi, live screenshot, 21 Sept 2026), on both the
-- Ledger tab (app/(dashboard)/inventory/(tabs)/page.tsx) and the per-item
-- embedded ledger (app/(dashboard)/inventory/items/[id]/page.tsx) — both
-- query inventory_ledger_with_balance with
-- "...production_issue_batches(batch_number)" embedded in the select.
--
-- Root cause: inventory_ledger_with_balance (0031_stock_position.sql) is
-- defined as `select il.*, <running_balance window fn> from
-- inventory_ledger il`. Postgres expands `il.*` into the base table's
-- column list AT THE MOMENT the view is created (or last CREATE OR REPLACE
-- VIEW) — it is NOT re-evaluated when a column is added to the base table
-- later. inventory_ledger.production_batch_id was added by
-- 0050_production_rm_from_packaging.sql, nineteen migrations after 0031
-- created this view, and the view was never re-created since — so
-- production_batch_id has never actually existed on
-- inventory_ledger_with_balance in production. PostgREST can't embed a
-- relationship to production_issue_batches through a column that doesn't
-- exist on the view it's querying, hence the exact error above. (The other
-- embed in the same select, purchase_lines(batch_number), works fine:
-- purchase_line_id was already a column on inventory_ledger back when 0031
-- first created the view, so it was captured correctly.)
--
-- Checked every other `alter table public.inventory_ledger add column`
-- across every migration after 0031 (0003 predates it; 0028/0030/0032/
-- 0036/0046 only touch check constraints, no new columns) —
-- production_batch_id is the only column this view has been missing.
--
-- Fix: DROP + re-CREATE the view (verbatim same query as 0031) so `il.*`
-- re-expands against inventory_ledger's CURRENT column list, picking up
-- production_batch_id.
--
-- Tried `CREATE OR REPLACE VIEW` first — it fails here:
--   ERROR: cannot change name of view column "running_balance" to
--   "production_batch_id"
-- because Postgres only allows CREATE OR REPLACE to APPEND new trailing
-- columns; it can't insert one in the middle. production_batch_id sits at
-- the end of inventory_ledger's own column list (it was added via ALTER
-- TABLE ... ADD COLUMN, after `seq`), so `il.*` expands to place it right
-- before the view's own explicit `running_balance` column — which is
-- already that view's last (existing) column. Since production_batch_id
-- would have to land BEFORE running_balance, not after it, this counts as
-- reordering an existing column, which CREATE OR REPLACE VIEW refuses.
-- DROP + CREATE has no such constraint (confirmed against a local Postgres
-- reproduction of the exact 0031-then-0050 sequence before writing this).
--
-- Grants: dropping and recreating the view does NOT need a new GRANT
-- statement — 0001_init.sql's `alter default privileges in schema public
-- grant select, insert, update, delete on tables to anon, authenticated`
-- applies automatically to any new relation (table OR view) created by the
-- same role from here on, exactly like every `CREATE OR REPLACE FUNCTION`
-- in this codebase already relies on for execute grants. Confirmed locally:
-- after DROP + CREATE, `\dp` shows anon/authenticated already have
-- arwd on the recreated view with no explicit GRANT needed.
--
-- No data migration, no app-code change — both call sites above already
-- select production_issue_batches(batch_number) correctly and will simply
-- start working once the view exposes the column it needs.
--
-- Forward-looking note: this same "CREATE OR REPLACE fails, must DROP +
-- CREATE instead" applies again any time inventory_ledger gains another
-- column in the future — worth remembering before reaching for the more
-- familiar CREATE OR REPLACE pattern this codebase uses everywhere else.
-- ============================================================

drop view if exists public.inventory_ledger_with_balance;

create view public.inventory_ledger_with_balance as
select
  il.*,
  sum(case il.event_type when 'push' then il.quantity when 'wastage' then -il.quantity else -il.quantity end)
    over (partition by il.item_id order by il.event_at, il.seq rows between unbounded preceding and current row) as running_balance
from public.inventory_ledger il;

-- Supabase's PostgREST instance normally picks up view/schema changes on
-- its own shortly after a DDL statement runs, but that reload isn't
-- instant or guaranteed for every change — this forces it immediately so
-- the fix takes effect as soon as this migration finishes running, rather
-- than leaving the same error visible for an indeterminate few minutes.
notify pgrst, 'reload schema';
