# Module 7 — Inventory Ledger

Cross-reference: `docs/DESIGN.md` §4.6 (schema), §5 (auto-numbering — n/a,
ledger rows have no document number), §6 (route map), §8 (UI system), §9
(known simplifications).

## Role

Write (`inventory` in `MODULE_WRITE_ROLES`): `system_admin`,
`inventory_manager`, `quality_checker`, `qc_reviewer` — mirrors the
`has_any_role(...)` check inside `record_wastage()` in
`0002_transactions.sql`. This module owns exactly one write: recording a
wastage event. Every other row in `inventory_ledger` is written by
`SECURITY DEFINER` triggers as a side effect of Purchase / QC / Finished
Product / Packaging inserts (built by other agents) — this module never
inserts a ledger row directly (blocked by the `ledger_no_direct_write` RLS
policy in `0001_init.sql` anyway). Read is open to any signed-in user, per
the cross-cutting rule in DESIGN.md §3.

## Screens

- **Ledger** — `/inventory` (`app/(dashboard)/inventory/(tabs)/page.tsx`).
  `DataTable` over `inventory_ledger` joined to `items` (name + code) and
  `purchase_lines` (batch number, for the batch text search the brief asked
  for). Columns: date/time, event type (`Badge`, colors already wired for
  push/pull/wastage), item (name, code, batch as a subline), quantity + unit,
  department, reference type, and "by" — resolved to a `profiles.full_name`
  where available, else a shortened user id, else "—". `event_by` is a
  second query (see Deviations) since it references `auth.users`, not
  `profiles`, so PostgREST can't embed it. Capped at the 1000 most recent
  events (see Deviations).
- **Stock Balance** — `/inventory/balance`
  (`.../balance/page.tsx`). The as-of-now "current stock on hand" view the
  baseline never had. Queries `stock_balance` and `items` separately (same
  pattern as the Dashboard's low-stock panel) and merges by `item_id` in JS,
  since `stock_balance` is a plain view with no FK metadata for PostgREST to
  embed through. Shows on-hand per active item with a red "Low stock" badge
  when `on_hand < low_stock_threshold`, a muted "no threshold set" note when
  the item has none.
- **RM Report As On Date** — `/inventory/rm-report`
  (`.../rm-report/page.tsx`), named to match the legacy report exactly.
  Queries `purchase_lines` (`active = true`, `created_at <= <asOf>`) joined
  to `items`. Columns: Item, Batch No., **PQTY** (`quantity`), **SQTY**
  (`qc_qty + stability_qty + rnd_qty`), **QTY** (`remaining_qty`, the
  DB-generated column), Unit, Unit Price, **Total** (`remaining_qty ×
  unit_price`), plus a grand-total footer. Date picker (`rm-report-filter.tsx`,
  a plain GET form so no `useSearchParams()`/Suspense is needed — auto-submits
  on change) defaults to today. "Export PDF" (`rm-report-export.tsx`) calls
  `lib/pdf.ts`'s `downloadPdfTable()` client-side with the same rows the
  table renders — this is a real gap closed: the RM Report As On Date with a
  working export button was a "Not Yet Built" item in the requirements
  review.
- **Record wastage** — `/inventory/wastage/new`
  (`app/(dashboard)/inventory/wastage/new/page.tsx` +
  `wastage-form.tsx`). Item dropdown, dependent batch dropdown (that item's
  `purchase_lines`, optional — "— none —" default, shows remaining qty per
  batch), quantity, unit (defaults to the item's unit, editable), reason
  (required textarea). Submits to `recordWastage` in
  `lib/actions/inventory.ts`, which re-checks `canWrite(..., "inventory")`
  and then calls `supabase.rpc("record_wastage", {...})` — the RPC's own
  role check is the real backstop. The "Record wastage" button lives in the
  shared tab-strip layout (`(tabs)/layout.tsx`) so it's reachable from all
  three views, gated client-side by the same `canWrite` check.

## Files

- `lib/actions/inventory.ts` — `recordWastage` (Server Action).
- `app/(dashboard)/inventory/(tabs)/layout.tsx` — shared `PageHeader` +
  tab strip + gated "Record wastage" button for the three read views.
- `app/(dashboard)/inventory/(tabs)/inventory-tabs.tsx` — client tab nav
  (`usePathname`-based active state).
- `app/(dashboard)/inventory/(tabs)/page.tsx` — Ledger.
- `app/(dashboard)/inventory/(tabs)/balance/page.tsx` — Stock Balance.
- `app/(dashboard)/inventory/(tabs)/rm-report/page.tsx`,
  `rm-report-filter.tsx`, `rm-report-export.tsx` — RM Report As On Date.
- `app/(dashboard)/inventory/wastage/new/page.tsx`,
  `app/(dashboard)/inventory/wastage/wastage-form.tsx` — Record wastage.

The three read views live under an `(tabs)` route group so they share one
layout/tab-strip without changing their URLs (`/inventory`,
`/inventory/balance`, `/inventory/rm-report`); `/inventory/wastage/new` sits
outside that group since it's a form, not a fourth tab.

## Baseline gaps this module closes

Per DESIGN.md §1 and §4.6, matching the second-pass requirements review:

1. **No current-balance / "stock on hand" view.** The baseline had no
   as-of-now stock screen at all (users summed the raw log by hand). The
   Stock Balance tab is new, built on the `stock_balance` view.
2. **No RM Report As On Date with export.** Present in the legacy system by
   name (PQTY/SQTY/QTY/Price/Total) but listed as "Not Yet Built" — no
   report and no export button existed. Now built against
   `purchase_lines.remaining_qty`, with a working `Export PDF` button.
3. **No wastage event type.** The baseline's ledger (where one existed at
   all) had no way to record shrinkage/spoilage as its own auditable event.
   `inventory_ledger.event_type` now includes `'wastage'`, written only via
   `record_wastage()`, and the Badge component already color-codes it red.

## Deviations / notes for review

- **`event_by` → display name is a second query, not a PostgREST embed.**
  `inventory_ledger.event_by` references `auth.users(id)`, and
  `profiles.id` also references `auth.users(id)` — but there is no FK from
  `inventory_ledger` to `profiles`, so `.select("...profiles(full_name)")`
  cannot be embedded directly. The Ledger page instead fetches distinct
  `event_by` ids and queries `profiles` separately, merging in JS. Flagging
  per the brief's "do that if straightforward, skip if it complicates the
  query" — this was straightforward enough to include.
- **Ledger is capped at the 1000 most recent events.** An unbounded
  "raw log" query against an append-only table that every other module
  writes to will only grow; `DataTable` paginates client-side but still has
  to receive the rows first. A footer note tells the user when the cap is
  hit. Worth revisiting with server-side pagination once the table has real
  volume — noted here rather than built now, to stay in scope.
- **RM Report "as of \<date\>" filters which batches are *included*
  (`created_at <= asOf`), not what each batch's PQTY/SQTY/QTY *were* on that
  date.** The schema has no historical/point-in-time snapshot of
  `remaining_qty` — it's a live generated column. So a date in the past
  shows exactly the batches received by then, but with **today's** current
  remaining quantities, not a reconstruction of stock as it stood back then.
  This matches the schema as given (no snapshot table exists) and is
  consistent with DESIGN.md's non-goals; flagging it explicitly since the
  report's name ("As On Date") could otherwise imply true historical
  point-in-time values. **Suggested follow-up** (not built, per the
  briefing — this is not a schema change I should make unilaterally): a
  periodic `stock_balance_snapshot` table if true historical
  reconstruction is ever required.
- **Schema gap: `record_wastage()`'s `p_reason` is accepted but never
  persisted.** Reading `0002_transactions.sql` closely:
  `record_wastage(p_item_id, p_purchase_line_id, p_quantity, p_unit,
  p_reason)` takes a reason, but its `insert into inventory_ledger` omits
  it — `inventory_ledger` has no `reason`/`notes` column at all. The Record
  Wastage form still requires and submits a reason (so the UI's contract
  with the user is honest, and so nothing needs to change if the column is
  added later), and `recordWastage()` always passes `p_reason` through, but
  **the reason is not currently retrievable from the ledger after
  submission.** Requesting, for the once-only follow-up migration: add
  `inventory_ledger.reason text` and have `record_wastage()` insert it. I
  did not add this myself, per the briefing's rule against a second
  `000N_*.sql` colliding with other agents' migrations.
- **Stock Balance is not filtered to `category = 'raw'`.** DESIGN.md calls
  it "the as-of-now equivalent of the legacy 'Raw Material Stock' screen",
  but the `stock_balance` view and the brief's own column list
  (`items(name, code, unit, low_stock_threshold)`) don't mention a category
  filter, and `items.category` now also covers `processed`/`packaging`
  stock that's equally useful to see on hand. Showing all active items
  (with a Category column) rather than narrowing to raw materials only —
  flagging in case Ravi wants it split or filtered on review.
- **Added `inventory` to `lib/constants/roles.ts`'s `MODULE_WRITE_ROLES`.**
  Every other module already had its own key there; `inventory` was the one
  missing entry. Not in the briefing's explicit no-touch list
  (`nav.ts`/migrations/`components/ui`/`components/shell`), so added it
  directly, mirroring the existing pattern and the RPC's own role list
  exactly — flagging in case this collides with another agent's edit to the
  same file.

## FB-0013 — Finished Product batch visibility (1 Sept 2026)

"Batch should be visible in inventory ledger." The ledger already showed a
raw-material batch (`Batch <n>`, via `purchase_lines.batch_number`) under
the Item column, but only for events tied to a purchase line — a
`finished_product` pull (MFR component consumption) or a `packaging` pull
has no `purchase_line_id` context of its own; its batch context is the
*Finished Product* batch, reachable only via `inventory_ledger`'s untyped
`reference_id` column (no real FK PostgREST can embed — see
`claude/known-issues.md`).

Rather than a schema change, `page.tsx` resolves it with two extra targeted
lookups, same pattern already used there for `event_by` → `profiles`
display names: `finished_product` rows' `reference_id` points straight at
`finished_product_batches.id`; `packaging` rows' `reference_id` points at
`packaging_issues.id`, one hop further to the batch via its own FK. Both are
merged into a `fpBatchNumber` field and shown as a second "FP batch <n>"
line under the Item column, alongside (not replacing) the existing
raw-material batch line — a single event can have both a RM batch (what was
consumed) and an FP batch (what it was consumed for).

## Searchable, legacy-aware pickers (1 Sept 2026)

`wastage-form.tsx`'s Item and Batch (purchase line) selects are searchable
comboboxes app-wide now (DESIGN.md §8); both mark `data-legacy` from
`item_code` / `batch_number`, already selected by
`app/(dashboard)/inventory/wastage/new/page.tsx` — no query changes
needed.

## Bug fix: row-cap truncation on Stock Balance and Wastage pickers (1 Sept 2026)

Same root cause as `docs/modules/purchase.md`'s "Bug fix" section, found
during the sweep it triggered: `inventory/(tabs)/balance/page.tsx`'s items
query and `inventory/wastage/new/page.tsx`'s item and purchase-line
queries had no row limit. Stock Balance ordered by `name` (not
`item_code`, so not as deterministically legacy-biased as the Purchase/MFR
pickers, but still capped once the item count grows past the server-side
default), and Wastage's batch dropdown ordered by `batch_number` ascending
— legacy batch numbers (`LEG-...`) sort first among ~92,000+ purchase
lines, so newly received batches could be silently excluded the same way
newly created items were. All three now order by `created_at descending`,
matching the FB-0006 precedent. **Display-order change, flagged for
review:** Stock Balance previously listed items alphabetically by name; it
now lists newest-created first (`StockBalanceTable`/`DataTable` render in
query order, no client-side re-sort).

## FB-0019: legacy-hide should also apply to the Inventory Ledger (2 Sept 2026)

"when legacy rows are hidden, legacy stock should not be visibile in the
ledger." The Ledger (`/inventory`, `InventoryLedgerTable`) had no
`isLegacy` predicate wired up at all — every other list in the app already
reads the shared "Hide legacy data" preference
(`lib/hooks/use-hide-legacy.ts`) via `DataTable`'s `isLegacy` prop, this
one was just missed. Fixed: a ledger event now counts as legacy if the
item it moved is a legacy code, or the batch involved (raw-material batch
via `purchase_lines.batch_number`, or Finished Product batch via the
existing FB-0013 `fpBatchNumber` lookup) is a legacy batch number. Same
one shared preference, no new toggle.

## FB-0018 (Purchase): Wastage's batch picker and the RM Stock report filtered to submitted purchase orders

`inventory/wastage/new/page.tsx`'s purchase-line picker and
`inventory/(tabs)/rm-report/page.tsx`'s "as of a date" export both now
require `purchase_orders.status = 'submitted'` — a still-draft PO's line
was never pushed to `inventory_ledger` (FB-0018,
`docs/modules/purchase.md`), so including it here would let wastage be
recorded against, or a stock report claim as on-hand, a batch that never
actually became stock. Stock Balance (ledger-derived via `stock_balance`)
and the Dashboard's low-stock/on-hand widgets needed no change — they were
already correct by construction, since a draft line simply has no ledger
rows to sum yet.

## QC Status column on the RM Report (3 Sept 2026)

Direct request from Ravi: "In inventory ledger, stock should clearly
suggest QC Pending, QC Passed, Awaiting Retest etc — New batch awaiting QC
should be QC Pending, QC Approved batch will be QC Approved and Batch
where Retest Date has come should be marked Awaiting Retest. Only QC
Approved batches can be used for making finished product."

Scoped with Ravi via `AskUserQuestion` before building: neither existing
per-something view was a clean fit for a per-*batch* QC status — the main
Ledger tab is per-*event* (the same batch appears on many push/pull rows),
Stock Balance is per-*item* (one item can have several batches in
different QC states at once, so a single status there would be
misleading). **"RM Report As On Date" is the one view that's already one
row per batch**, so the new "QC Status" column was added there, not to
the other two tabs (Ravi's explicit choice — not a leftover gap).

- **`lib/batch-qc-status.ts`** (new, shared) — `computeBatchQcState(qc_status,
  retest_date)` collapses `purchase_batch_status`'s `qc_status` (`'not_
  submitted' | 'submitted' | 'approved' | 'rejected'`) plus `retest_date`
  into one of four display states: `qc_pending` (no AR yet, or one
  submitted but not yet reviewed — both read as "not usable yet," matching
  the two states Ravi named together as "QC Pending"), `approved`,
  `awaiting_retest` (`qc_status = 'approved'` but `retest_date <= today` —
  same condition the QC list's "Due for retest" card already uses),
  `rejected`. `BATCH_QC_LABELS` maps each to its display string ("QC
  Pending" / "QC Approved" / "Awaiting Retest" / "QC Rejected").
- **`rm-report/page.tsx`** — two-step lookup against `purchase_batch_status`
  (same pattern as every other place in this app that reads that view),
  computes each row's `qcState`, passed through to both the on-screen
  table and the PDF export (new "QC Status" column in both).
- **Badge colors** (`components/ui/badge.tsx`): `qc_pending` reuses the
  neutral grey `not_submitted` already uses; `approved`/`rejected` reuse
  their existing colors; `awaiting_retest` gets the same amber as
  `submitted`/`pending` — this app's established convention for "a
  genuine attention/overdue signal," matching the QC list's "Due for
  retest" card.
- **Consequential fix, found while adding this column**: the RM Report's
  purchase-lines query had never actually been filtered to raw material
  despite its name — a Packaging Item purchase line (Seventh pass) would
  show up here too. Harmless before this column existed; with a QC Status
  column now added, every packaging batch would have shown as permanently
  "QC Pending" forever (packaging never goes through QC in this app),
  which is actively misleading rather than just incomplete. Fixed with
  the same `items!inner(..., category)` + `.eq("items.category", "raw")`
  filter already used on the QC/Labels/FP-compose pickers for the same
  reason.

## "Only QC Approved batches can be used for making finished product" — retest-due batches now blocked, not just labeled (3 Sept 2026)

The second half of the same request, confirmed with Ravi via
`AskUserQuestion` as a real enforcement change rather than just the label
above: previously, `check_batch_qc_approved()` (the DB trigger gating both
Finished Product composition and BMR weighment, `0001_init.sql`) only
checked `qc_status = 'approved'` — it never looked at `retest_date`, so a
batch sitting in "Awaiting Retest" was still silently fully consumable.

- **`0026_qc_retest_consumption_gate.sql`** — extends
  `check_batch_qc_approved()` to also reject when `retest_date is not null
  and retest_date <= current_date`, with its own distinct exception
  message. `trg_fp_component_qc_gate` (`finished_product_components`) and
  `trg_bmr_weighment_qc_gate` (`bmr_weighment_lines`) both already point at
  this one function by name, so a single `create or replace` closes the
  gap identically for Finished Product composition and BMR weighment —
  no trigger definitions needed to change.
- **UI-side candidate filtering** (defense in depth, not the real
  enforcement): `finished-product/new/compose/page.tsx`'s
  `getCandidateBatches()` and `bmr/[id]/page.tsx`'s approved-batch lookup
  both now also fetch `retest_date` and exclude a batch once it's due,
  the same condition the migration enforces — so the picker never *offers*
  a batch the insert would reject with a raw DB error; the DB trigger
  remains the actual authority either way.

See `docs/modules/qc.md`, "Retest workflow," for how `retest_date` itself
gets computed, and `docs/modules/finished-product.md` /
`docs/modules/bmr.md` for the consuming side of this change.

Verification: `npx tsc --noEmit`, `npx eslint` on every touched file, and
`npx next build` (all 42 routes) all clean.
