# Module 6 — Quality Control (QC)

DESIGN.md cross-reference: §4.5 (schema), §7.1 (sampling deduction),
§7.2 (QC-gates-consumption).

## Why this module matters

This module, together with `trg_fp_component_qc_gate` (and its twin on
`bmr_weighment_lines`) in `supabase/migrations/0001_init.sql`, closes
spec.md's headline rule: **no material moves without quality clearance.**

- This module is where the Assign Record (AR) number and the
  Approved/Rejected decision actually get *written* — `quality_checks.status`
  is the single source of truth the rest of the system reads.
- The gate itself lives in the database, on a different table
  (`finished_product_components`, owned by the Finished Product module):
  `check_batch_qc_approved()` raises an exception on any insert that
  references a `purchase_line_id` whose `purchase_batch_status.qc_status`
  is not `'approved'`. It is not possible for any screen, in any module, to
  insert a consumption row against an unapproved batch — this is a database
  constraint, not a UI convention.

Together: this module produces the clearance, the trigger enforces it. Two
different tables, one rule, structurally impossible to bypass from the app
layer.

## Screens

### List — `/qc`
- `DataTable` of every `quality_checks` row, newest first.
- Columns: AR number (links to `/qc/[id]`), status (`Badge`, uses the
  existing approved/submitted/rejected color mapping), item, batch, sample
  qty + unit, retest date.
- Batch column resolves from `purchase_lines.batch_number` for RM batches or
  `finished_product_batches.batch_number` for FP batches (the table supports
  both subjects via `quality_checks.qc_one_subject`, see DESIGN.md §4.5) —
  only the RM ("maker") assign flow is built in this module; FP QC
  submission, if any, is the Finished Product module's concern and will show
  up here read-only once that module writes to this same table.
- "New AR" button gated by `canWrite(user.roles, "qc_assign")`.

### Assign ("maker" step) — `/qc/new`
- Role: `qc_assign` (`system_admin`, `inventory_manager`, `quality_checker`,
  `qc_reviewer` — see Role note below).
- Fetches every `purchase_lines` row whose `purchase_batch_status.qc_status
  = 'not_submitted'`, joined to `items` for display, so the Item dropdown
  only ever offers items that actually have an open batch.
- Item → Batch is a cascading pair of dropdowns (client-side filter over the
  same fetched list — no re-fetch per selection).
- Selecting a batch pre-fills Sample Quantity (from that purchase line's
  `qc_qty`), Sample Unit, and Expiry Date (from the purchase line) — all
  three remain editable.
- AR number: assigned server-side via `get_next_ar_number()` inside the
  Server Action, never generated client-side.
- On submit: inserts `purchase_line_id` + `item_id` (item_id is re-derived
  server-side from the chosen batch, not trusted from a hidden field),
  `finished_product_batch_id` left `null`, `status` defaults `'submitted'`.
  The sample-pull ledger row is written automatically by
  `trg_qc_sample_pull` (0002_transactions.sql) — this action never touches
  `inventory_ledger`.
- Guards against double-submission: re-checks `purchase_batch_status` at
  submit time and rejects if the batch is no longer `not_submitted`.

### Review ("checker" step) — `/qc/[id]`
- Role: `qc_review` (`system_admin`, `quality_checker`, `qc_reviewer`).
- Shows the assign record read-only (AR number, item, batch, sample qty,
  expiry) always.
- While `status = 'submitted'`: shows the review form — Approved/Rejected
  toggle buttons, review comments (textarea), and **Retest Period (days)**,
  a plain numeric input.
  - This field is *deliberately* manual, not auto-computed from a fixed
    interval — DESIGN.md's Open Question 1: retest interval genuinely
    varies by material and by what the test found, and the physical
    Approved-label's Retest Period field is filled in by hand for the same
    reason. The form carries a one-line hint saying so, next to the field.
  - `retest_date` is a DB-generated column
    (`reviewed_at::date + retest_period_days`) — the UI never sets it
    directly; it appears automatically once the record is saved and
    re-rendered.
- Once `status` is `approved` or `rejected`, the record is final: the page
  renders read-only (decision, reviewed-at, retest period + date, comments)
  and the review form is gone — there is no re-edit path, matching the
  existing baseline behavior, kept as-is per the module brief.
- The Server Action re-checks the row is still `'submitted'` before writing,
  so this is enforced server-side too, not just by hiding the form.

## Role note (flag for reconciliation)

The module brief asked me to check whether `qc_assign` exists as a key in
`lib/constants/roles.ts` → `MODULE_WRITE_ROLES`, since it wasn't expected to
be there. **It already exists**, and so does `qc_review`:

```
qc_assign: ["system_admin", "inventory_manager", "quality_checker", "qc_reviewer"],
qc_review: ["system_admin", "quality_checker", "qc_reviewer"],
```

Both match the role sets specified in this module's brief exactly, so no
inline-array workaround was needed — both screens call `canWrite(user.roles,
"qc_assign" | "qc_review")` directly. Only noting this so whoever
reconciles the roles file knows the keys were already present (added by
another agent before this module was built) and don't need to be re-added.

## Files

- `lib/actions/qc.ts` — `createQualityCheck`, `reviewQualityCheck`.
- `app/(dashboard)/qc/page.tsx` — list.
- `app/(dashboard)/qc/new/page.tsx` + `qc-assign-form.tsx` — assign step.
- `app/(dashboard)/qc/[id]/page.tsx` + `qc-review-form.tsx` — review step /
  read-only view.
