# Module 10 — Batch Manufacturing Record (BMR)

DESIGN.md cross-reference: §4.9.

**Newly-promoted module.** In the first requirements-review pass this was a
"Not Yet Built" table row with no real source document behind it. The
second pass turned up a printed Batch Manufacturing Record document (one of
the 37 legacy screen/document photos) and `SOP of Sifter.doc`, so the field
spec below is built directly against those, not against any prior baseline
code — there is no BMR module in the first-draft codebase to carry forward.

- **Weighment lines** (`item_id`, `purchase_line_id`, `standard_qty`,
  `actual_qty`) come from the printed BMR itself, which has a weighing table
  with exactly these columns per ingredient.
- **Observations** (`step_label` free text + `reading` free text) exist
  because `SOP of Sifter.doc` explicitly requires the sifter's sieve
  retention weight to be written onto the BMR — `step_label` is kept free
  text (not a fixed enum) so any other equipment SOP can log a reading onto
  the same BMR without a schema change per instrument.
- **Prepared / Checked / Approved sign-off** matches the printed BMR's own
  three-signature block, the same pattern already used for MFR and reused
  via `SignatureBlock` display language (though this module's sign-off is
  three separate button-driven actions, not a single print form).

## Screens

### List — `/bmr`
- `DataTable` of every `bmr_records` row, newest first.
- Columns: FP batch number (via `finished_product_batches.batch_number`,
  linked to the detail page), and a single Status badge derived from which
  of `prepared_at` / `checked_at` / `approved_at` are set: **Not started**
  (none) → **Prepared** → **Checked** → **Approved**.
- "New BMR" button gated by `canWrite(user.roles, "bmr")`.

### New — `/bmr/new`
- Role: `bmr` (`system_admin`, `mfr_manager`, `quality_checker`,
  `qc_reviewer` — matches the RLS policy on `bmr_records` in
  `0001_init.sql`).
- Dropdown of `finished_product_batches` that don't already have a
  `bmr_records` row (computed in the page by diffing the two lists — there
  is no DB uniqueness constraint enforcing "one BMR per batch"; see
  Deviations below). Not filtered by FP status — weighment/observations
  happen alongside manufacturing, before the batch is necessarily QC
  submitted or approved.
- Creates the `bmr_records` row (no other fields at creation time) and
  redirects straight to the detail page, where everything else is entered.

### Detail — `/bmr/[id]`
- **Sign-off panel**: three cards (Prepared / Checked / Approved). Each
  shows the signer's display name (`profiles.full_name`) and timestamp once
  set; otherwise a "Mark …" button, sequentially gated in the UI — Checked
  is only actionable once Prepared is set, Approved only once Checked is
  set. This is a simple UI-level sequence, not a DB constraint, per the
  module brief. The Server Action re-checks the same sequence server-side
  as a second line of defense.
- **Weighment lines**: existing rows rendered as a table (item, batch,
  standard qty, actual qty). Add-line form below it:
  - Item dropdown — all active `items` with `category` in (`raw`,
    `processed`).
  - Batch dropdown — that item's QC-Approved `purchase_lines` only (two-step
    lookup against the `purchase_batch_status` view, since it's a plain view
    with no FK PostgREST can embed). Defaults to whichever batch the FP
    batch's own `finished_product_components` already used for that item,
    if a match exists; otherwise any Approved batch for the item, oldest
    expiry first.
  - Standard qty — prefilled from `mfr_lines` for the FP batch's pinned
    `mfr_definition_id` + `mfr_version`, when that item appears in the
    formula; otherwise left blank for manual entry. Always editable, and
    required (the column is `not null` in the schema, so "leave blank" from
    the module brief means "blank until the user fills it in", not
    "nullable in the DB").
  - Actual qty — manual, optional.
  - Insert goes through `trg_bmr_weighment_qc_gate`, the same
    `check_batch_qc_approved()` trigger that gates Finished Product
    composition. The Server Action catches that trigger's Postgres
    exception by matching its message text and returns a plain form error
    ("That batch is not QC-Approved…") instead of letting the raw DB error
    reach the user.
- **Observations**: existing rows rendered as a table (step, reading,
  recorded by, recorded at). Add form below it: `step_label` + `reading`,
  both free text; appends a row, `recorded_by`/`recorded_at` set
  server-side.

## Role

`bmr` in `MODULE_WRITE_ROLES` (`lib/constants/roles.ts` — already present,
not added by this module).

## Files

- `lib/actions/bmr.ts` — `createBmrRecord`, `addWeighmentLine`,
  `addObservation`, `markPrepared`, `markChecked`, `markApproved`.
- `app/(dashboard)/bmr/page.tsx` — list.
- `app/(dashboard)/bmr/new/page.tsx` — create flow (pick FP batch).
- `app/(dashboard)/bmr/[id]/page.tsx` — detail (weighment, observations,
  sign-off).
- `app/(dashboard)/bmr/bmr-forms.tsx` — client form components
  (`NewBmrForm`, `WeighmentLineForm`, `ObservationForm`, `SignOffPanel`).

## Deviations / notes for review

- **No DB uniqueness constraint on `bmr_records.finished_product_batch_id`.**
  "One BMR per batch" is enforced only by the `/bmr/new` picker excluding
  batches that already have a row — a race (two people creating a BMR for
  the same batch at once) could produce two rows. Per `AGENT_BRIEFING.md`
  I did not add a migration for this; flagging it here as a candidate for a
  `unique` constraint on that column in the next migration pass, alongside
  whatever other schema asks other agents accumulate.
- Weighment lines' item dropdown is scoped to `category in ('raw',
  'processed')`, excluding `packaging` — the printed BMR's weighing table is
  for formula ingredients, not pack material (that's Packaging's job).

## Integrity fixes (1 Sept 2026)

From a full-app audit (`claude/known-issues.md`):

- **Raw Postgres error on double-submit.** `/bmr/new` already filters out
  batches that already have a BMR, but that's a page-load-time check, not a
  lock — two tabs or a double-click against the same batch could surface
  `duplicate key value violates unique constraint "bmr_records_one_per_
  batch"` verbatim. `createBmrRecord()` now catches `23505` and returns
  "This finished product batch already has a BMR record."
- **`bmr_records` was deletable by any of its write roles**, not just
  `system_admin` — it used a single `for all` RLS policy for
  insert/update/delete. `0014_fp_bmr_delete_policy.sql` splits it so delete
  is `system_admin`-only, matching the other master-data/record tables
  (there's still no delete UI here; this closes a direct-API-call gap
  only).

## Searchable, legacy-aware pickers (1 Sept 2026)

`bmr-forms.tsx`'s FP batch select (`NewBmrForm`) and its Item/Batch selects
(`WeighmentLineForm`) are searchable comboboxes app-wide now (DESIGN.md
§8), all marked `data-legacy`. The weighment-line item query
(`app/(dashboard)/bmr/[id]/page.tsx`) had to widen from
`select("id, name, unit")` to include `item_code` — it wasn't selected
before, so a legacy raw material couldn't be told apart from a v2 one in
that specific picker. The batch selects on both forms already had
`batch_number`.

## Expiry → Re-Test Date rename (2 Sept 2026)

`NewBmrForm`'s FP batch picker shows each candidate raw-material batch's
`purchase_lines.expiry_date` in its option label — this was `(exp ...)`,
now `(re-test ...)`, matching the Purchase-screen rename
(`docs/modules/purchase.md`). Same underlying value, display-only change.
See `docs/modules/qc.md`, "Retest workflow," for the full rename scope
and why `quality_checks`' own retest fields (unrelated, used by the actual
retest-QC workflow) were left untouched.

## Bug fix: row-cap truncation on weighment-line item picker (1 Sept 2026)

Same root cause as `docs/modules/purchase.md`'s "Bug fix" section: the
weighment-line item query (`bmr/[id]/page.tsx`) had no row limit and
ordered by `name`. Fixed the same way as every other query in this sweep —
now orders by `created_at descending` — so a growing `items` table can't
silently push new raw/processed materials past a server-side row cap
before this picker ever sees them.
