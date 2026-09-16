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
  **batch start date** (required; as of 15 Sept 2026 — see "Batch start
  date replaces up-front Expiry date" below — this step no longer
  collects an expiry date at all). Selecting an MFR fills the unit field
  from that MFR's
  standard batch-size unit (editable) and shows its name + **locks the MFR
  version being used right now** into a hidden field — this step does no DB
  writes, it's a plain `GET` form handing everything to step 2 via the query
  string.
- **New, step 2 — "Calculate composition"** — `/finished-product/new/compose`.
  Server Component: loads the MFR's recipe lines *at the version locked in
  step 1*, scales each line's quantity by `target_qty / batch_size_qty`, and
  for each ingredient queries candidate RM batches (see FIFO section below).
  Renders one row per ingredient with the computed quantity and, as of
  14 Sept 2026, an **automatic multi-batch FIFO breakdown** (see "Automatic
  multi-batch FIFO allocation" below) rather than a single overridable
  picker. Submitting calls `createFinishedProductBatch`, which inserts the
  `finished_product_batches` header (status `in_process`) and then all
  `finished_product_components` rows — now possibly several per
  ingredient, one per batch drawn from — in a single bulk insert.
- **Detail** — `/finished-product/[id]`. Header (MFR, target quantity,
  batch start date, batch yield, actual yield %, finish date, expiry
  date), composition table (item, RM batch consumed, expiry, quantity),
  the linked QC record if one exists, a **Complete batch** form (batch
  yield, finish date, expiry date, sample unit, QC/Stability/R&D sample
  qty — all mandatory and saved together as of 15 Sept 2026, shown while
  `status = 'in_process'`), and a **Submit to QC** button (same
  condition).

## FIFO default — the gap fix

`getCandidateBatches` (in the compose page) implements DESIGN.md §7.3
directly against the named views rather than PostgREST FK-embedding
(`purchase_batch_status` is a view with no FK for PostgREST to auto-detect):
for the ingredient's `item_id`, fetch its `purchase_lines`, cross-reference
`purchase_batch_status.qc_status = 'approved'`, and require
`stock_balance.on_hand > 0` for that item — then sort by `created_at asc`.
As of 14 Sept 2026 the full sorted list feeds an automatic FIFO cascade
(see "Automatic multi-batch FIFO allocation" below) rather than defaulting
just the first result into an overridable picker — the default is no
longer the old baseline's unordered list, and there is no longer a manual
override.

**Sort key changed 3 Sept 2026** from `expiry_date asc, created_at asc`
to `created_at asc` alone: `purchase_lines.expiry_date` ("Re-Test Date"
on the Purchase screen) is no longer collected at all as of this date
(`docs/modules/purchase.md`, "Re-Test Date manual entry removed") — every
batch received going forward has `expiry_date = null`, and the old sort
(JS string-compare, `null` coerced to `""`) would have put every new,
undated batch *first*, inverting FIFO into "always pick the newest
batch." Sorting by `created_at` alone is also the more literally correct
definition of FIFO regardless (first *in*, not soonest-to-expire) — this
isn't a workaround, it's the fix. (Until 14 Sept 2026 each batch drawn into
the allocation breakdown also displayed its `re-test <date>` when one
existed on file — see "Automatic multi-batch FIFO allocation" below for
why that display was dropped; `expiry_date` was already not driving the
sort by this point, only the label.)

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

`step1-form.tsx`'s MFR select is a searchable combobox app-wide now
(DESIGN.md §8), marked `data-legacy` (from `mfr_definitions.code`, already
selected, no query changes). `compose-form.tsx`'s per-line RM batch
picker was the same kind of combobox until 14 Sept 2026, when it was
replaced with the automatic multi-batch FIFO allocation described below —
see that section for why `data-legacy` marking no longer applies there
(there's no longer a dropdown to mark options in).

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

## Automatic multi-batch FIFO allocation (14 Sept 2026)

Ravi: "while creating a finished product batch, it should automatically
show how much quantity will be taken from which batch." Before this,
`getCandidateBatches()` already fetched every QC-Approved, non-retest-due,
`live_remaining_qty > 0` batch for an ingredient — sorted oldest-first —
but the compose step only ever let a person pick ONE of them from a
dropdown, pre-selected to the oldest (FIFO). Whenever the quantity needed
exceeded what that single batch had left, there was no way to express
"take the rest from the next batch" — the screen just silently offered a
batch that couldn't cover the line, and the only way to make it work was
to look up and hand-split the amount across separate finished-product
batches entirely.

`allocateFifo()` (`compose/page.tsx`) now walks the same sorted candidate
list and greedily draws from each batch in turn — oldest first — until the
ingredient's scaled quantity is covered or every candidate is exhausted.
`compose-form.tsx` renders the resulting breakdown per ingredient (e.g.
"RM-01/26 · 21.8 ltr, RM-02/26 · 25.0 ltr, RM-03/26 · 13.2 ltr") instead of
a picker, and flattens it into one `finished_product_components` row per
batch actually drawn from when the form submits.

Scoped with Ravi via `AskUserQuestion` before building, two decisions:

- The allocation is **fully automatic and not hand-editable** — no
  per-batch override, matching "automatically show" literally rather than
  reintroducing the old picker per row.
- If the total available across *every* QC-Approved batch for an
  ingredient is still short of what's needed, submission is **blocked
  entirely** (the row shows "Short by X <unit> — no further QC-Approved
  stock", and the Create batch button is disabled) rather than creating an
  under-supplied batch — the same all-or-nothing posture the old
  "No QC-Approved batch available" block already had for the
  zero-candidate case, just extended to the "some stock, not enough" case.

No migration: `finished_product_components` (`0001_init.sql`) never had a
uniqueness constraint tying one row per `(finished_product_batch_id,
item_id)`, so multiple rows for the same ingredient against different
`purchase_line_id` values already worked — each independently re-checked
by `trg_fp_component_qc_gate` and decremented by
`trg_fp_component_live_remaining_pull`
(`0029_purchase_line_live_remaining_qty.sql`). `createFinishedProductBatch`
/ `parseComponents` (`lib/actions/finished-product.ts`) were not changed
either — they already read an arbitrary-length, index-based list of
`(item_id, quantity, purchase_line_id)` triples with no assumption that
`item_id` is unique across them.

## Compose screen: batch number only, and re-confirming the retest-due block (14 Sept 2026)

Same day as the above, two follow-up points from Ravi after asking why the
allocation breakdown showed "re-test —" next to each batch:

- **"it should only show batch number, no need to show expiry/retest date
  while creating new finished product batch"** — the allocation breakdown
  (just added, above) carried `expiryDate` (`purchase_lines.expiry_date`)
  and rendered it as "re-test `<date>`" next to each batch, inherited from
  the old single-picker's option text. That field stopped being collected
  at Purchase time on 3 Sept 2026 ("Re-Test Date manual entry removed",
  `docs/modules/purchase.md`) — the real retest date lives on
  `quality_checks.retest_date` instead, computed automatically at QC
  approval — so every batch received since then showed a bare "re-test —"
  here, which is what prompted the question. Removed end-to-end rather
  than just hidden in the UI: `getCandidateBatches()` no longer selects
  `expiry_date` at all, and `Candidate`/`Allocation` no longer carry it.
  The breakdown now reads e.g. "RM-01/26 · 21.8 ltr" — batch number and
  quantity taken, nothing else.
- **"If any raw material batch is due for re-test, it should not be
  available to create new finished product until it is retested"** — this
  was already true on both layers (see "Retest-due batches now blocked
  from composition" below), and remains unchanged; re-verified locally
  this same session. `getCandidateBatches()` already excludes any batch
  whose `quality_checks.retest_date` has passed from the candidate list
  (so `allocateFifo()` never offers it as an allocation source either),
  and `check_batch_qc_approved()` (`0026_qc_retest_consumption_gate.sql`)
  independently rejects a direct insert against such a batch regardless of
  what the picker query returns. No code change was needed for this half
  of the request.

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

## Batch start date replaces up-front Expiry date; Complete Batch becomes one mandatory, all-at-once action (15 Sept 2026)

Ravi, after live-testing the app end to end: "A finished product can take
few days to get completed. Unless it is completed it is not available in
inventory for packaging and to be issued to Store/R&D. also only when the
batch process is complete 'Expiry Date' can be associated." Four concrete
asks: (1) remove Expiry date from batch creation, (2) add a Batch Start
Date field there instead, (3) confirm RM is deducted at start but FP yield
isn't added to inventory until the batch is actually complete, with the
batch showing "In Progress" in the meantime, and (4) once finished, Finish
Date and Expiry Date are entered together and both mandatory — and on that
same screen, all sample quantities and the sample unit become mandatory
too.

**(3) turned out to already be true, more strictly than asked — confirmed
by reading the actual trigger code before writing anything, not assumed.**
`finished_product_components` inserts (at batch creation, step 2) already
pull raw material immediately via `trg_fp_component_live_remaining_pull`
(`0029_purchase_line_live_remaining_qty.sql`). The Finished Product item's
own `inventory_ledger` push doesn't even wait for Complete Batch, though —
it only happens once the batch's QC record is **approved**
(`trg_fn_qc_review_finished_product`, `0030_finished_product_ledger.sql`,
see the Phase 3 section above). So a batch sitting `in_process` — or even
`submitted_to_qc`, pending review — already contributes nothing to
`stock_balance`, and Packaging already can't draw against it; no code
change was needed for this part. The status Ravi describes as "In
Progress" is also already the literal stored value
(`finished_product_batches.status = 'in_process'`, unchanged since
`0001_init.sql`) — no rename needed either.

**What was actually missing: (1)/(2)/(4).** Before this pass, Expiry date
was collected in Step 1 — before a single day of production had even
happened — via `finished_product_batches.expiry_date`; a *second*,
separately-named column, `expiry_month` (a real `date` despite the name;
see the Complete Batch field below), was collected later at Complete
Batch and was the value actually used for display (FB-0025, 12 Sept 2026)
but not for the QC record's own expiry (`submitFinishedProductToQc` read
the *creation-time* `expiry_date`, not the completion-time
`expiry_month`) — an inconsistency that predates this pass. Rather than
introduce a third column or a risky rename, the fix keeps both existing
columns and repoints which one is live: `expiry_date` is no longer
collected or read anywhere going forward (left in place, unused, same
non-destructive precedent as `updateItem()`'s dropped sampling defaults
and this module's own earlier wastage/`total_units`/`net_qty` removal —
`claude/known-issues.md`, Seventh pass); `expiry_month` becomes the one
live "Expiry date" for a batch, now read by `submitFinishedProductToQc`
too, so the QC record's expiry finally matches what the Complete Batch
screen actually shows.

**Migration `0044_fp_batch_start_date.sql`:**
- `finished_product_batches.batch_start_date` (nullable `date`), backfilled
  for every existing row — including `LEG-FP-...` legacy batches — from
  that row's own `created_at::date`: the best available, non-guessing
  stand-in for "when this batch's production run started" for batches
  that predate the column. Purely informational; nothing downstream keys
  off it.
- `fp_completion_fields_required_together`, a `not valid` CHECK (same
  idiom as `wastage_requires_batch`, `0036_wastage_batch_required.sql`,
  and every other "required together" rule in this project — applies only
  to new writes, never scans or rejects an existing row): whenever
  `finish_date` is set, `batch_yield`, `expiry_month`,
  `qc_sample_qty`, `stability_qty`, and `rnd_qty` must all be set (and
  each of the four numeric fields `> 0`) too. Defense-in-depth against a
  direct API call bypassing the app-level check below — the real
  enforcement, since this is a workflow-completeness rule rather than a
  security boundary.

**App-layer changes:**
- **Step 1** (`step1-form.tsx`, `finished-product/new/page.tsx`) — the
  Expiry date field is gone; a required **Batch start date** field
  (defaulting to today, plain editable date input, same convention as
  every other date field in this app) takes its place. The compose page
  and form (`compose/page.tsx`, `compose-form.tsx`) carry
  `batch_start_date` through as a hidden field the same way `expiry_date`
  used to be carried, and now redirect back to Step 1 if it's missing
  from the query string (previously only MFR/version/target qty/unit were
  required to proceed).
- **`createFinishedProductBatch`** (`lib/actions/finished-product.ts`) —
  reads and requires `batch_start_date` instead of reading (optional)
  `expiry_date`; the insert no longer writes `expiry_date` at all.
- **`completeFinishedProductBatch`** — this is the bigger behavioral
  change. Previously every field (batch yield, finish date, expiry month,
  sample unit, QC/Stability/R&D sample qty) was optional and could be
  saved piecemeal across several visits while a batch stayed
  `in_process`. Per Ravi's "once the batch is finished" framing, that
  partial-save shape is gone: completing a batch is now one all-or-nothing
  action — every field is required (`Field`/`Input`/`Select` all gained
  `required`, both the visual asterisk and the real HTML attribute), and
  the server action independently validates all seven values are present
  (and the four numeric ones `> 0`) before touching the database, mirrored
  by `fp_completion_fields_required_together` above as a backstop. The
  button's label changed from "Save batch details" to "Complete batch"
  (pending state: "Completing…") and the form now carries a short note
  explaining there's no partial/in-progress save, to match. The success
  message changed from "Batch details saved." to "Batch completed."
- **`submitFinishedProductToQc`** — now selects and uses `expiry_month`
  (not the now-unused `expiry_date`) when seeding the QC record's own
  expiry date; its own pre-submit error message was widened from
  "Complete the batch (batch yield, finish date)" to also name expiry
  date and sample quantities, since all of them are now required together
  by the time `batch_yield`/`finish_date` are non-null anyway.
- **Detail page** (`finished-product/[id]/page.tsx`) — the "Batch header"
  card now shows **Batch start date** (new) instead of the old
  creation-time Expiry date tile; its "Expiry date" tile moved next to
  Finish date and now reads `expiry_month`, correctly showing "—" until
  the batch has actually been completed rather than a value entered
  before production even started.

No changes were needed to the Packaging or Store/R&D issue path, or to
`stock_balance`/Stock Position — as established above, those already
correctly show zero for an FP item until its QC record is approved,
regardless of anything on this screen.

## Batch number format: FP-01/26, year-reset (15 Sept 2026)

Ravi: *"suggest suitable name for batch number instead of FP-0003 etc."*
`get_next_fp_batch_number()` (`0001_init.sql`) generated a flat global
sequence — `FP-0001`, `FP-0002`, `FP-0003`, ... via `fp_batch_seq` — the
only code-generation format in the app that doesn't sort or scan
meaningfully by time. Presented four options grounded in the app's
existing conventions (year-reset like `RM-01/26`/`PKG-01/26`, seq+full-date
like `AR-001-02092026`, date-first daily-reset, or leave as is); Ravi
picked the year-reset format.

`supabase/migrations/0045_fp_batch_number_year_reset.sql` rewrites
`get_next_fp_batch_number()` to `FP-<2-digit seq>/<2-digit year>` — e.g.
the 3rd FP batch created in 2026 is `FP-03/26`, resetting to 01 each
calendar year. This mirrors `get_next_batch_number()`'s `RM-`/`PKG-`
pattern exactly, except the count is global across all Finished Products
rather than per-item: RM/PKG batch numbers are scoped per raw
material/packaging item because those items are each purchased
repeatedly, but FP batches don't have an equivalent natural per-item
bucket Ravi asked to reset by — every `finished_product_batches` row
created this year counts, regardless of which MFR product it's for.

Counted from `created_at`, which is when `get_next_fp_batch_number()` is
actually called (`createFinishedProductBatch`, at Step 2/compose submit —
batch start time, see the Batch Start Date section above). It's a
`count(*) + 1`, not a real sequence, same as `get_next_batch_number()` —
two concurrent batch creations in the same instant could in theory
compute the same number, but `finished_product_batches.batch_number` is
`not null unique`, so a genuine race fails the second insert with a
constraint violation rather than silently assigning a duplicate code —
verified locally by inserting a row using an already-taken new-style
number and confirming it's rejected.

Purely a function replace, no data migration: existing `FP-0001`-style
batch numbers already assigned to rows are **not** rewritten — batch
numbers are immutable once assigned everywhere else in this app (item
codes, vendor codes, MFR codes per the `MFR-`/`F-` rename above).
Pre-existing FP batches keep their old `FP-0001` style codes; only
batches created from now on get the new `FP-NN/YY` format. Verified
locally: after seeding one legacy `FP-0001` row, the function correctly
returned `FP-02/26`; two more batches created via the function came back
`FP-02/26`/`FP-03/26`; a row backdated to `2025-12-31` was confirmed
excluded from the 2026 count (`get_next_fp_batch_number()` still returned
`FP-04/26` afterward). No app code assumes the old fixed 4-digit format —
`batch_number` is stored and displayed everywhere as opaque text — so no
other files needed changes; confirmed via grep across `app/` and `lib/`.

## Draft / Cancel step before production, with a 30-minute auto-cancel (15 Sept 2026)

Ravi, on the FP-0002 detail screen: *"there should be a 'Create Batch'
Button and a cancel button, till 'Create Batch' is clicked batch should
be in draft status and if clicked on cancelled, the batch should be
cancelled... Till 'Create Batch' is clicked, 'Complete Batch' Should be
disabled or invisible. Only when 'Create Batch' is clicked... batch will
move to 'In Progress' state. If batch is in draft state for more than 30
mins, it should automatically cancelled and raw material reserved should
be returned back to inventory. A smaller timer should be displayed to
remind to create batch."*

Scoped via AskUserQuestion — three open points, all confirmed before
writing any code:

1. **Where "draft" begins.** The compose/Step-2 screen's existing submit
   (`createFinishedProductBatch`) already pulls RM immediately via
   `finished_product_components` inserts (`trg_fp_component_pull`,
   `0002_transactions.sql`) and redirects to this exact detail page.
   Confirmed: that submit now creates the batch in `draft` instead of
   `in_process` — RM is pulled at the same moment as before, nothing
   about *that* part changes — and this detail page gets the new Create
   Batch / Cancel buttons while `status = 'draft'`.
2. Ravi initially described manual Cancel as **not** returning RM, but
   the 30-minute auto-cancel **as** returning it — flagged as an
   apparent inconsistency. Confirmed: no, always return RM on any
   cancel, manual or automatic. One reversal rule, regardless of cause.
3. This app has no scheduled/background job of any kind (checked: no
   `pg_cron`, no `vercel.json` cron, no edge function). Ravi chose the
   lazy option over adding real cron infrastructure: a stale draft
   (>30 min old) is only actually flipped to `cancelled` the next time
   someone loads the FP list or that batch's detail page — until then
   its DB row still literally says `draft`. The on-screen countdown
   timer is a reminder, not the enforcement.

**`supabase/migrations/0046_fp_batch_draft_cancel.sql`:**

- Widens `finished_product_batches.status` to add `'draft'` and
  `'cancelled'`, and flips the column default from `'in_process'` to
  `'draft'` (a defense-in-depth backstop mirroring this app's established
  pattern — see `fp_completion_fields_required_together`, 0044 — of a
  DB-level default/constraint matching an app-level decision).
- Adds one new `inventory_ledger` `reference_type`, `'fp_draft_cancelled'`,
  for the reversal push.
- One new trigger (`trg_fp_batch_draft_cancel_reversal`), symmetric to
  `trg_fp_component_pull`: fires on the `draft -> cancelled` transition
  however it happens — manual Cancel and the lazy auto-expire both just
  run the same `UPDATE ... SET status = 'cancelled'`, so one trigger
  keyed on the transition covers both, the same shape
  `trg_fn_qc_review_finished_product` already uses for its own
  approved/rejected transition. For every `finished_product_components`
  row on that batch it: (a) inserts an offsetting ledger push, and
  (b) — a gap found while verifying locally, easy to miss — **also**
  increments that purchase line's `live_remaining_qty` back up.
  `live_remaining_qty` (`0029_purchase_line_live_remaining_qty.sql`) is a
  *maintained* column, not derived live from the ledger; the FP compose
  picker's FIFO allocation reads that column, not the ledger, so without
  this second update a cancelled draft's RM would still look unavailable
  for the next batch even though item-level stock looked correct.
  Confirmed exactly this gap locally before fixing it: with only the
  ledger push, `live_remaining_qty` stayed at its drawn-down figure
  through a manual cancel; adding the `purchase_lines` update fixed it
  (a batch that consumed 15kg went 50 → 35 → 50 through
  create-draft → cancel).
- One new function, `expire_stale_fp_drafts()` — the lazy check itself.
  `security definer` (like every other ledger-writing trigger function in
  this app) since `fp_write` (`0001_init.sql`) is scoped to
  `system_admin`/`mfr_manager`/`inventory_manager`, and this needs to
  self-heal for *any* signed-in user who happens to load a stale draft.
  A bulk, idempotent `UPDATE ... WHERE status = 'draft' AND created_at <
  now() - 30 minutes` — safe to call on every page load by any number of
  concurrent users.

Verified locally end to end: a draft batch that pulled 15kg from a
50kg-remaining purchase line showed `live_remaining_qty = 35`; a manual
cancel restored it to `50` and left one `fp_draft_cancelled` push row in
the ledger; a draft backdated to 31 minutes old was flipped to
`cancelled` (and its RM restored) by `expire_stale_fp_drafts()` while a
5-minutes-old draft was left untouched; an `in_process -> cancelled`
transition (not part of this app's own action set, but tested as a
guard) correctly left no reversal row, confirming the trigger's `WHEN`
clause only reacts to a genuine `draft -> cancelled` move; and the
widened status check constraint correctly rejected a bogus status value.

**App-layer changes:**

- `lib/actions/finished-product.ts` — `createFinishedProductBatch`'s
  insert now sets `status: "draft"` instead of `"in_process"`. Two new
  actions: `confirmFinishedProductBatch(id)` ("Create Batch" —
  `draft -> in_process`) and `cancelFinishedProductBatch(id)` ("Cancel" —
  `draft -> cancelled`), both scoped with `.eq("status", "draft")` on the
  update so a stale page, or a batch someone else already
  confirmed/cancelled/auto-expired in the meantime, gets a clear error
  instead of a silent no-op or a double-confirm.
- `app/(dashboard)/finished-product/[id]/draft-actions-panel.tsx`
  (new) — the amber panel shown on the detail page while
  `status === 'draft'`: an explanation, a live `mm:ss` countdown to the
  30-minute mark (turns red under 5 minutes remaining), and, for users
  with Finished Product write access, the Create Batch / Cancel buttons.
  When the visible countdown reaches zero the panel calls
  `router.refresh()` once — that's what actually re-runs the server-side
  `expire_stale_fp_drafts()` check and re-renders with the batch's real
  post-expiry status; the countdown itself enforces nothing.
- `app/(dashboard)/finished-product/[id]/page.tsx` — calls
  `supabase.rpc("expire_stale_fp_drafts")` before selecting the batch (so
  a stale visit to this exact batch reflects the fresh status
  immediately), adds `created_at` to the select, and renders
  `DraftActionsPanel` while `status === 'draft'`. The existing "Complete
  batch" and "Submit to QC" cards were already gated on
  `batch.status === "in_process"` — that already correctly keeps them
  hidden through the draft stage, so per Ravi's "Complete Batch should be
  disabled or invisible" ask, no change was needed there.
- `app/(dashboard)/finished-product/page.tsx` (list) — same
  `expire_stale_fp_drafts()` call before its own select, so any stale
  draft self-heals from a list visit too, not only a detail-page visit.
- `components/ui/badge.tsx` — `draft` styled amber (same "needs
  attention" amber as `submitted_to_qc`/`awaiting_retest`), `cancelled`
  styled red (same as `rejected`/`not_clear`/`wastage`) — no new colors,
  reusing this app's existing four-color status palette.

A cancelled batch's `finished_product_components` rows are **not**
deleted — the Composition table on the detail page still shows exactly
what was drawn and then returned, same as this app never deletes
historical consumption rows elsewhere (a rejected QC record, a wastage
entry) even once their effect is reversed.

## Complete Batch review/confirm screen, and a new "Complete - Awaiting QC" stage (15 Sept 2026)

Ravi, on the Complete Batch screen (FP-0002 screenshots): "Once I click
on complete batch, I should get option to review all information and
confirm. In case I want to edit something, there should be a 'Back
Button' button which will discard information put in Complete batch
screen take me to original 'Complete Batch' screen. If Confirmed, the
Batch Status should be updated to 'Complete - In QC' from 'In Progress'.
Only Once batch is passed QC, it should be marked Complete and available
in inventory for packaging."

Scoped via `AskUserQuestion` (four open questions):

1. Whether "Complete batch" and "Submit to QC" should merge into a
   single Confirm action. Ravi: keep them **separate** manual steps —
   unchanged from today's two-button flow (Complete Batch card, then a
   separate Submit to QC card).
2. Whether the new intermediate stage is just a relabel of the existing
   `submitted_to_qc` status. Ravi: no — a **brand new label**, "Complete
   - Awaiting QC", with the full flow spelled out explicitly: **Draft ->
   In Progress -> Complete - Awaiting QC -> Submitted_to_QC -> Complete**.
   So this is a genuinely new, distinct stored status value sitting
   between `in_process` and `submitted_to_qc`, not a display-only rename
   of either existing one.
3. Whether QC-approved should be relabeled "Complete" in the UI to match
   the flow diagram's final arrow. Ravi: **no, leave it as "approved"**.
   This reply reads as in tension with the flow diagram's trailing "->
   Complete" — resolved (without a further round-trip, per the working
   agreement to flag rather than silently guess) as the diagram
   describing the FP conceptually becoming complete/available for
   packaging once QC clears it, not a literal rename of the
   `quality_checks`/badge status text. The existing packaging-eligibility
   filter (`app/(dashboard)/packaging/new/page.tsx`) already only offers
   batches where `resolveDisplayStatus(...) === "approved"`, unaffected
   by anything in this change — so "available in inventory for
   packaging" was already true before this change and needed no code
   change here. **Flagging to Ravi**: if "Complete" in the flow diagram
   was meant as a literal on-screen relabel of "approved" after all, say
   so and it's a one-line follow-up (badge label only, not a status
   value change).
4. What "Back" does on the review screen. Ravi: **keep what was typed**
   — return to the editable Complete Batch form with every field still
   filled in, never wipe it.

**What this ships:**

- `supabase/migrations/0047_fp_batch_complete_awaiting_qc.sql` — widens
  `finished_product_batches_status_check` to add `'complete_awaiting_qc'`,
  inserted between `'in_process'` and `'submitted_to_qc'`. Additive only:
  every existing stored status value was already covered by the
  pre-existing list, so nothing already in the table changes meaning or
  needs backfilling. No default change — new batches still start at
  `'draft'` (0046). Verified locally: existing status values still
  accepted, `'complete_awaiting_qc'` now accepted, a bogus value still
  rejected.
- `lib/actions/finished-product.ts`:
  - `completeFinishedProductBatch(id)` — its update now also sets
    `status: "complete_awaiting_qc"` alongside the batch yield/finish
    date/expiry date/sample fields it already saved. Previously this
    action saved those fields but left `status` untouched at
    `"in_process"`; a batch now visibly leaves "In Progress" the moment
    it's completed, rather than only leaving it once separately
    submitted to QC. Its guard changed from `current.status !==
    "in_process"` (same condition, just an updated, more accurate error
    message now that there are two possible "already moved past this"
    states — completed or submitted — rather than one).
  - `submitFinishedProductToQc(id)` — its gate changed from
    `batch.status !== "in_process"` to `batch.status !==
    "complete_awaiting_qc"`, since a batch now has to pass through
    Complete - Awaiting QC first. The pre-existing
    `!batch.batch_yield || !batch.finish_date` belt-and-suspenders check
    stays as-is underneath it.
- `lib/finished-product-status.ts` — new `fpStatusLabel(status)` helper.
  Every other status keeps rendering through the existing generic
  `status.replace(/_/g, " ")` + CSS `capitalize` combination used
  app-wide, but that combination can't produce Ravi's exact requested
  text for the new status ("Complete - Awaiting QC" — hyphen, "QC" fully
  capitalized); `capitalize` alone would render it "Complete Awaiting
  Qc". `fpStatusLabel` special-cases just this one status and falls back
  to the generic behavior for every other one. Used by both the FP
  detail page's header badge and the FP list table's Status column, in
  place of the inline `.replace(/_/g, " ")` each previously did directly.
- `components/ui/badge.tsx` — `complete_awaiting_qc` styled amber, same
  "needs a next action" amber as `draft`/`submitted_to_qc`.
- `app/(dashboard)/finished-product/[id]/page.tsx` — the "Submit to QC"
  card's gate changed from `batch.status === "in_process"` to
  `batch.status === "complete_awaiting_qc"`, matching the new status the
  batch actually sits in once completed. The "Complete batch" card's own
  gate (`batch.status === "in_process"`) is unchanged — once confirmed,
  the batch leaves `in_process` for `complete_awaiting_qc` and that card
  correctly stops rendering, since Ravi's four answers don't call for
  re-editing a completed batch's fields from this screen.
- `app/(dashboard)/finished-product/[id]/complete-batch-form.tsx` —
  rewritten to add the review/confirm step, entirely client-side:
  - Every field (batch yield, finish date, expiry date, sample unit, QC/
    stability/R&D sample qty) is now `useState`-controlled instead of a
    mix of controlled (the three sample-qty fields, already controlled
    for live unit-conversion hints) and uncontrolled `defaultValue`
    fields (batch yield, finish date, expiry date) — needed so "Back"
    can restore the exact editable form with nothing lost, per Ravi's
    answer to #4.
  - A `step: "form" | "review"` state. The "Complete batch" button on
    the form step is a plain `type="button"` that runs the same
    required/greater-than-zero checks the server action already
    enforces, then flips to `step: "review"` — no network request yet,
    nothing saved.
  - The review step renders a read-only summary of every value (with the
    same "= X unit" converted-value hint the form shows when the sample
    unit differs from the batch's own unit), plus **Back** (`type=
    "button"`, flips back to `step: "form"` — the underlying state is
    untouched, so every field is exactly as typed) and **Confirm**
    (`type="submit"`, the only button that actually invokes
    `completeFinishedProductBatch` and writes to the database).
  - The editable field grid stays mounted (never unmounted) through both
    steps — only visually hidden (`hidden` class) during the review
    step — so its inputs' `name`/`value` pairs are still part of the one
    `<form>` and get submitted on Confirm; HTML's constraint validation
    correctly skips `display: none` fields, so the browser doesn't block
    submission over "required" fields that are merely hidden, not
    absent.
  - If the server action itself returns an error (e.g. the pre-existing
    `fp_batch_yield_not_negative` constraint — samples exceeding the
    batch yield), the form drops back to `step: "form"` automatically so
    the offending values are visible and editable, rather than leaving
    the user stuck on a review screen with numbers but no inputs. This
    is done by comparing the action's returned error against the
    previous render's (a documented React pattern — adjusting state
    during render in response to a changed value — rather than a
    `useEffect`, which this repo's lint config flags for a synchronous
    `setState`).
- `app/(dashboard)/finished-product/finished-product-table.tsx` (list) —
  switched to the same new `fpStatusLabel()` helper for its Status
  column, for consistent labeling between the list and detail pages.

Verified locally: `npx tsc --noEmit`, `npx eslint` (on every changed
file), and `npx next build` all clean. The migration was applied to the
local `invento_test` Postgres 16 database and the widened constraint's
definition confirmed via `pg_get_constraintdef`.

No change was needed to the packaging-issue eligibility filter
(`app/(dashboard)/packaging/new/page.tsx`) or the QC review trigger
(`trg_fn_qc_review_finished_product`, 0030) — both already key off
`resolveDisplayStatus(...) === "approved"` (the QC-approved verdict) or
react to the `quality_checks` row directly, neither of which reads or
depends on the specific in-between status value a batch passes through
before reaching `submitted_to_qc`.

## Finish Product Intimation Slip (15 Sept 2026)

Ravi: "when a Finished Product batch is submitted to QC, a Finish Product
Intimation Slip should be generated and link should be available in
Finished Product Screen similar to RM Intimation Slip," attaching a real
sample of the legacy system's own export (`A.Jatamansi Tail_PR06-26...pdf`
— a Crystal Reports "Finish Product Intimation Slip" for FP034 / batch
`PR 06/26`, 59.000 Ltr batch, 0.300 Ltr QC sample).

This is the Finished Product counterpart of the RM Intimation Slip
(`docs/modules/purchase.md`, "RM Intimation slip", 3 Sept 2026) and
follows the exact same pattern deliberately, not a fresh design:

- **Client-side PDF generation, nothing persisted.** No new Server
  Action, no migration, no stored file — the slip is drawn live in the
  browser from data already on the page and downloaded via jsPDF's
  `.save()`. Regenerating it later always reflects the batch's current
  data (there's no separate "as generated on X date" snapshot).
- **Exact visual reproduction of the attached sample** — same real
  extracted Atharva logo, same monochrome black-ruled table (no
  brand-green fill), same two-identical-copies-on-one-A4-page layout, and
  company/Mfg-Lic text transcribed verbatim from this sample rather than
  reused from `lib/pdf.ts`'s app-wide constants (same reasoning
  `rm-intimation-pdf.ts` gives for its own local constants: this is one
  specific legacy document being reproduced exactly, not a new app-native
  export).
- **Simpler than the RM slip**, matched to what this sample actually
  shows rather than to every field this app tracks: no "Bill No" row
  (Finished Product is manufactured, not purchased — no vendor invoice to
  cite), and only one quantity column, "QCSample Qty" (no
  Stability/R&D columns, even though `finished_product_batches` has
  `stability_qty`/`rnd_qty` too).

**New files:**

- `app/(dashboard)/finished-product/[id]/fp-intimation-pdf.ts` — the
  drawing module, `downloadFpIntimationPdf(data, filename)`. A plain
  (not `"use client"`) `.ts` module, same convention as
  `rm-intimation-pdf.ts`, so it can be called directly from a client
  component without hitting the "can't call a client-file export from a
  Server Component" trap (`lib/packaging-materials.ts`).
- `app/(dashboard)/finished-product/[id]/fp-intimation-link.tsx` — the
  small client component rendering the actual "Finish Product Intimation
  Slip" text-link button and wiring its `onClick` to
  `downloadFpIntimationPdf`.

**Where the link lives, and why no extra status gate was needed:** it's
rendered inside the FP detail page's existing "QC record" card
(`app/(dashboard)/finished-product/[id]/page.tsx`), which itself only
renders once a `quality_checks` row exists for this batch (`latestQc &&
(...)`) — that row is created by `submitFinishedProductToQc()`
(`lib/actions/finished-product.ts`) at the exact moment a batch is
submitted to QC. So "the link is available once submitted to QC," per
Ravi's ask, falls straight out of the card's own existing gating —
nothing new to add there. Unlike the RM Intimation link (available on
every raw-material purchase line regardless of QC state, since it's
requesting sampling that hasn't happened yet), the FP slip's data
includes QC sample qty already recorded on the batch, so it only makes
sense once the batch has actually reached that point.

**Field mapping** (`FpIntimationData` in `fp-intimation-pdf.ts`):

| Slip field | Source |
|---|---|
| Date | `quality_checks.created_at` for this batch's latest QC row — the date it was actually submitted to QC, not today's download date and not `finish_date`/`expiry_month` |
| Name of The Product | `mfr_definitions.finished_product_item_id → items.name`, via a new embedded select on the page's existing `mfr_definitions` join: `items:finished_product_item_id(item_code, name)` (same alias pattern `app/(dashboard)/mfr/[id]/page.tsx` already uses for this FK) |
| F.P.Code | same join, `items.item_code` |
| Batch No | `finished_product_batches.batch_number` |
| Batch Qty | `finished_product_batches.batch_yield` |
| QCSample Qty | `finished_product_batches.qc_sample_qty` |

Both quantity columns are rendered to 3 decimal places (`qty3()`, e.g.
"59.000 Ltr") to match the sample, the same deliberate departure from
`formatNumber()`'s trimmed app-wide style that `rm-intimation-pdf.ts`
already established.

**Shared logo asset moved.** `atharva-logo.ts` (the real extracted PNG
used for the letterhead) lived under
`app/(dashboard)/purchase/[id]/` — a path that only made sense while RM
Intimation was its sole user. Moved to `lib/atharva-logo.ts` now that a
second, unrelated slip needs the same asset; `rm-intimation-pdf.ts`'s
import was updated to the new path (`@/lib/atharva-logo`) with no change
to the asset or its rendering.

Verified locally: `npx tsc --noEmit` and `npx eslint` clean on every
touched/new file, `npx next build` clean across all routes. Also
rendered the slip standalone (a throwaway `tsx` script exercising the
same `drawSlip` logic against the sample's own values — FP034 / A.
Jatamansi Tail / PR 06/26 / 59.000 Ltr / 0.300 Ltr) and visually compared
the output PDF against the attached sample: logo, letterhead text,
title, To/QC Department/Respected Sir/Madam block, Date field, table
columns and values, and the three-signature footer (Production Chemist /
Sampled By / QC Incharge) all match.

## Batch Manufacturing Record docx download, on the Batch header card (15 Sept 2026)

Ravi: "Once Batch is in Completed - Awaiting QC, start showing link to
'BATCH MANUFACTURING RECORD' as attached in the .docx format under Batch
Header Section of Finished Product Screen. 'List of Raw Material
Obtained from store on date' will be same as start date of batch,"
attaching a real sample front page
(`A.Jatamansi Tail_PR06-26.._front_page.docx` — FP034 / A.Jatamansi Tail
/ PR 06/26, batch size 60.00 Ltr, yield 59.00, yield% 98.33%, start
20-Jul-2026, end 29-Jul-2026, two raw materials consumed: Jatamansi
15.00 from RM 04/26, Til Taila 60.00 from RM 05/26).

**⚠️ Naming collision with the existing `/bmr` module — flagged 15 Sept
2026, resolved 16 Sept 2026 by moving and deprecating the *other* module,
not this one.** This app already has a fully separate, DB-backed
"Batch Manufacturing Record" module (`bmr_records`, `bmr_weighment_lines`,
`bmr_observations`, a Prepared → Checked → Approved sign-off;
`docs/modules/bmr.md`, Module 10), also scoped to `finished_product_batches`
via its own FK. It has no document export of any kind. The feature this
section documents is a **different, unrelated thing that happens to share
the exact same name**: a stateless, client-generated `.docx` reproduction
of one specific legacy paper form (this attached sample), with nothing
written to the database — no link to or from a `bmr_records` row, no
shared code. Both are legitimately about the same real-world FP batch, so
a user seeing "Batch Manufacturing Record" on the FP detail page could
reasonably expect it to open or reflect that batch's other module's
record — it doesn't.

**Resolution history, in order — this feature (the one on THIS page) was
moved once, then reverted, and is otherwise unchanged.** First attempt
(15→16 Sept 2026): moved this .docx download off the Finished Product
page to an Admin-only page and renamed it "Batch Mfg. Record- Deprecated."
Ravi reverted that ("you did the wrong thing - should not have moved
Batch Manufacturing Record download functionality from Finished product
screen"), and it was restored exactly to this card, byte-for-byte — see
the git history around commits `5b7a496`/`a3c692a`. Ravi's actual
resolution, given right after: **deprecate and relocate the *other*
module instead** — the real, DB-backed `/bmr` module now lives at
`/admin/bmr-deprecated`, relabeled "Batch Mfg. Record- Deprecated,"
restricted to System Admin, and flagged for future removal. Full writeup:
`docs/modules/bmr.md`'s own top section. **This feature — the download
documented in the rest of this section — was explicitly left untouched
both times Ravi asked for it to stay put**, and remains exactly where and
how it's described below.

**Format is `.docx`, not PDF — genuinely different from the other two
slips.** Unlike the RM and Finish Product Intimation Slips (jsPDF,
`docs/modules/purchase.md` / the section above), Ravi explicitly asked
for ".docx format" here. Added the `docx` npm package (`^9.7.1`) as a new
dependency for this. Same overall architecture as the two PDF slips
though: client-side generation via `Packer.toBlob()`, triggered from a
plain button's `onClick`, no Server Action, no migration, nothing
persisted — regenerating it later always reflects the batch's current
data.

**Text boxes reproduced as plain tables — a deliberate simplification,
not an oversight.** Inspecting the attached sample's raw XML (not just a
LibreOffice-rendered preview, which reorders text-box content
misleadingly) showed its header/summary block is built from Word text
boxes, each stored twice in the XML only because Word keeps a DrawingML
version and a VML fallback of every shape for older-Word compatibility —
not two visually-printed copies; the rendered page has exactly one copy
of everything. `bmr-docx.ts` reproduces the same fields and grouping
with plain Word tables instead of hand-positioned text boxes:
functionally identical in Word and on paper, and far simpler to generate
correctly from live data than replicating exact shape positioning.

**New files:**

- `app/(dashboard)/finished-product/[id]/bmr-docx.ts` — the document-
  building module, `downloadBmrDocx(data, filename)`. A plain (not
  `"use client"`) `.ts` module, same convention as the two PDF slips.
- `app/(dashboard)/finished-product/[id]/bmr-download-link.tsx` — the
  client component rendering the "Batch Manufacturing Record" text-link
  button. Unlike jsPDF's synchronous `.save()`, `docx`'s `Packer.toBlob`
  is async, so this component tracks a small `pending` state (disables
  the button, swaps its label to "Preparing…") while the document is
  being built, then triggers the download via a temporary `<a
  download>` element + `URL.createObjectURL`.

**Where the link lives, and the gating rule:** rendered as the `action`
on the FP detail page's existing "Batch header" `CardHeader`
(`app/(dashboard)/finished-product/[id]/page.tsx`). Gate:
`!["draft", "in_process", "cancelled"].includes(batch.status)` — i.e.
visible from `complete_awaiting_qc` onward and staying visible through
`submitted_to_qc`/`approved`/`rejected`, matching the same "starts
showing, then persists" behavior already established for the Finish
Product Intimation Slip link, rather than only while the batch sits in
that one exact status.

**Field mapping** (`BmrData` in `bmr-docx.ts`):

| Slip field | Source |
|---|---|
| FP Code / FP Name | `mfr_definitions.finished_product_item_id → items.item_code/name` (same join added for the Finish Product Intimation Slip, reused here) |
| Batch No | `finished_product_batches.batch_number` |
| Batch Size | `finished_product_batches.target_qty` + `unit` |
| Start Date / End Date | `batch_start_date` / `finish_date`, via the app's own `formatDate()` — numeric `dd-mm-yyyy` (FB-0026), not the sample's own textual-month style ("20-Jul-2026"), same choice already made for the Intimation Slips' own date fields: only static letterhead *text* is transcribed verbatim from a legacy sample, live/dynamic date values stay in the app's standard format |
| Yield / Yield % | `batch_yield` (with `unit` appended — the sample's own render appears to have truncated this, so it's included here for clarity) / `actual_yield_pct` (generated column) |
| List of Raw Material Obtained from store on date | `batch_start_date` — per Ravi's explicit instruction, not `created_at` or any QC date |
| RM table: RM Code / RM Name / Batch No / Qty. as per MFR | `finished_product_components` joined to `items`/`purchase_lines`, same rows already shown in the "Composition (RM batches consumed)" card above it |
| RM table: AR No. | **New** — the QC record raised against that specific purchase line when it was originally received (not this FP batch's own, separate QC submission). A purchase line has at most one `quality_checks` row (`quality_checks_purchase_line_unique`, 0015), so `page.tsx` does one extra `quality_checks` query keyed by the batch's own `purchase_line_id`s and looks each one up by `purchase_line_id` |
| RM table: Dispensed quantity / Checked By, and the bottom "Production Chemist" / "Date & Sign" lines | Left blank — hand-filled on the shop floor, same as the sample itself leaves them |
| QTY (table total) | Sum of the RM table's own "Qty. as per MFR" column, computed client-side in `bmr-docx.ts`, not stored |

**Shared logo asset reused as-is** — `lib/atharva-logo.ts` (already
moved there for the Finish Product Intimation Slip, above), embedded via
`docx`'s `ImageRun` after base64-decoding to a `Uint8Array` (`atob()`,
this module runs client-side only).

Verified locally: `npx tsc --noEmit` and `npx eslint` clean on every
touched/new file, `npx next build` clean across all routes (confirms the
new `docx` dependency bundles correctly for the client). Checked the
`docx` package's own TypeScript definitions directly
(`node_modules/docx/dist/index.d.ts`) before writing this, rather than
guessing at API shapes, for `TableCell`/`ImageRun`/`Packer` — in
particular confirmed `ImageRun`'s `type`/`data` fields, per-cell
`borders` overrides, and that `Packer.toBlob()` exists for browser use.
