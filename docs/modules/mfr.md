# Module 8 — MFR / Master Formula Record

Cross-reference: `docs/DESIGN.md` §4.7 (schema), §7.4 (versioning), §6 (route
map), §8 (UI system — SignatureBlock reuse).

## Role

Write (`mfr` in `MODULE_WRITE_ROLES`): `system_admin`, `mfr_manager` —
mirrors the RLS policies `mfr_def_write` / `mfr_lines_write` in
`0001_init.sql`. Read is open to any signed-in user.

## Screens

- **List** — `/mfr`. `DataTable` of `mfr_definitions` (active **and**
  inactive, as of the deactivate workflow below): code (links to detail),
  name, version, **Finished product** (linked item's `item_code`, links to
  `/items/[id]`), item type, batch size, approval (Badge — "Approved by
  \<name\> on \<date\>" or "Not approved"), Status (Active/Inactive). "New
  MFR" gated by `canWrite(user.roles, "mfr")`.
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

**Task F addendum (3 Sept 2026, `claude/packaged-fp-redesign.md`):**
`createMfrDefinition()` now also creates a second, paired item —
category `packaged_fp`, same name, its own `PKG-FP-#####` code — right
alongside the Finished Product item, and links the two via the new
`items.packaged_item_id` (nullable, unique, self-referencing). Same
"strict 1:1, set once, never guessed at for pre-existing rows" shape as
`finished_product_item_id` itself, one level further down the chain. See
`docs/modules/packaging.md`'s "Packaged Finished Product" section for
what this pairing is for (Store/R&D packaging issues transform bulk FP
into this paired item and dispatch it).

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
product batches on file. Remove those first." At the time this delete
feature shipped there was no deactivate/soft-delete flow for MFR yet, so the
message didn't point at deactivating (unlike Item Master's) — see the
deactivate workflow below, added shortly after, which fills that gap. The
delete message is left as-is: an MFR that's actually produced batches still
can't be deactivated around this restriction (deactivating doesn't remove
the batch history either), so "remove those first" remains the accurate
guidance.

## Deactivate / reactivate (1 Sept 2026)

Per a direct follow-up request ("also create deactivate workflow for mfr"),
adds the write path for `mfr_definitions.active` — a column that has existed
since `0001_init.sql` and was already **read** in two places (this list's
recipe-picker equivalent, `finished-product/new/page.tsx`'s MFR selector,
and — until this change — this list's own now-removed `active=true` filter)
but had no screen that could ever set it. No new migration is needed; the
column and its `default true` already exist.

`setMfrActive(id, active)` in `lib/actions/mfr.ts` is gated at
`canWrite(user.roles, "mfr")` — **deliberately not `system_admin`-only** like
delete: deactivating is reversible and low-stakes (it just retires a recipe
from being offered for new production; nothing is removed or made
inaccessible), so an `mfr_manager` doesn't need an admin's help. No new RLS
policy was needed either — the existing `mfr_def_update` policy (from
`0011_mfr_delete_policy.sql`) already covers `system_admin`/`mfr_manager`
updates, and setting `active` is just an update.

`ToggleMfrActiveForm` (`app/(dashboard)/mfr/[id]/toggle-active-form.tsx`) is
a single button — "Deactivate MFR" / "Reactivate MFR" depending on current
state — no two-step confirm, same one-click convention as `ApproveForm`
(reversible actions don't get the confirm treatment delete does). It's
rendered on the detail page's Header card in a new Status row (Badge +
button), next to the existing Approval row.

Because an MFR can now be turned off, the list (`/mfr`) and the detail page
both needed a companion change so a deactivated MFR doesn't become
invisible/unreachable — the same dead-end-UX class of bug as the earlier
swallowed-error fix: `/mfr`'s query dropped its `.eq("active", true)`
filter (it now lists both, distinguished by the new Status column, same
pattern as Item Master's list already used), and the detail page now
fetches and displays `active` regardless of its value. The recipe-picker
query in `finished-product/new/page.tsx` was **not** changed — it should
keep filtering to active MFRs only, since offering an inactive recipe for
new production is exactly what deactivating is meant to prevent.

## Files

- `lib/actions/mfr.ts` — `createMfrDefinition`, `updateMfrLines`,
  `approveMfrDefinition`, `setMfrActive` (each re-checks
  `canWrite(user.roles, "mfr")` server-side), `deleteMfrDefinition` (checks
  `system_admin` directly, same as the other three master-data deletes).
- `app/(dashboard)/mfr/[id]/delete-mfr-form.tsx` — two-step-confirm Delete UI.
- `app/(dashboard)/mfr/[id]/toggle-active-form.tsx` — one-click
  Deactivate/Reactivate UI.
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

## Integrity fixes + FB-0010 (1 Sept 2026)

From a full-app audit (`claude/known-issues.md`) plus a tester ticket:

- **Stale delete-blocked message.** `deleteMfrDefinition()`'s FK-violation
  message used to say "Remove those first" and claim no deactivate flow
  existed — both written before the deactivate workflow above shipped later
  the same day. Now says "Deactivate it instead," matching Item Master's
  equivalent message.
- **Concurrency guards, app-level (no schema change).** `updateMfrLines()`
  now does its `mfr_definitions.version` bump as an optimistic-locked
  update (`.eq("version", <version just read>)`) *before* inserting the new
  `mfr_lines`, not after — a losing concurrent editor now gets a clear "was
  edited by someone else" error with none of its lines inserted, instead of
  two edits silently interleaving under the same version number. If the
  lines insert itself then fails, the version bump is rolled back rather
  than left pointing at a version with zero lines. `approveMfrDefinition()`
  similarly requires `approved_by is null` in the update's own `where`
  clause, so a second concurrent Approve click now loses cleanly instead of
  silently overwriting the first approver's identity.
- **FB-0010** ("while creating MFR, next auto generated FP code should be
  visible"): `/mfr/new` now shows a read-only "Finished Product item code"
  preview via `peek_next_item_code('processed')` — same non-consuming
  preview function and pattern as the Vendor/Item next-code previews (see
  `docs/modules/vendors.md`).
- **FB-0011** ("War Material should be serachable and autocomplete. If
  Legacy items are hidden, they should not be visible in Item drop down.")
  — the recipe-line item picker (`mfr-line-editor.tsx`, used by both
  `/mfr/new` and the edit form) is a searchable combobox app-wide now (see
  DESIGN.md §8) and its options carry `data-legacy` from `item_code`, so
  turning on "Hide legacy data" hides legacy raw materials from the list —
  both server queries already selected `item_code`, no widening needed.
  Also applied to the Finished Product picker on `/finished-product/new`
  (`mfr_definitions.code` does carry a `LEG-` prefix for some real
  production MFRs, e.g. `LEG-F-FP001`).

## Bug fix: new raw materials missing from recipe-line picker (1 Sept 2026)

Same root cause and fix as `docs/modules/purchase.md`'s "Bug fix" section
(reported by Ravi as "same with new MFR screen"): `mfr/new/page.tsx`'s and
`mfr/[id]/page.tsx`'s raw-items queries had no row limit and were ordered
by `item_code` ascending, so a server-side default row cap combined with
legacy codes sorting first was silently excluding newly created raw
materials from the recipe-line item picker. Both now order by `created_at
descending`, matching the FB-0006 precedent. See `claude/known-issues.md`
for the full list of queries fixed in this pass.

## FB-0020: recipe line unit auto-populated from item default (2 Sept 2026)

"once Raw material is selected, its default unit from item master should
automatically be populated in mfr Recipe screen." `mfr-line-editor.tsx`
already did this on a row's *first* item pick (`unit: line.unit ||
item?.unit || ""` — only filled if the row's unit was still empty), but
switching the item on an already-filled row left the previous item's unit
stuck. Now the newly-picked item's own `unit` always wins when it has one
(`unit: item?.unit || line.unit || ""`), falling back to whatever was
there only if the new item has no unit set — still overridable by hand
afterward either way.
