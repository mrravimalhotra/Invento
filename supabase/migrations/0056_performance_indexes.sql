-- ============================================================
-- Add missing indexes on the foreign-key columns this app actually
-- filters/joins on most.
--
-- Ravi (21 Sept 2026): "the app is very slow, help optimize it." Alongside
-- the click-feedback fix (app/(dashboard)/loading.tsx — see
-- docs/modules/shell.md), I surveyed the schema for the other half of
-- "why is it slow": across 56 migrations, only `page_feedback`'s 3 columns
-- and two narrow partial-unique indexes (purchase_lines(item_id,
-- batch_number), quality_checks(purchase_line_id) scoped to pending) have
-- ever had an index. Postgres does NOT automatically index foreign-key
-- columns — every `.eq("item_id", ...)` / `.eq("purchase_line_id", ...)` /
-- `.eq("mfr_definition_id", ...)` / `.eq("finished_product_batch_id", ...)`
-- / `.eq("purchase_order_id", ...)` call in the app (confirmed by grep
-- against lib/actions/*.ts and app/(dashboard)/**/page.tsx — real,
-- evidenced call sites, not a guess) has been running a full sequential
-- scan of the whole table, every time, since 0001_init.sql.
--
-- Two of these tables already have real size: purchase_lines is ~92,000
-- rows on the live database today, and inventory_ledger gets a new row on
-- every purchase/QC/production/packaging transaction, so it only grows
-- from here. A few are hit on nearly every page load:
--   - stock_balance (0001_init.sql) is `group by item_id` over ALL of
--     inventory_ledger, with no index on inventory_ledger.item_id. This
--     view is queried from the Dashboard, Items list, Item detail,
--     Inventory Balance, Reports, and the Finished Product compose screen.
--   - purchase_batch_status (0001_init.sql) LEFT JOIN LATERALs into
--     quality_checks per purchase_lines row with no general-purpose index
--     on quality_checks.purchase_line_id (only a partial one scoped to
--     status='submitted', which the planner can't use for an unscoped
--     lookup). This view backs the QC list's "Awaiting QC"/"Due for
--     retest" cards (every /qc visit) and the Finished Product compose
--     screen's candidate-batch lookup.
--   - get_next_fp_batch_number(p_mfr_definition_id) (0055, shipped
--     earlier today) counts finished_product_batches WHERE
--     mfr_definition_id = ..., with no index on that column either — every
--     "Create Batch" click does a full scan of that table.
--
-- Purely additive: CREATE INDEX only, no data touched, no existing query
-- result changes (only how fast it's computed) — safe to run any time,
-- and trivially reversible with DROP INDEX if one is ever not wanted.
--
-- Scope note: this is the schema-level half of "the app is very slow."
-- It does NOT address list pages (Reports, Items, Inventory Balance) that
-- fetch entire tables to the browser and paginate client-side — that's a
-- separate, larger app-layer change (server-side pagination), flagged to
-- Ravi rather than done here. These indexes help every query on these
-- tables, including those pages' underlying fetches, but don't reduce how
-- much data those specific pages pull per visit.
-- ============================================================

-- inventory_ledger: backs stock_balance (grouped by item_id) and every
-- per-item ledger view/report. Grows with every transaction.
create index if not exists inventory_ledger_item_id_idx
  on public.inventory_ledger (item_id);
create index if not exists inventory_ledger_purchase_line_id_idx
  on public.inventory_ledger (purchase_line_id);

-- quality_checks: general-purpose lookups by purchase line, FP batch, and
-- item — the existing quality_checks_purchase_line_pending_unique index
-- (0025/0054) is scoped to status='submitted' and can't serve these.
create index if not exists quality_checks_purchase_line_id_idx
  on public.quality_checks (purchase_line_id);
create index if not exists quality_checks_finished_product_batch_id_idx
  on public.quality_checks (finished_product_batch_id);
create index if not exists quality_checks_item_id_idx
  on public.quality_checks (item_id);

-- purchase_lines: purchase_lines_item_batch_unique (0013) is a PARTIAL
-- index (excludes 'LEG-%' rows) with item_id as its leading column, but
-- the planner can only use it for queries that also respect that partial
-- predicate — a plain `.eq("item_id", ...)` over ALL rows (get_next_batch_
-- number's per-item/year count, item detail page, etc.) isn't covered by
-- it. purchase_order_id backs every Purchase Order detail page.
create index if not exists purchase_lines_item_id_idx
  on public.purchase_lines (item_id);
create index if not exists purchase_lines_purchase_order_id_idx
  on public.purchase_lines (purchase_order_id);

-- finished_product_components: FP batch detail page, packaging issue
-- lookups, and the "already consumed" checks around QC/inventory.
create index if not exists finished_product_components_batch_id_idx
  on public.finished_product_components (finished_product_batch_id);
create index if not exists finished_product_components_item_id_idx
  on public.finished_product_components (item_id);
create index if not exists finished_product_components_purchase_line_id_idx
  on public.finished_product_components (purchase_line_id);
create index if not exists finished_product_components_production_batch_id_idx
  on public.finished_product_components (production_batch_id);

-- mfr_lines / mfr_procedure_steps: every MFR detail/report page loads both,
-- filtered by mfr_definition_id.
create index if not exists mfr_lines_mfr_definition_id_idx
  on public.mfr_lines (mfr_definition_id);
create index if not exists mfr_procedure_steps_mfr_definition_id_idx
  on public.mfr_procedure_steps (mfr_definition_id);

-- finished_product_batches: get_next_fp_batch_number() (0055) counts rows
-- WHERE mfr_definition_id = ... on every "Create Batch" click.
create index if not exists finished_product_batches_mfr_definition_id_idx
  on public.finished_product_batches (mfr_definition_id);
