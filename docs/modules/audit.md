# Module 21 — Audit Log

Not part of the original 15-module baseline. Ravi (21 Sept 2026): "lets fix
the audit trail issue" — a direct follow-up on the gap open-requirements-log.md
already flagged as "Still open": every table only ever carried
created/created_by/updated/updated_by/active, with no way to see a row's
prior values before an edit, only who last touched it and when. Migration:
`0058_audit_trail.sql`.

`user_roles` has defined a `super_auditor` role since `0001_init.sql`, and
it's been in `lib/constants/roles.ts`'s `ROLES`/`ROLE_LABELS` the whole
project — but nothing had ever granted it a permission or a page. This is
the first feature that actually uses it.

## Scope — confirmed with Ravi via AskUserQuestion

Two decisions, both his call:

1. **Which tables.** "Approval/status gates only," not every table in the
   schema — the tables where a status flip or approval decision is the
   thing you'd need to prove later:
   - `quality_checks` — the QC decision (two-round review, `0054`)
   - `finished_product_batches` — batch status through to approved/rejected
   - `purchase_orders` — draft/submitted (the Final Submit gate, `0019`)
   - `mfr_definitions` — `approved_by`/`approved_at` (`0041`)

   One candidate from the original proposal was dropped, flagged rather
   than silently narrowed: `line_clearance_checks`. Every write to it
   (`lib/actions/line-clearance.ts`) is a plain insert — nothing ever
   updates or deletes a row afterward. Its own `checked_by`/`checked_at`
   columns are already a complete, immutable record; there's no
   before/after to capture on a row that never changes. Revisit if an
   edit/void flow is ever added to that page.

2. **Ship a viewer now.** Rather than DB-only with SQL-editor access in the
   meantime, this migration ships with a read-only `/audit` list page and
   an `/audit/[id]` detail page in the same round.

## Design

One generic table, one generic trigger function, attached per table — the
same "shared helper trigger, attach per table" shape this schema already
uses for `updated_at`/`updated_by` (`set_updated_at()`, `0001_init.sql`),
rather than a bespoke history table per subject.

`audit_log(id, table_name, row_id, action, old_data jsonb, new_data jsonb,
changed_by, changed_at)`. Each row change writes ONE audit_log row via
`to_jsonb(old)`/`to_jsonb(new)` — full row snapshots, not a computed
field-level diff, so a future column added to any of the four tables is
captured automatically with no further migration needed.

`trg_fn_audit_log()` is `security definer`, the same reason
`inventory_ledger`'s writing functions are: `audit_log`'s own RLS denies
every direct client insert (`audit_log_no_direct_write`, mirroring
`ledger_no_direct_write`), so only this trigger can write to it. `auth.uid()`
resolves the real signed-in user regardless of whether the row change came
from a plain client `.update()` (`qc.ts`, `finished-product.ts`,
`purchase.ts`) or from inside a `security definer` RPC
(`submit_purchase_order()`, `approve_mfr_definition()`, the two-round QC
review functions in `0054`) — confirmed by local Postgres verification
(insert/update/delete exercised through all four tables, `changed_by`
correctly attributed in every case) before delivery, since `updated_by`
already relies on this exact same behavior through the exact same call
paths.

Read access: `audit_log_select` grants `system_admin` and `super_auditor`
only — verified locally that a third role (e.g. `mfr_manager`) sees zero
rows under RLS while `system_admin`/`super_auditor` see everything, and
that a direct client `insert` into `audit_log` is rejected by RLS even for
`system_admin` (only the trigger, running as its function owner, can write
it).

## Screens

- **`/audit`** — list, newest first, capped at 500 rows per filter
  (`AUDIT_LIMIT`, same row-cap-and-say-so pattern as the QC list's
  `QC_LIMIT` and the Inventory Ledger's `LEDGER_LIMIT`). Server-side
  filters (table, date range) via a GET form, same shape as
  `ledger-filters.tsx`. Columns: When, Table, Record (the record's own
  human label — AR number / batch number / PO number / MFR code, read out
  of whichever snapshot the row has), Action, Changed By, a one-line "what
  changed" summary (calls out a `status` change by name first, otherwise a
  field-count), and a link to the detail page.
- **`/audit/[id]`** — one change: a before/after table for every field
  that actually differs (update), or the full row as created/as it was
  before deletion (insert/delete), plus the raw JSON snapshots behind a
  `<details>` disclosure for anyone who needs the exact stored value.

Both pages render for any signed-in user but show an "Access restricted"
card instead of the real content when `canReadAudit()`
(`lib/constants/roles.ts`) is false — same UX pattern as `/user-roles` and
`/feedback`'s admin view. The database is the real enforcement (RLS, see
above); this is only the UI-side mirror of that.

## Known follow-ups

- Only four tables are covered, by design (see Scope above) — this is not
  a whole-database audit trail.
- No retention/archival policy yet. `audit_log` only grows; revisit if row
  count ever becomes a real concern (unlikely at this app's scale for a
  long while — it's four tables' worth of change events, not every table).
- No CSV/PDF export on the list page yet, unlike most of this app's other
  list/report screens.
