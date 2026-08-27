# Module 12 — Line Clearance

First requested only in the handwritten requirements list photo — invisible
in `Invento-Modular-Requirements.docx` and every other source document.
Cross-reference: `docs/DESIGN.md` §4.12.

## Screens
- `/line-clearance` — list of `line_clearance_checks`, sorted newest first.
  Columns: Area, Batch reference, Status (Clear/Not clear badge), Checked
  at. Searchable by area or batch reference.
- `/line-clearance/new` — form: Area (text, required), Batch reference
  (text, optional), Status (select: Clear / Not clear, required).

## Data
`line_clearance_checks(area, batch_reference, status, checked_by, checked_at)`
— `checked_by` is set to the signed-in user on insert; `checked_at` defaults
to `now()` in the migration. No edit/detail screen — this is a point-in-time
log, matching every other "check" record in the schema (no `active` column,
nothing to soft-delete or amend).

## Role / access
Write gated to `system_admin`, `quality_checker`, `qc_reviewer`,
`mfr_manager` — enforced via `canWrite(user.roles, "line_clearance")`
(`lib/constants/roles.ts` already carries this exact role list, matching the
inline check specified for this module) and by RLS on the table itself. Read
is open to any signed-in user, per the cross-cutting rule.
