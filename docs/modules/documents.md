# Module 12 — SOP/STP Documents

First requested only in the handwritten requirements list photo — invisible
in `Invento-Modular-Requirements.docx` and every other source document.
Cross-reference: `docs/DESIGN.md` §4.12, §9 (SOP/STP simplification note).

## Screens
- `/documents` — list of `documents` (`active = true` only), sorted by
  title. Columns: Type (SOP/STP badge), Title, Revision, Effective date,
  File (opens `file_url` in a new tab). `DataTable`'s built-in search box
  filters by title or by typing "sop"/"stp" (doc_type is included in the
  searchable text).
- `/documents/new` — form: Document type (select: SOP / STP, required),
  Title (text, required), Revision number (integer, default 0, required),
  File URL (text, required — link only, no upload widget), Effective date
  (date, optional).

## Data
`documents(doc_type, title, revision_number, file_url, effective_date, active, created_by)`
— `created_by` set to the signed-in user on insert. No edit/detail screen in
this pass, matching Line Clearance/Environmental Control's simple list+new
pattern; revising a document means creating a new row at a higher revision
number rather than editing history in place.

## Role / access
Write gated to `system_admin`, `quality_checker`, `qc_reviewer` — enforced
via `canWrite(user.roles, "documents")` (role list already present in
`lib/constants/roles.ts`, matching this module's inline check spec) and by
RLS. Read is open to any signed-in user.

## Deviations / simplifications (flag for review)
- `file_url` is a plain text input, not a file-upload widget — matches
  DESIGN.md §9's explicit note that this is the "minimum viable version
  (linkable, versioned file, not a workflow engine)"; Open Question 3 (full
  structured SOP/STP workflow) is still open.
