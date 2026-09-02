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
`stock_balance.on_hand > 0` for that item — then sort by `created_at asc`
and pre-select the first result. The user can still pick a different
batch from the dropdown; the default is no longer the old baseline's
unordered list.

**Sort key changed 3 Sept 2026** from `expiry_date asc, created_at asc`
to `created_at asc` alone: `purchase_lines.expiry_date` ("Re-Test Date"
on the Purchase screen) is no longer collected at all as of this date
(`docs/modules/purchase.md`, "Re-Test Date manual entry removed") — every
batch received going forward has `expiry_date = null`, and the old sort
(JS string-compare, `null` coerced to `""`) would have put every new,
undated batch *first*, inverting FIFO into "always pick the newest
batch." Sorting by `created_at` alone is also the more literally correct
definition of FIFO regardless (first *in*, not soonest-to-expire) — this
isn't a workaround, it's the fix. The candidate dropdown still displays
each batch's `re-test <date>` (`compose-form.tsx`) when one exists on
file; it just no longer drives the default selection.

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

**Partially superseded 2 Sept 2026 — see "Wastage / Total units / Net
quantity removed" below.** `wastage`, `total_units`, and `net_qty` are no
longer fields on this form; `wt_total_rm`, `finish_date`, `expiry_month`,
and `qc_sample_qty` (now alongside Stability/R&D, see above) are still
here exactly as described.

## Wastage / Total units / Net quantity removed from Complete Batch (2 Sept 2026)

Per direct request (screenshot of the Complete Batch form with Wastage,
Total units, and Net quantity highlighted): those three fields are removed
from `complete-batch-form.tsx`. `Total weight of RM used` stays — it's
still the only input `net_weight`/`actual_yield_pct` are generated from.

Same non-destructive-edit fix as `updateItem()` (see "Sampling & stock
defaults removed" above): `completeFinishedProductBatch()` no longer reads
or writes `wastage`/`total_units`/`net_qty` at all, rather than reading
empty values from a form that no longer sends them. This mattered more
here than it did for Item Master — `wastage` used to default to `0` when
its field was empty (`wastage ? Number(wastage) : 0`), so leaving that
read/write path in place would have actively zeroed out every batch's
`wastage` (and thus visibly changed its generated `net_weight`) on its
very next save, not just silently dropped a value. Existing batches that
already have these three fields set keep them untouched; the columns
themselves and `net_weight`/`actual_yield_pct`'s generated-column
definition are unchanged — no migration.

One consequence worth flagging: since `wastage` can no longer be entered
anywhere on this screen, a batch completed after this change has
`net_weight` always equal to `wt_total_rm` (wastage stays whatever it
was — `null` for a new batch) unless something else sets `wastage` later.
If wastage still needs recording somewhere, that's a separate, open
question — not guessed at here, same reasoning as the Finished Product
Stability/R&D gap flagged above before it was scoped out with you
directly.

**Fully superseded 2 Sept 2026 — see "Batch Yield replaces Total weight of
RM used" below.** `wt_total_rm` and `net_weight` are both gone entirely
(dropped from the database, not just the form); the "consequence worth
flagging" paragraph above no longer applies since there's no `net_weight`
left to be affected by `wastage` either way.

## Batch Yield replaces Total weight of RM used / net_weight (2 Sept 2026)

Per direct request: *"Total Weight of RM used is incorrect and should be
removed from app and database... after each new batch is created, Batch
Yield needs to be entered manually basis on how much Finished Product has
been created. The unit will be same as of unit of Finished product item."*
Confirmed explicitly OK to drop real data before proceeding — this
environment is test data, not live ("we are working on test data so its ok
to drop any data available. we are in testing phase and not live").

This is the one genuinely destructive migration in this run of changes.
Before making it, live data was checked first (per the working agreement:
flag before deleting): 7 legacy-imported batches (`LEG-FP-304`,
`LEG-FP-205`, `LEG-FP-195`, `LEG-FP-192`, `LEG-FP-199`, `LEG-FP-231`,
`LEG-FP-259`) had real `wt_total_rm` values (30 kg, 125 kg, 69.6 kg, etc.)
that this migration permanently deletes — confirmed acceptable given the
above.

`0022_fp_batch_yield.sql`:
- Drops `net_weight` and `actual_yield_pct` first (both **generated**
  columns computed from `wt_total_rm`/`wastage` — Postgres can't drop a
  column that a generated column still depends on), then drops
  `wt_total_rm` itself. `net_weight` is not replaced — there's no longer a
  coherent "RM weight in, minus wastage" concept once `wt_total_rm` is
  gone, and nothing asked for one; the Batch header card's "Net weight
  (generated)" row is now "Batch yield" instead, a plain (non-generated)
  value.
- Adds `batch_yield numeric` — manually entered on the Complete Batch
  form, same unit as the batch's own `unit` (i.e. the Finished Product
  item's unit), replacing the "Total weight of RM used" field 1:1 in the
  form's layout.
- Re-adds `actual_yield_pct` as a **generated** column with a new,
  simpler formula: `batch_yield / target_qty * 100` instead of the old
  `(wt_total_rm - wastage) / wt_total_rm * 100`. Same column name and
  type, so every existing reader (finished-product list, Reports, this
  detail page) needed no code change at all — they just now show a more
  directly meaningful percentage ("how much came out vs. how much was
  targeted") automatically.
- `submitFinishedProductToQc()`'s pre-submission check ("Complete the
  batch... before submitting to QC") now requires `batch_yield` instead of
  `wt_total_rm`.
- Also drops `net_qty`, per a same-thread follow-up ("remove net_qty if
  unused") — but it was **not** actually unused: `app/(dashboard)/labels/page.tsx`
  was still reading `net_qty` (falling back to `total_units`) as the
  printed quantity on Finished Product labels, a real consumer that
  `0010`'s form removal had silently broken going forward (any batch
  completed after `0010` would have printed a blank label quantity) — this
  went unnoticed until this migration's impact check caught it. Fixed in
  the same change: `labels/page.tsx` now reads `batch_yield` instead,
  which is exactly the value Labels actually needs. Lesson applied: before
  dropping *any* column, grep the whole app, not just the module it looks
  like it belongs to.
- `wastage` and `total_units` are similarly unused (since `0010`) but
  weren't named in either request, so they're left in the database
  untouched — a follow-up if the same cleanup is wanted for those too.

## Stability qty / R&D qty added to Complete Batch (2 Sept 2026)

Raw Material / Packaging has captured QC + Stability + R&D quantity
together per purchase line since FB-0007/FB-0017 — Finished Product had no
Stability/R&D equivalent at all, only `qc_sample_qty`, and it had no unit
conversion (always assumed to already be in the batch's own `unit`). Per
direct request ("QC sample quantity will remain in complete batch screen
along with Yield, Stability Sample, R&D Sample and sample unit"):

- `0021_fp_stability_rnd_qty.sql` adds two new nullable columns,
  `finished_product_batches.stability_qty` / `rnd_qty` — purely additive,
  no backfill, no existing data touched. Every batch completed before this
  change simply has both as `null` until edited.
- The Complete Batch form (`complete-batch-form.tsx`) gained "Stability
  sample qty", "R&D sample qty", and a "Sample unit" selector shared by all
  three sample fields (QC/Stability/R&D) — same pattern as Purchase's own
  Sample unit field (FB-0017): pick a smaller/more convenient unit than the
  batch's own (e.g. grams while the batch is tracked in kg), and
  `completeFinishedProductBatch()` converts via `convertUnit()` into the
  batch's `unit` before storing, rejecting an incompatible pair with a
  plain-English error instead of silently storing a wrong number — the
  exact bug class fixed in `0020_qc_sample_pull_unit_fix.sql`, avoided here
  from the start. Like `purchase_lines`, no separate "as entered" unit
  column is kept — the sample unit defaults to the batch's own unit, so
  resaving an existing batch without touching that dropdown never
  re-converts its already-stored values.
- Deliberately **not** added: any bounds check tying
  QC+Stability+R&D sample qty to `wt_total_rm`/`net_qty` (the way
  `purchase_lines.remaining_qty` enforces qc+stability+rnd ≤ quantity).
  `qc_sample_qty` itself has never been bounded against anything on this
  table, and no ledger pull is fired for a Finished Product QC/Stability/
  R&D sample either (`trg_fn_qc_sample_pull()` only fires for
  `purchase_line_id`-linked `quality_checks` rows — a Finished Product
  quality_checks row is `finished_product_batch_id`-linked and was never
  wired to the ledger). These three fields stay purely informational, same
  as `qc_sample_qty` always was; `submitFinishedProductToQc()` is
  unaffected and keeps working exactly as before (it still only reads
  `qc_sample_qty`, now correctly already expressed in the batch's own
  unit).

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

**Done — Inventory Ledger redesign, Phase 3 (3 Sept 2026,
`0030_finished_product_ledger.sql`).** That trigger now exists
(`trg_qc_review_finished_product`) and `finished_product_batches.status`
is authoritative going forward; it was added alongside the new Finished
Product ledger push described below, since both hook the exact same
`quality_checks` transition. `resolveDisplayStatus`/`latestQcByBatch` were
kept in place rather than removed — see `docs/modules/inventory.md`'s
Phase 3 section for the full writeup.

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

## Integrity fixes (1 Sept 2026)

Found during a full-app audit (`claude/known-issues.md`): `submitFinishedProductToQc()`
checked the batch's `status` and only inserted a `quality_checks` row if
still `in_process` — two concurrent submissions of the same batch could
both pass that check and both insert. `0015_qc_duplicate_backstop.sql`
(see `docs/modules/qc.md`) adds `unique (finished_product_batch_id)` on
`quality_checks`; this action now translates the resulting `23505` into
"This batch has already been submitted to QC" instead of a raw Postgres
error. Also closed: `finished_product_batches` previously used a single
`for all` RLS policy for insert/update/delete — `0014_fp_bmr_delete_policy.sql`
splits it so delete is `system_admin`-only, matching the other master-data
tables (there's still no delete UI here; this closes a direct-API-call gap
only).

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

## Expiry → Re-Test Date rename (2 Sept 2026)

Two displays of `purchase_lines.expiry_date` renamed to match the
Purchase-screen rename (`docs/modules/purchase.md`): compose's RM batch
picker option text (`compose-form.tsx`, "exp" → "re-test") and its page
description ("FIFO by expiry date" → "FIFO by re-test date"), plus the
batch detail page's "Composition (RM batches consumed)" table column
("Expiry" → "Re-Test Date"). The batch's *own* "Expiry date" field
(`finished_product_batches.expiry_date`, entered on Complete Batch) is a
different column entirely and was not touched — see
`docs/modules/qc.md`, "Retest workflow," for the full disambiguation.
(The page description's wording was revised again 3 Sept 2026 — see
"FIFO default — the gap fix" above — since the field it referenced is no
longer collected.)

## Searchable, legacy-aware pickers (1 Sept 2026)

`step1-form.tsx`'s MFR select and `compose-form.tsx`'s per-line RM batch
selects are searchable comboboxes app-wide now (DESIGN.md §8), both marked
`data-legacy` (from `mfr_definitions.code` and each candidate's
`batch_number` respectively — both already selected, no query changes).
The RM batch selects are FIFO-defaulted to the oldest QC-approved
candidate; if that default happens to be a legacy batch and "Hide legacy
data" is on, the picker still shows it as the current selection (the
filter only hides legacy rows from the *open* dropdown list, never a
value already chosen) — it just won't be offered again if the line is
re-picked.

## Retest-due batches now blocked from composition (3 Sept 2026)

"Only QC Approved batches can be used for making finished product"
(Ravi) — a batch whose retest date has passed no longer counts as usable
in the compose-step FIFO candidate list, even though `quality_checks.
status` is still `approved`. Enforced at the DB level
(`0026_qc_retest_consumption_gate.sql`, shared with BMR weighment) and
mirrored in `getCandidateBatches()` (`compose/page.tsx`) so a retest-due
batch is never offered as a candidate to begin with. Full writeup in
`docs/modules/inventory.md`, "'Only QC Approved batches...' — retest-due
batches now blocked."

## Inventory Ledger redesign, Phase 2: compose picker now shows live remaining, and can't over-consume a batch (3 Sept 2026)

`getCandidateBatches()`'s "X avail." hint used to come from
`purchase_lines.remaining_qty` — static, fixed at receipt, never reduced
by earlier FP composition against that same batch. It now reads the new
`live_remaining_qty` column instead (maintained by triggers, see
`docs/modules/purchase.md`/`docs/modules/inventory.md`), and a batch
already fully consumed is filtered out of the candidate list entirely
rather than being offered with "0 avail." Separately, and more
importantly: a new DB-level check constraint now actually rejects
composing more of a batch than it has left — previously nothing enforced
this at all, at any level. `createFinishedProductBatch` translates that
specific constraint violation into a plain-language form error ("Not
enough of that batch remaining — refresh and pick another batch or a
smaller quantity"), the same pattern already used for the QC-Approved
gate error just above it in the code.

## Inventory Ledger redesign, Phase 3: FP stock becomes a real, ledger-tracked item at QC approval (3 Sept 2026)

Approving a batch's QC record (`/qc/[id]`) now pushes `batch_yield` onto
`inventory_ledger` against the MFR's linked `items` row and pulls the
three sample quantities, so "available finished product" is computable
the same way raw material and packaging stock already are — nothing on
this module's own screens changed to make that happen (the push lives in
`0030_finished_product_ledger.sql`, triggered off `quality_checks`, not
off anything in `lib/actions/finished-product.ts`). The one change here
is `completeFinishedProductBatch()` now translates the new
`fp_batch_yield_not_negative` constraint (QC + stability + R&D sample
quantities exceeding the entered batch yield) into a plain-language form
error, same pattern as the two constraint translations just above. Full
writeup, including the `finished_product_batches.status` sync this same
migration adds, in `docs/modules/inventory.md`'s Phase 3 section.
