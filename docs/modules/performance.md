# Performance

Not a business module — cross-cutting database/query performance work and
findings, spanning multiple modules' tables. See `docs/modules/shell.md` for
the separate "make the wait visible" (loading-state) fix this grew out of.

## Missing indexes on hot foreign-key columns (21 Sept 2026)

Ravi: *"the app is very slow, help optimize it."* Alongside the loading-state
fix (`docs/modules/shell.md`), a quick audit of the schema and the app's own
query patterns turned up the other half of "why slow": across 56 migrations,
almost nothing had an index. Postgres does not automatically index foreign
key columns — that has to be done explicitly, and it never was here. Full
list of what got added, and why each one is real (not speculative — every
column below was confirmed by grepping actual `.eq("<column>", ...)` call
sites in `lib/actions/*.ts` and `app/(dashboard)/**/page.tsx`, and cross-
checking each table's real column names in `supabase/migrations/0001_init.sql`
/ `0048_mfr_procedure.sql` / `0050_production_rm_from_packaging.sql`):

| Table | Column | Why it's hit |
|---|---|---|
| `inventory_ledger` | `item_id` | `stock_balance` view (`0001_init.sql`) is `group by item_id` over the *entire* ledger — queried from the Dashboard, Items list, Item detail, Inventory Balance, Reports, and the Finished Product compose screen. Grows with every purchase/QC/production/packaging transaction. |
| `inventory_ledger` | `purchase_line_id` | Per-batch ledger views/reports. |
| `quality_checks` | `purchase_line_id` | The existing `quality_checks_purchase_line_pending_unique` index (`0025`/`0054`) is a *partial* index scoped to `status='submitted'` — the planner can't use it for an unscoped lookup. General lookups happen in `lib/actions/qc.ts`, and critically inside `purchase_batch_status`'s (`0001_init.sql`) per-row `LEFT JOIN LATERAL`, which runs once per `purchase_lines` row (already ~92k on the live DB) — this view backs the QC list's "Awaiting QC"/"Due for retest" cards (every `/qc` visit) and the Finished Product compose screen's candidate-batch lookup. |
| `quality_checks` | `finished_product_batch_id` | FP batch's own QC record lookups. |
| `quality_checks` | `item_id` | Item-scoped QC history. |
| `purchase_lines` | `item_id` | `purchase_lines_item_batch_unique` (`0013`) is a partial index (excludes `'LEG-%'` rows) with `item_id` as its leading column, but only serves queries that respect that partial predicate — a plain per-item count (e.g. `get_next_batch_number()`'s per-item/year sequence, called on every new purchase line) or the item detail page's purchase-batches table isn't covered by it. |
| `purchase_lines` | `purchase_order_id` | Every Purchase Order detail page (`/purchase/[id]`) loads its lines this way. |
| `finished_product_components` | `finished_product_batch_id` | FP batch detail page. |
| `finished_product_components` | `item_id` | Item-scoped component lookups. |
| `finished_product_components` | `purchase_line_id` | Packaging issue / consumption lookups (`lib/actions/packaging.ts`). |
| `finished_product_components` | `production_batch_id` | Same shape as `purchase_line_id` — a component sources from exactly one of the two (`0050_production_rm_from_packaging.sql`). |
| `mfr_lines` | `mfr_definition_id` | Every MFR detail/report page. |
| `mfr_procedure_steps` | `mfr_definition_id` | Same, for the Manufacturing Procedure section. |
| `finished_product_batches` | `mfr_definition_id` | `get_next_fp_batch_number(p_mfr_definition_id)` (`0055_fp_batch_number_embed_item_code.sql`, shipped earlier the same day) counts rows filtered on this column on every "Create Batch" click. |

Shipped as `supabase/migrations/0056_performance_indexes.sql` — plain
`CREATE INDEX IF NOT EXISTS` statements, no data touched, no existing query
result changes (only how fast Postgres computes it), trivially reversible
with `DROP INDEX` if one is ever not wanted. Matches this project's existing
migration style (no other migration here uses `CREATE INDEX CONCURRENTLY`);
`purchase_lines` at ~92k rows is the largest table touched, and a plain
index build on it is expected to take at most a few seconds, during which
writes to that one table briefly block — acceptable for this app's traffic,
but nothing stops running that one statement on its own during a quiet
moment if extra caution is wanted.

## Known follow-ups, not yet done (flagged 21 Sept 2026)

Found during the same audit, deliberately **not** done in this pass — each
is either a larger architectural change, a behavior change worth Ravi's
explicit go-ahead, or lower urgency than the indexes above:

- **Reports, Items, and Inventory Balance fetch entire tables to the
  browser, then paginate/search client-side.** `app/(dashboard)/reports/
  page.tsx` pages through `purchase_lines` (~92k rows today) via
  `fetchAllRows()` (`lib/supabase/fetch-all.ts`) in 1,000-row windows,
  alongside similar full scans of `items`, `stock_balance`, `quality_checks`,
  and `finished_product_batches` — every single time anyone opens Reports.
  `app/(dashboard)/items/page.tsx` and `app/(dashboard)/inventory/(tabs)/
  balance/page.tsx` do the same against ~2,200+ active items. This is
  likely the single slowest page in the app today (Reports especially), and
  gets linearly worse as more purchases are entered — independent of the
  indexes above, since the query itself asks for every row on purpose. The
  root cause is architectural: `components/ui/data-table.tsx` only ever
  does client-side search/pagination (`useMemo` over the full `rows` prop),
  so no list page in the app currently asks the database for less than
  everything. Fixing this properly means server-side
  search/filter/pagination on these specific pages — a real behavior
  change (URL-driven pagination, debounced server search, etc.), not a
  drop-in fix, and worth scoping as its own task rather than guessing at
  the right UX.
- **Bulk upload does one sequential round trip per row for code
  generation.** `bulkUploadItems`/`bulkUploadVendors`/`bulkUploadEquipment`/
  `bulkUploadDeadStock` (`lib/actions/bulk-upload.ts`) each call
  `get_next_*_code()` once per parsed row before the batched insert — up to
  500 sequential round trips for a full 500-row file. MFR and Purchase bulk
  upload already avoid this via a single RPC per file; worth copying that
  pattern here, but only matters when bulk upload is actually used with a
  large file.
- **`recharts` (the Dashboard's chart library) is bundled unconditionally
  into the highest-traffic page** (`app/(dashboard)/charts.tsx`, rendered
  from `app/(dashboard)/page.tsx` — the post-login landing page everyone
  hits every session), with no code-splitting anywhere in the app
  (`next/dynamic` isn't used at all). Lazy-loading it would shave avoidable
  JS off the very first page most users see.
- **`stock_balance` / `item_position`** (`0001_init.sql` / `0031_stock_
  position.sql`) are plain views, recomputed from scratch on every query
  rather than cached or materialized. The indexes above make each
  computation much cheaper, but the underlying "rescan and re-aggregate the
  whole ledger every time" pattern is still there — a materialized view
  with a refresh trigger would remove it entirely, at the cost of some
  added complexity (staleness window, refresh triggers on every ledger
  write). Only worth it if the indexes alone don't bring these pages down
  to an acceptable speed.

None of these were touched in this pass — flagging them here rather than
picking one and diving in unasked, since each involves either a real UX/
behavior decision (server-side pagination shape) or added complexity
(materialized views) that's worth Ravi's explicit go-ahead first.
