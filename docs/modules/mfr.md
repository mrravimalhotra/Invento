# Module 8 — MFR / Master Formula Record

Cross-reference: `docs/DESIGN.md` §4.7 (schema), §7.4 (versioning), §6 (route
map), §8 (UI system — SignatureBlock reuse).

## Role

Write (`mfr` in `MODULE_WRITE_ROLES`): `system_admin`, `mfr_manager` —
mirrors the RLS policies `mfr_def_write` / `mfr_lines_write` in
`0001_init.sql`. Read is open to any signed-in user.

## Screens

- **List** — `/mfr`. `DataTable` of `mfr_definitions` (active only):
  code (links to detail), name, version, **Finished product** (linked item's
  `item_code`, links to `/items/[id]`), item type, batch size, approval
  (Badge — "Approved by \<name\> on \<date\>" or "Not approved"). "New MFR"
  gated by `canWrite(user.roles, "mfr")`.
- **New** — `/mfr/new`. Header fields (name, item type dropdown, batch size
  qty/unit) plus a dynamic recipe-line editor (item dropdown — raw-material
  items only, quantity, unit; add/remove rows client-side). **This screen is
  the only way a Finished Product item comes into existence** (see
  "MFR ↔ Finished Product item link" below) — submitting creates, in one
  Server Action: the `items` row (category `processed`, code via
  `get_next_item_code('processed')`, name/unit mirrored from the MFR's
  Name/Batch size unit fields), the `mfr_definitions` row (code via
  `get_next_mfr_code()`, `finished_product_item_id` pointing at that item),
  and its version-1 `mfr_lines` — each step best-effort-deletes what came
  before it if a later step fails, so a partial item or header never sticks
  around.
- **Detail** — `/mfr/[id]`. Header (read-only, including a **Finished
  product** row linking to the item), current-version recipe table, an
  **Approve** action (sets `approved_by`/`approved_at`; hidden once approved
  — shown read-only instead), and an **Edit recipe** panel (same line editor
  as New) that saves as a new version rather than overwriting.
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

## MFR ↔ Finished Product item link

Migration `0010_mfr_finished_product_link.sql` adds
`mfr_definitions.finished_product_item_id` (nullable `uuid references
items(id)`, `unique`) — a strict 1:1: one MFR per Finished Product item, one
Finished Product item per MFR. This is a deliberate architectural change:
"MFR is the formula for a Finished Product", so the MFR screen is now the
*only* entry point for creating a Finished Product master item —
`createMfrDefinition()` creates the `items` row and the `mfr_definitions`
row together (see New, above). Item Master (`lib/actions/items.ts`,
`CREATABLE_CATEGORIES`) can no longer create or promote an item into
category `processed`; it can still list, view, and edit the non-category
fields of existing Finished Product items (Category renders read-only for
those, both in the edit form and enforced server-side in `updateItem`).

The column is nullable rather than `NOT NULL` because it's an additive
migration on a live app: existing `mfr_definitions` rows, and any
`processed` items created directly through Item Master before this change,
predate the link and have no counterpart to fill it with — the migration
doesn't attempt to guess at pairing them up. Their MFR detail page shows "—
(created before this MFR/item link existed)" in the Finished product row
instead of a link. Every *new* MFR always sets it.

`mfr_definitions.item_type_id` (from `0001_init.sql`) is left in place,
deprecated but unused by new code — the linked Finished Product item now
carries its own `item_type_id`. The MFR detail/list/report screens read
item type via the linked item (`items:finished_product_item_id(...,
item_types(description))`), not the old column.

## Admin-only delete (1 Sept 2026)

Extends the same admin-only-delete pattern used for Item Type Master
(FB-0004) and Item/Vendor Master to MFR, per a direct follow-up request
("give admin access to delete mfr as well along with all master data").
`deleteMfrDefinition()` in `lib/actions/mfr.ts` checks
`user.roles.includes("system_admin")` directly (not `canWrite()`, which also
allows `mfr_manager`); `0011_mfr_delete_policy.sql` splits the old single
`mfr_def_write` RLS policy into insert/update (unchanged roles) plus a
`system_admin`-only delete policy. `DeleteMfrForm`
(`app/(dashboard)/mfr/[id]/delete-mfr-form.tsx`), same two-step-confirm
pattern as the other three, rendered on the detail page's Header card only
when the signed-in user is `system_admin`.

Deleting an MFR removes all of its recipe lines across every version —
`mfr_lines.mfr_definition_id` is `on delete cascade` — but **not** its
linked Finished Product item: `finished_product_item_id` points the other
way (MFR → item), so the item is left exactly as it was, still listed in
Item Master, just no longer backed by a recipe. Deleting it separately (if
wanted) is its own `deleteItem()` action, subject to its own FK checks.

An MFR that has produced a `finished_product_batches` row can't be deleted
— that FK has no `on delete` clause (`RESTRICT`, the default), so it raises
`23503`, caught and translated to "Can't delete — this MFR has finished
product batches on file. Remove those first." There's no
deactivate/soft-delete flow for MFR (`mfr_definitions.active` exists in the
schema but no screen ever writes it), so unlike Item Master's message this
one doesn't point at deactivating — same reasoning as `deleteVendor()`'s
message in `docs/modules/vendors.md`.

## Files

- `lib/actions/mfr.ts` — `createMfrDefinition`, `updateMfrLines`,
  `approveMfrDefinition` (each re-checks `canWrite(user.roles, "mfr")`
  server-side), `deleteMfrDefinition` (checks `system_admin` directly, same
  as the other three master-data deletes).
- `app/(dashboard)/mfr/[id]/delete-mfr-form.tsx` — two-step-confirm Delete UI.
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
