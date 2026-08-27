# Module 9 — Finished Product

Cross-reference: `docs/DESIGN.md` §4.8 (schema), §7.3 (FIFO suggestion),
§7.2 (QC-gates-consumption, DB-enforced), §6 (route map).

## Role

Write (`finished_product` in `MODULE_WRITE_ROLES`): `system_admin`,
`mfr_manager`, `inventory_manager` — mirrors `fp_write` / `fp_comp_write` in
`0001_init.sql`. See **RLS gap** below for one place this role set is
*wider* than what a downstream insert actually allows.

## Screens

- **List** — `/finished-product`. `DataTable`: batch number (links to
  detail), MFR name, **status** (see "Displayed status" below), target
  qty/unit, actual yield %, finish date.
- **New, step 1** — `/finished-product/new`. Plain fields: MFR dropdown
  (fetched with code/name/version/batch size), target quantity, unit,
  expiry date. Selecting an MFR fills the unit field from that MFR's
  standard batch-size unit (editable) and shows its name + **locks the MFR
  version being used right now** into a hidden field — this step does no DB
  writes, it's a plain `GET` form handing everything to step 2 via the query
  string.
- **New, step 2 — "Calculate composition"** — `/finished-product/new/compose`.
  Server Component: loads the MFR's recipe lines *at the version locked in
  step 1*, scales each line's quantity by `target_qty / batch_size_qty`, and
  for each ingredient queries candidate RM batches (see FIFO section below).
  Renders one row per ingredient with the computed quantity and a batch
  picker **pre-selected to the FIFO candidate**, overridable. Submitting
  calls `createFinishedProductBatch`, which inserts the
  `finished_product_batches` header (status `in_process`) and then all
  `finished_product_components` rows in a single bulk insert.
- **Detail** — `/finished-product/[id]`. Header, composition table (item,
  RM batch consumed, expiry, quantity), the linked QC record if one exists,
  a **Complete batch** form (yield/wastage fields, shown while
  `status = 'in_process'`), and a **Submit to QC** button (same condition).

## FIFO default — the gap fix

`getCandidateBatches` (in the compose page) implements DESIGN.md §7.3
directly against the named views rather than PostgREST FK-embedding
(`purchase_batch_status` is a view with no FK for PostgREST to auto-detect):
for the ingredient's `item_id`, fetch its `purchase_lines`, cross-reference
`purchase_batch_status.qc_status = 'approved'`, and require
`stock_balance.on_hand > 0` for that item — then sort by `expiry_date asc,
created_at asc` and pre-select the first result. The user can still pick a
different batch from the dropdown; the default is no longer the old
baseline's unordered list.

One inherited simplification, faithful to the design spec as written:
`stock_balance.on_hand` is per **item**, not per batch, so a specific batch
that is itself fully consumed can still appear as a candidate as long as the
item has stock elsewhere. This matches DESIGN.md §7.3's query exactly; a
tighter check would compare against that batch's own `remaining_qty` net of
ledger pulls specific to it.

## QC gate — DB-enforced, not a UI guard

`finished_product_components` has a `before insert` trigger
(`trg_fp_component_qc_gate` / `check_batch_qc_approved()`,
`0002_transactions.sql`) that raises a Postgres exception for any
`purchase_line_id` that isn't currently QC-Approved. `createFinishedProductBatch`
catches that exception and returns *"That batch is no longer QC-Approved —
refresh and pick another."* as a normal form error — a real rejection here
is expected behavior (a stale compose page, or the batch got consumed/QC
statused between page load and submit), not a crash. If the components
insert fails for any reason, the just-created batch header row is deleted
so a failed submission never leaves an orphaned, component-free FP batch
behind.

## Yield/wastage fields — the gap fix

The old baseline's "Creation Finish Good" screen had a single bare Quantity
field. The **Complete batch** form on the detail page now collects the full
legacy field set: `wt_total_rm`, `wastage`, `total_units`, `net_qty`,
`finish_date`, `expiry_month`, `qc_sample_qty`. `net_weight` and
`actual_yield_pct` are Postgres **generated** columns
(`wt_total_rm - wastage`, and yield % from those two) — the form never
computes them; they're simply displayed after the save round-trips.

## Status flow — the corrected finding

`in_process → submitted_to_qc → approved/rejected`. The first draft of the
requirements review wrongly said the legacy system doesn't gate FP release
on QC approval; the corrected finding is that it does (a "Finish Product
Intimation Slip" to QC), and this module implements that gate:

- **Submit to QC** (`submitFinishedProductToQc`): requires `wt_total_rm` and
  `finish_date` to already be filled in (i.e., the batch has been
  "completed"), gets a fresh AR number via `get_next_ar_number()`, inserts a
  `quality_checks` row with `finished_product_batch_id` set (same table QC
  uses for RM batches, `purchase_line_id` left null), then flips
  `finished_product_batches.status` to `submitted_to_qc`.
- The **existing QC Review screen** (`/qc/[id]`, another module) is where a
  reviewer actually sets that `quality_checks` row's status to
  `approved`/`rejected` — this module does not rebuild that UI.

### Displayed status — application-level sync (no new migration)

The brief calls for `finished_product_batches.status` to reflect the QC
verdict once one exists, but this pass may not add migrations, so there is
**no DB trigger** syncing it. Instead, everywhere status is shown (list page
and detail page) the app computes a *displayed* status
(`lib/finished-product-status.ts: resolveDisplayStatus`): if a
`quality_checks` row exists for this batch and its status is `approved` or
`rejected`, show that; otherwise fall back to the batch's own `status`
column. The underlying `finished_product_batches.status` column itself is
therefore **not** authoritative post-QC-submission — it stays
`submitted_to_qc` in the database even after approval/rejection, and only
the read-time join makes the UI correct.

**Follow-up for a later migration:** a trigger on `quality_checks` (`after
update of status`) that, when `finished_product_batch_id` is set and the new
status is `approved`/`rejected`, writes that status onto
`finished_product_batches.status` — mirroring `check_batch_qc_approved()`'s
pattern of doing this kind of sync in the database rather than in every
reader. Once added, `resolveDisplayStatus` becomes redundant but harmless.

### RLS gap found while building this (flag for reconciliation)

`MODULE_WRITE_ROLES.finished_product` is `[system_admin, mfr_manager,
inventory_manager]`, matching `fp_write`/`fp_comp_write`'s RLS policies —
so an `mfr_manager` can create and manage FP batches. But **Submit to QC**
also inserts into `quality_checks`, whose `qc_insert` RLS policy only allows
`[system_admin, inventory_manager, quality_checker, qc_reviewer]` —
`mfr_manager` is not in that list. An `mfr_manager`-only user can therefore
do everything on this module except click Submit to QC; that one insert
fails RLS (Postgres `42501`), which `submitFinishedProductToQc` catches and
surfaces as: *"Your role can manage this batch but current access rules
don't let it create the QC record — ask an Inventory Manager, Quality
Checker, QC Reviewer, or System Admin to submit this batch to QC."* This is
a real mismatch between the module's intended role set and the existing
`quality_checks` RLS policy in `0001_init.sql` (not something this pass is
allowed to edit) — recommend adding `mfr_manager` to `qc_insert` in a
follow-up migration if `mfr_manager` is meant to be able to submit FP
batches to QC end-to-end.

## Files

- `lib/actions/finished-product.ts` — `createFinishedProductBatch`,
  `completeFinishedProductBatch`, `submitFinishedProductToQc`.
- `lib/finished-product-status.ts` — `resolveDisplayStatus`,
  `latestQcByBatch` (shared by list + detail).
- `app/(dashboard)/finished-product/page.tsx` — list.
- `app/(dashboard)/finished-product/new/page.tsx` + `step1-form.tsx`.
- `app/(dashboard)/finished-product/new/compose/page.tsx` (FIFO candidate
  lookup + scaling) + `compose-form.tsx`.
- `app/(dashboard)/finished-product/[id]/page.tsx`,
  `complete-batch-form.tsx`, `submit-to-qc-form.tsx`.
