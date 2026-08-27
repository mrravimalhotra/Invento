# Module 12 — Certificate of Analysis (COA)

DESIGN.md cross-reference: §4.12 (COA part only — Line Clearance and
Environmental Control are separate modules, not built here).

## Screens

### List — `/coa`
- `DataTable` of every `coa_records` row, newest first by `issued_at`.
- Columns: COA number, AR number (of the underlying quality check), item,
  batch, issued date, file link (if any).
- "New COA" button gated by `canWrite(user.roles, "coa")`.

### New — `/coa/new`
- Role: `coa` (`system_admin`, `quality_checker`, `qc_reviewer`).
- Dropdown of `quality_checks` filtered to `status = 'approved'` — a COA can
  only be issued against a batch that has already cleared QC review. Each
  option shows AR number, item, and batch for disambiguation.
- File URL: a plain text input for a URL, not a file upload widget.
  **v1 simplification** — noted here per the module brief; no upload
  storage wiring in this pass.
- COA number: assigned server-side via `get_next_coa_number()` inside the
  Server Action, never generated client-side.
- On submit: inserts `quality_check_id`, `finished_product_batch_id`
  (copied from the quality check if it was an FP-subject QC record —
  usually `null` for the RM flow this module was built against),
  `issued_by`, and `file_url`.
- The Server Action re-verifies the selected quality check is actually
  `approved` server-side (not just trusting the dropdown was built from a
  correctly-filtered list), returning an error otherwise.

## Files

- `lib/actions/coa.ts` — `createCoaRecord`.
- `app/(dashboard)/coa/page.tsx` — list.
- `app/(dashboard)/coa/new/page.tsx` + `coa-form.tsx` — create form.
