# Module 8 — MFR / Master Formula Record

Cross-reference: `docs/DESIGN.md` §4.7 (schema), §7.4 (versioning), §6 (route
map), §8 (UI system — SignatureBlock reuse).

## Role

Write (`mfr` in `MODULE_WRITE_ROLES`): `system_admin`, `mfr_manager` —
mirrors the RLS policies `mfr_def_write` / `mfr_lines_write` in
`0001_init.sql`. Read is open to any signed-in user.

## Screens

- **List** — `/mfr`. `DataTable` of `mfr_definitions` (active only):
  code (links to detail), name, version, item type, batch size,
  approval (Badge — "Approved by \<name\> on \<date\>" or "Not approved").
  "New MFR" gated by `canWrite(user.roles, "mfr")`.
- **New** — `/mfr/new`. Header fields (name, item type dropdown, batch size
  qty/unit) plus a dynamic recipe-line editor (item dropdown — raw-material
  items only, quantity, unit; add/remove rows client-side). Submitting
  creates the `mfr_definitions` row (code via `get_next_mfr_code()`) and its
  version-1 `mfr_lines` in one Server Action; the definition row is deleted
  again if the lines insert fails, so a partial header never sticks around.
- **Detail** — `/mfr/[id]`. Header (read-only), current-version recipe
  table, an **Approve** action (sets `approved_by`/`approved_at`; hidden
  once approved — shown read-only instead), and an **Edit recipe** panel
  (same line editor as New) that saves as a new version rather than
  overwriting.
- **Report** — `/mfr/[id]/report`. On-screen print preview (letterhead +
  recipe table + `SignatureBlock`'s Prepared/Checked/Approved) and a
  **Download PDF** button that renders the same content via `lib/pdf.ts`'s
  `letterhead()` + `jspdf-autotable`, plus a hand-drawn three-line signature
  block (jsPDF has no React component to reuse, so the PDF version reproduces
  `SignatureBlock`'s layout directly with `doc.line()`/`doc.text()`).

## Versioning — the gap fix

`mfr_definitions.version` starts at 1. **Editing recipe lines never updates
`mfr_lines` in place.** `updateMfrLines` (in `lib/actions/mfr.ts`):

1. Reads the definition's current `version`.
2. Inserts a fresh set of `mfr_lines` tagged `version = current + 1`.
3. Updates `mfr_definitions.version` to that new number, **and clears
   `approved_by`/`approved_at` back to null** — a decision beyond the literal
   brief: since the recipe just changed, a signature against the old recipe
   no longer describes what's on file, so re-approval is required. This is
   plain application logic (no schema change), consistent with "no material
   moves without quality clearance" applied to the record itself, not just
   to stock.

The detail screen and the report both query `mfr_lines` filtered to
`version = mfr_definitions.version`, so only the current recipe is ever
shown. Old version rows are never deleted or overwritten — they stay in the
table for history.

**Known follow-up (not built this pass):** there is no UI to browse old
versions. The data is safe (nothing is destroyed), but a past version can
currently only be inspected via direct SQL. A `/mfr/[id]/versions/[v]` route
reusing the same recipe-table markup would be the natural addition.

## Files

- `lib/actions/mfr.ts` — `createMfrDefinition`, `updateMfrLines`,
  `approveMfrDefinition`. Every action re-checks `canWrite(user.roles,
  "mfr")` server-side.
- `app/(dashboard)/mfr/page.tsx` — list.
- `app/(dashboard)/mfr/mfr-line-editor.tsx` — shared dynamic recipe-line
  editor (`item_i`/`quantity_i`/`unit_i` fields + `lineCount`), used by both
  New and the detail page's Edit-recipe panel.
- `app/(dashboard)/mfr/new/page.tsx` + `new-mfr-form.tsx`.
- `app/(dashboard)/mfr/[id]/page.tsx`, `approve-form.tsx`,
  `edit-recipe-form.tsx`.
- `app/(dashboard)/mfr/[id]/report/page.tsx` + `mfr-pdf-button.tsx`.

## Deviations / notes

- No screen to edit header fields (name/item type/batch size) after
  creation — the brief only asked for header display + Approve + recipe
  editing on the detail screen, so that's what's built. If header edits
  turn out to be needed, they can reuse the same `useActionState` pattern
  without touching versioning.
- "Approved by" resolves the approver's display name via a second query to
  `public.profiles` (keyed by `mfr_definitions.approved_by`), since
  `approved_by` references `auth.users` directly and PostgREST can't embed
  across schemas — same approach used for `approved_by`/`reviewed_by`
  elsewhere in the app.
