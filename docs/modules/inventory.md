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

## Inventory Ledger redesign, Phase 1: QC/Stability/R&D sample double-count fix (3 Sept 2026)

Ravi: "help me think and re-design inventory page Ledger page... Raw
Material Items available for creating finished product batch would be
purchase - QC Sample - R&D Sample - Stability Sample - Wastage." Digging
into the current ledger mechanics to answer that turned up three real
data-integrity gaps, written up in full in the Invento project doc
`claude/inventory-ledger-redesign.md` (ledger mechanics, all three gaps,
design options, and the scope decisions below, each confirmed with Ravi
via `AskUserQuestion`). This entry covers Phase 1 of 4 — the one gap that
was silently corrupting `stock_balance` today, not just a UI/reporting
limitation like the other two (Phase 2: live per-batch remaining qty;
Phase 3: Finished Product as a real, ledger-tracked item; Phase 4: the
Ledger/Stock Position UI redesign itself — none built yet).

**The bug.** The real push path is `submit_purchase_order()`
(`0019_purchase_submit_workflow.sql`) — **not**
`trg_fn_purchase_line_push()`/`trg_purchase_line_push`
(`0002_transactions.sql`): 0019 explicitly dropped that trigger ("Stop
pushing to inventory the instant a line is inserted... The function is
left in place (unused) rather than dropped") once Purchase got its
draft/submit workflow, and nothing has called it since. An early draft of
this fix edited the dead trigger function instead — it would have shipped
looking correct while changing nothing for a real purchase. Caught by
actually replaying every migration (0001→0028) against a scratch local
Postgres 16, seeding real rows, and calling the real RPCs
(`submit_purchase_order`/`reopen_purchase_order`, a `quality_checks`
insert, two retests) rather than trusting inspection alone — see
"Verification" below.

`submit_purchase_order()` pushes `remaining_qty` (quantity already net of
`qc_qty`/`stability_qty`/`rnd_qty`) once per line, at submit, excluding
the sample amounts from stock from submission onward.
`trg_fn_qc_sample_pull()` then pulls that same amount a second time
whenever a `quality_checks` row is created against the batch — once at
initial QC assignment (`sample_qty` defaults from `qc_qty`) and again at
*every* retest (`sample_qty = stability_qty`, per
`0025_qc_retest_workflow.sql`'s own note that no trigger change was
needed for retests to fire it — that note is exactly why this compounds).
Net effect on `stock_balance`: `qc_qty` double-subtracted as soon as QC
happens once; `stability_qty` double-subtracted, and then subtracted
again per additional retest. `rnd_qty` has the opposite gap — excluded at
submit, never pulled anywhere, so it never appears on the ledger at all.

**The fix — `0028_ledger_sample_pull_fix.sql`.**

- Reservation now happens once, at submit: `submit_purchase_order()`
  pushes the FULL `quantity` of every line it submits (was
  `remaining_qty`), then inserts three separately labeled `pull` events
  in the same transaction for `qc_qty`/`stability_qty`/`rnd_qty` (each
  only if > 0), tagged with new `reference_type` values
  `qc_sample`/`stability_sample`/`rnd_sample` (widened onto the existing
  check constraint — `qc` is kept, not replaced, so the historical rows
  the old trigger already wrote stay exactly as they are; the ledger is
  append-only and never edited, same principle as 0020's
  compensating-entry approach).
- `reopen_purchase_order()` now reverses those three new pulls too (a
  compensating `push` of whatever was pulled, read back from the ledger
  row itself, same as its existing purchase-push reversal), not just the
  purchase push — otherwise a reopen-then-resubmit would re-pull the
  sample amounts a second time, since resubmit re-runs for any line
  `reopen_purchase_order()` clears `pushed_at` on. A pre-existing,
  old-style `qc`-tagged pull (a real QC/retest event that already
  happened) is deliberately left alone by Reopen either way — that
  represents actual lab consumption, not a provisional reservation, and
  reopening the purchase record was never meant to un-sample it.
- `trg_fn_qc_sample_pull()` is retired to a no-op. QC/retest record
  creation no longer moves stock at all — the reservation already
  happened at submit. The dead trigger function itself
  (`trg_fn_purchase_line_push`) is left exactly as 0019 left it —
  untouched, unused, on purpose.
- An idempotent backfill (`do $$ ... $$` block, active AND already-
  submitted lines only — a still-draft line has no stock effect at all
  today, FB-0018, and must stay that way) recomputes each purchase
  line's actual current ledger state fresh on every run and inserts only
  the gap needed to reach the corrected target: a compensating push to
  bring the *net* push (push minus pull, not a raw sum — a line that's
  been reopened/resubmitted, old-style or new, already has offsetting
  rows a raw sum would double-count) up to the full `quantity` (plus, for
  a batch that went through more than one old-style retest, an extra
  compensating push for every over-pull beyond the first `stability_qty`
  — the second half of the same bug), and a labeled sample pull for
  `qc_qty`/`stability_qty`/`rnd_qty` only where one isn't already
  reserved — checking for EITHER an old-style `qc`-tagged pull (a real
  QC/retest event) OR a new-style `qc_sample`/`stability_sample` pull
  already on the ledger (this line already went through the fixed
  `submit_purchase_order()`, or a prior run of this same backfill).
  Verified safe to run more than once: a second run computes zero gap
  everywhere and inserts nothing.
- `InventoryLedgerTable`'s Reference column previously rendered the raw
  `reference_type` string through `className="capitalize"` (fine for
  single words like "Purchase"/"Packaging", but would have shown the new
  values as "Qc_sample" etc.) — replaced with an explicit
  `REFERENCE_TYPE_LABELS` map ("QC Sample" / "Stability Sample" / "R&D
  Sample" / etc.) so this ships legible, not just functional.

**Scope decisions, all confirmed with Ravi via `AskUserQuestion` before
building:** fix the double-count now rather than defer it (this phase);
Finished Product tracking (Phase 3) will make finished products real,
ledger-tracked `items` rather than just summing `packaged_qty` directly,
with stock available "at QC approval" rather than "at packaging", and
nothing consuming/dispatching FP stock yet (no such flow exists in the
app today); per-batch remaining quantity (Phase 2) will be a maintained
column kept current by a trigger, not computed on read.

Verification: `npx tsc --noEmit`, `npx eslint` on every touched file, and
`npx next build` (all 42 routes), all clean — plus, for the migration
itself, something none of the earlier migrations this session had done:
replaying all 28 migrations end to end against a scratch local Postgres
16 (a minimal `auth` schema shim for `auth.users`/`auth.uid()`, since this
schema is normally Supabase-managed), then exercising the real RPCs
against seeded data — `submit_purchase_order`, a `quality_checks` insert,
two retests, `reopen_purchase_order`, resubmit, and the backfill block
run twice — checking `stock_balance.on_hand` at every step. That's what
caught both real bugs described above (the dead-trigger mistake and the
backfill's double-insert-on-rerun bug) before either shipped; a
`next build` pass alone would have caught neither, since both are pure
SQL/data-flow issues with no TypeScript surface.

## Inventory Ledger redesign, Phase 2: live per-batch remaining quantity (3 Sept 2026)

Second of four phases scoped in `claude/inventory-ledger-redesign.md`
(Gap 2). `purchase_lines.remaining_qty` is a Postgres GENERATED column
(`quantity - qc_qty - stability_qty - rnd_qty`) — static, fixed at
purchase time. It never decreased when that specific batch was later
consumed by a `finished_product_components` insert, or had wastage
recorded against it — the Purchase Lines table, the FP compose picker,
RM Report As On Date, the Wastage batch dropdown, and the Purchase
Register report all displayed this frozen figure as if it were live
"what's left in this batch." Most consequentially: the FP compose
picker's "X avail." hint could describe a batch that had already been
mostly or fully consumed, and nothing at the DB level stopped composing
more than a batch actually had left.

**The fix — `0029_purchase_line_live_remaining_qty.sql`.** A new
`purchase_lines.live_remaining_qty` column, maintained by triggers rather
than computed on read (Ravi's confirmed choice over the originally
recommended computed-on-read approach):

- Starts at the same base `remaining_qty` already computes, set by a
  `BEFORE INSERT` trigger (the generated column itself isn't readable yet
  at `BEFORE`-trigger time, so the same formula is computed directly from
  `new.quantity`/`qc_qty`/`stability_qty`/`rnd_qty`).
- Decremented by a `finished_product_components` insert against that
  `purchase_line_id` (new `AFTER INSERT` trigger, `SECURITY DEFINER` —
  the finished-product write role isn't necessarily granted `UPDATE` on
  `purchase_lines` directly).
- Decremented by `record_wastage()` when a batch is specified — a
  follow-up scope question this design surfaced and confirmed with Ravi
  via `AskUserQuestion`: batch-tied wastage counts as consumption here
  too, matching his original formula ("available raw material = purchase
  − QC sample − R&D sample − stability sample − wastage"), not just FP
  composition.
- Also handles a draft line being edited before Final Submit
  (`updatePurchaseLine`, still possible right up to submit) — the same
  trigger fires on `UPDATE OF quantity, qc_qty, stability_qty, rnd_qty`
  too, recomputing the new base figure while *preserving* whatever's
  already been consumed (always zero for an ordinary draft edit, since
  nothing can be pushed/consumed before submit — FB-0018 — but this also
  covers the rarer System-Admin-reopens-then-edits-then-resubmits path
  without silently erasing real consumption history from before the
  reopen).
- A `not valid` check constraint (`live_remaining_not_negative`, same
  idiom as `0016_quantity_check_constraints.sql`) makes this a real
  DB-level guard going forward — an FP composition or a wastage record
  that would drive a batch's live remaining below zero is now rejected
  outright, where previously nothing enforced this at all.
  `createFinishedProductBatch`/`recordWastage` (`lib/actions/
  finished-product.ts`/`lib/actions/inventory.ts`) both translate that
  specific constraint-violation message into a plain-language form error.
- An idempotent-by-construction backfill (a single `update`, not a loop —
  simpler than Phase 1's because there's no legacy double-counting to
  reconcile here, just one figure to compute correctly from scratch) sets
  every existing line's starting value from the same components: base
  remaining minus its actual `finished_product_components` consumption
  minus its actual recorded wastage, both summed fresh from the ledger.

**Read sites switched from `remaining_qty` to `live_remaining_qty`:**
the FP compose picker (`getCandidateBatches()` — also now filters out a
batch already at zero remaining, not just offering it with "0 avail.");
the Wastage form's batch dropdown; RM Report As On Date's QTY (and
derived Total) column; the Purchase Register report's Remaining Qty
column. The Purchase Lines table (`purchase/[id]`) keeps its existing
"of which X remaining after QC/Stability/R&D" subline as-is (that's a
receipt-time fact, not meant to be live) and adds a second subline — "X
remaining now (after production/wastage)" — only when it actually
differs, so a batch with no consumption yet doesn't show two identical
numbers.

Verified the same way as Phase 1: replayed all 29 migrations against a
scratch local Postgres, then exercised the real flow end to end —
insert a draft line, edit it (confirming the update trigger recomputes
correctly), submit, QC-approve, consume part of it via a real
`finished_product_components` insert, record wastage against the same
batch, and confirm `live_remaining_qty` matched hand-computed
expectations at every step, matched `stock_balance.on_hand`, and that
attempting to over-consume (both via FP composition and via
`record_wastage()`) was correctly rejected by the new check constraint
with the transaction fully rolled back. Separately verified the backfill
against data seeded *before* migration 0029 ran (a submitted line with
real pre-existing FP consumption and wastage), confirming it computed the
correct starting value from scratch. `npx tsc --noEmit`, `npx eslint` on
every touched file, and `npx next build` (all 42 routes) all clean.

## Inventory Ledger redesign, Phase 3: Finished Product as a real, ledger-tracked item (3 Sept 2026)

Third of four phases scoped in `claude/inventory-ledger-redesign.md`
(Gap 3). Scoped via `AskUserQuestion`: "available finished product"
should be Full — real items on the same ledger raw material and
packaging already use, not just summing `packaged_qty` — with stock
becoming available *at QC approval*, not at packaging, and (confirmed)
nothing yet consumes or dispatches FP stock, so no consumption side was
built.

**Most of the "real item" infrastructure already existed.** Every MFR
already gets its own `items` row (`category = 'processed'`, an
FP-00001-style code) via `mfr_definitions.finished_product_item_id`,
added by `0010_mfr_finished_product_link.sql` and created automatically
by `createMfrDefinition()`. What was actually missing: nothing ever
pushed to `inventory_ledger` when a batch was produced and approved.

**The fix — `0030_finished_product_ledger.sql`.** A trigger on
`quality_checks`, `AFTER UPDATE`, scoped to the Finished-Product-batch
transition (`new.finished_product_batch_id is not null and old.status =
'submitted' and new.status in ('approved', 'rejected')`) —
`reviewQualityCheck()` (`lib/actions/qc.ts`) is the one place that
transition ever happens, for both raw-material and FP batches alike
(`qc_one_subject` guarantees exactly one of `purchase_line_id`/
`finished_product_batch_id` is set per row). `SECURITY DEFINER`, because
the QC-review write role (`system_admin, quality_checker, qc_reviewer`)
and the finished-product write role (`system_admin, mfr_manager,
inventory_manager`) don't overlap for non-admins — confirmed by an
RLS-enforced test (a `qc_reviewer`-only user, no FP role, real
`row_security = on`) that a QC reviewer approving a batch correctly
still pushes the ledger rows despite lacking `UPDATE` on
`finished_product_batches` or `INSERT` on `inventory_ledger` directly.

On approval, the trigger pushes the full `batch_yield` ("how much
Finished Product has been created," entered at Complete Batch —
`0022_fp_batch_yield.sql`) as a new `fp_yield` reference_type (distinct
from `finished_product`, which already means something else — RM pulled
*for* FP composition), then pulls `qc_sample_qty`/`stability_qty`/
`rnd_qty` (captured the same screen) as `qc_sample`/`stability_sample`/
`rnd_sample` — reusing Phase 1's reference_type values as-is, since a QC
sample is a QC sample whether it came from a purchase batch or a
production batch. On rejection, no ledger rows are pushed at all.

**A second, previously-flagged gap closed by the same hook:**
`lib/finished-product-status.ts` had carried a comment since it was
written that `finished_product_batches.status` should really be
DB-trigger-synced from `quality_checks` rather than computed at read
time. The same trigger now does that sync unconditionally (both branches
of the `WHEN` — approved or rejected), before the ledger-specific logic
even runs. `resolveDisplayStatus()`/`latestQcByBatch()` are left in place
as harmless defense-in-depth (comment updated to say so) rather than
ripped out across every caller — for any batch touched after 0030, the
two now agree by construction.

**Graceful, not blocking, in two cases** neither of which should ever
happen via the app but the trigger doesn't assume it's the only caller:
an MFR whose `finished_product_item_id` is null (a legacy row predating
0010) skips the ledger push but still syncs status; a null or zero
`batch_yield` does the same. Neither raises an error — a QC reviewer is
never blocked from approving a real batch by a data gap on its recipe.

**A new `fp_batch_yield_not_negative` check constraint** (`not valid`,
same idiom as Phase 2's `live_remaining_not_negative`) rejects a
`batch_yield`/sample-quantity combination where the three samples exceed
the yield — nothing enforced this for Finished Product before.
`completeFinishedProductBatch()` (`lib/actions/finished-product.ts`, the
one screen where all four values are set together) translates it into a
plain-language form error.

**FB-0013 extended** (`app/(dashboard)/inventory/(tabs)/page.tsx`) to
resolve FP batch context for the new rows: `fp_yield` always points
straight at `finished_product_batches.id`, same shape as
`finished_product`. `qc_sample`/`stability_sample`/`rnd_sample` are
trickier, since Phase 1 already uses those exact reference_type values
for purchase-line-context pulls — a bare reference_type check can't tell
the two apart. Disambiguated using the real `purchase_line_id` column
(embedded as `purchase_lines`): Phase 3's trigger never sets it, so an
FP-context sample row always has `purchase_lines === null` while an
RM-context one always has it populated. `REFERENCE_TYPE_LABELS`
(`inventory-ledger-table.tsx`) gained an `fp_yield` → "FP Batch Yield"
entry.

Verified the same way as Phases 1 and 2: replayed all 30 migrations
against a scratch local Postgres, then exercised the real flow —
approve an FP batch's QC record and confirm exactly the expected four
`inventory_ledger` rows, `finished_product_batches.status` synced to
`approved`, and `stock_balance.on_hand` matching `batch_yield -
qc_sample_qty - stability_qty - rnd_qty` exactly. Separately verified:
rejection (status syncs, zero ledger rows); both graceful-skip paths
(unlinked MFR, null batch_yield — status still syncs, no error, no
push); the backfill against data seeded to look pre-existing (trigger
disabled, then the backfill block run by hand) correctly syncing status
and pushing the four rows; backfill idempotency on a second run (no
duplicates); the new check constraint correctly rejecting an
over-sampled update; and the RLS/`SECURITY DEFINER` boundary described
above. `npx tsc --noEmit`, `npx eslint` on every touched file, and `npx
next build` (all 42 routes, no new routes added) all clean.

## Inventory Ledger redesign, Phase 4: Stock Position, running balance, ledger filters, per-item detail (3 Sept 2026)

Fourth and last phase scoped in `claude/inventory-ledger-redesign.md`
Part 3. Scoped via `AskUserQuestion`, all three answered with the
recommended option: the Stock Position breakdown covers all three item
categories (raw material, packaging, Finished Product) in one unified
table rather than raw material only; the per-item drill-down page
(Part 3 Option C) ships in this same phase rather than a later one; and
the Ledger tab's running-balance column and item/date/reason filters
(Part 3 Option A) ship in this same phase too. Net effect: this phase
folds Part 3's B + C + A options together into one shipped release,
exactly as that section's "Recommendation" anticipated.

**`0031_stock_position.sql` — two new views, no destructive change.**
`item_position` is a generic, category-agnostic breakdown: a `left join`
from `items` to `inventory_ledger` (so a never-touched item still gets an
all-zero row, confirmed for a fresh item with zero ledger activity) with
eight `case`-summed columns — `received` (push/purchase), `yielded`
(push/fp_yield), `held_qc`/`held_stability`/`held_rnd` (pull/{qc or
qc_sample}, pull/stability_sample, pull/rnd_sample), `consumed_by_fp`
(pull/finished_product), `issued_packaging` (pull/packaging), `wastage`
(any row with `event_type = 'wastage'`, regardless of reference_type),
and `on_hand` — computed with the *exact same* expression
`stock_balance.on_hand` already uses, so the two views can never
disagree. Confirmed every one of the eight `reference_type` values ever
written across all 31 migrations lands in exactly one bucket, in exactly
one of the push/pull dimensions, with none left uncounted.

`inventory_ledger_with_balance` adds a per-item running balance to every
ledger row: `sum(...) over (partition by item_id order by event_at, seq
rows between unbounded preceding and current row)`. Building it surfaced
a real bug before it ever reached the UI: the first version ordered by
`(event_at, id)`, using the row's random UUID as a same-instant
tiebreaker, which a seeded `submit_purchase_order()` call (a push and
three sample pulls, all at the identical transaction timestamp) showed
can sort a pull before its own push — the running balance briefly went
negative. Root cause: a UUID has no relationship to real insertion
order. Fix: a new `inventory_ledger.seq bigint generated always as
identity` column, and the window ordered by `(event_at, seq)` instead —
re-verified monotonic (100 → 95 → 92 → 90 → 70 → 68 in the original
repro) with the fix in place.

**Stock Position (`/inventory/balance`, still the same URL — only the
tab label changed to "Stock Position").** Replaces the old
`stock_balance`-only table with one querying `item_position` for all
three categories at once. Rather than eight sparse raw-number columns,
a single category-conditional "Breakdown" subline (e.g. raw material:
"Received X · QC Y · Stability Z · R&D W · FP use U · Wastage V", each
clause shown only when non-zero) — the same "primary figure + compact
explanatory subline" convention already used by Purchase Lines'
live-remaining subline and the Ledger's FP-batch-context subline. Item
name links to the new per-item detail page.

**Ledger tab upgrades (`/inventory`).** A new "Running balance" column
reads `inventory_ledger_with_balance.running_balance` instead of the
base table. Real server-side filters (item, reason/reference_type, date
range) replace what had been client-side-only text search — the same
row-cap-truncation lesson already documented in `known-issues.md`:
filtering an already-capped 1,000-row result client-side can silently
hide a match that never made the page. Filters are a plain GET form
(`ledger-filters.tsx`), same auto-submit-on-change pattern as
`rm-report-filter.tsx`, so the URL stays shareable/bookmarkable. The
item picker's own query is capped at 5,000 (current item count is
~2,200) rather than left unbounded, for the same reason.

**Per-item detail page (`/inventory/items/[id]`, new route — distinct
from the existing Item Master edit page at `/items/[id]`).** Full-width
version of the Position breakdown (`ItemPositionSummary`, one stat tile
per applicable `item_position` column, category-scoped) plus a
category-conditional batch list — `PurchaseBatchesTable` (raw material
and packaging, from `purchase_lines`, QC status column shown for raw
material only) or `FpBatchesTable` (Finished Product, from
`finished_product_batches` via `mfr_definitions.finished_product_item_id`)
— and an embedded, item-scoped ledger (capped at 500 rows, same
`enrichLedgerRows()` helper the main Ledger tab uses). The RM/Packaging
batch list reuses the RM Report's established two-step
`purchase_batch_status` lookup (no direct FK for PostgREST to embed
through).

**`lib/ledger-enrich.ts`** — the `event_by` name resolution and FB-0013
FP-batch-context resolution, previously inline in the Ledger tab's
`page.tsx`, factored out so the new per-item ledger reuses the identical
logic rather than a second copy that could drift.

Verified the same way as Phases 1–3: replayed all 31 migrations against
a scratch local Postgres, then seeded a realistic cross-category
scenario through real RPCs and trigger paths (a submitted purchase order
with a raw-material and a packaging line, batch-tied wastage, an FP
batch taken through QC approval, a packaging issuance against that FP
batch) and confirmed `item_position` for all three items matched
hand-computed expectations exactly and reconciled with `stock_balance`;
confirmed a zero-activity item still returns one all-zero row;
confirmed `inventory_ledger_with_balance`'s running balance was
monotonic for every item; and ran the actual page.tsx query shapes
(the `item_position` single-row lookup, the `purchase_lines` +
`purchase_batch_status` two-step, the `finished_product_batches` via
`mfr_definitions` lookup, the scoped `inventory_ledger_with_balance`
query) directly against the seeded data, all matching. `npx tsc
--noEmit`, `npx eslint` on every touched/new file, and `npx next build`
(new `/inventory/items/[id]` dynamic route added, all routes compiling)
all clean.

**A real bug found during live verification against production, not
caught by the local-Postgres check above.** Stock Position showed
"A. Jatamansi Tail" (FP-00001) at 0 with an all-zero breakdown, while its
own per-item detail page — querying `item_position` scoped to that one
`item_id` — correctly showed 58.5 yielded / 58.2 available, the same
number Phase 3's live verification already confirmed. Root cause: exactly
the row-cap-truncation bug class in `claude/known-issues.md`, but with a
new wrinkle. `balance/page.tsx` joins two separate queries (`items`,
`item_position`) client-side by `item_id`; with ~2,200+ active items on
file, Supabase's server-side row cap (1,000) truncated each
independently, and since `item_position` has no inherent order, an item
well inside `items`' page could fall outside `item_position`'s
differently-ordered page and render as all-zero rather than missing
outright. **A first fix (`.limit(5000)` on both queries) shipped and was
confirmed live NOT to work** — Supabase/PostgREST's max-rows cap can't be
raised by a client-side `.limit()`/`.range()` above the server's own
configured max; it's silently capped back down regardless. The real fix
is genuine pagination: new `lib/supabase/fetch-all.ts` (`fetchAllRows`)
repeats the query in `.range()` windows no wider than the server max,
concatenating pages until a short page signals the end — the only way to
get more than the cap in one logical fetch. `item_position` gained an
explicit `.order("item_id")` since `.range()` pagination needs a
deterministic order to be valid. Verified with an isolated logic test
(a mocked data source hard-capping every request at 1,000 rows,
reproducing the exact live failure) confirming `fetchAllRows` retrieves
all rows of a 2,317-row scenario exactly once each, in order — the actual
server cap can't be reproduced locally, since local Postgres has no
PostgREST layer in front of it. See `claude/known-issues.md`'s Twelfth
pass for the full incident writeup, including the still-open finding that
other list pages (`/items`, confirmed; the RM Stock report, likely) have
the same latent truncation from their own earlier ordering-only fix.
