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
  items only, quantity, unit; add/remove rows client-side). Submitting
  creates only the recipe — the `mfr_definitions` row (code via
  `get_next_mfr_code()`, `finished_product_item_id` left null) and its
  version-1 `mfr_lines` — atomically, via the `create_mfr_definition()` RPC.
  **As of 14 Sept 2026, the Finished Product item is no longer created
  here** — see "MFR ↔ Finished Product item link" below for where that
  moved to and why.
- **Detail** — `/mfr/[id]`. Header (read-only, including a **Finished
  product** row linking to the item), the recipe table, an **Approve**
  action (sets `approved_by`/`approved_at`; hidden once approved — shown
  read-only instead), and, only while unapproved, an **Edit recipe** panel
  (same line editor as New) that replaces the recipe in place. Once
  approved, the panel is replaced by a note explaining the recipe is
  locked — see "Versioning" below, 14 Sept 2026 update.
- **Report** — `/mfr/[id]/report`. On-screen print preview (letterhead +
  recipe table + `SignatureBlock`'s Prepared/Checked/Approved) and a
  **Download PDF** button that renders the same content via `lib/pdf.ts`'s
  `letterhead()` + `jspdf-autotable`, plus a hand-drawn three-line signature
  block (jsPDF has no React component to reuse, so the PDF version reproduces
  `SignatureBlock`'s layout directly with `doc.line()`/`doc.text()`). **As
  of 16 Sept 2026, no longer linked from the Detail screen's "Print MFR"
  button** — see "Print MFR .docx download" below — but the route, its
  on-screen preview, and its PDF download are otherwise untouched and
  still reachable by URL.

## Versioning — built, then turned off (14 Sept 2026)

`mfr_definitions.version`/`mfr_lines.version` started at 1, with editing
designed to never update `mfr_lines` in place: `updateMfrLines` used to read
the current version, insert a fresh set of `mfr_lines` tagged
`version = current + 1`, bump `mfr_definitions.version` to match, and clear
`approved_by`/`approved_at` back to null (since the recipe just changed, a
signature against the old recipe no longer described what was on file). Old
version rows were kept in the table for history, never deleted or
overwritten, though there was never a UI to browse them (a known,
unaddressed follow-up).

**Ravi (14 Sept 2026), on the deferred-approval MFR flow
(`0041_mfr_deferred_approval.sql`) exposing a rough edge in this:** "before
MFR is approved there should be option to edit recipe 1. Currently An MFR
should only have one approved recipe. We will add recipe versioning if
required but right now lets not have this as standard feature." — then, via
AskUserQuestion: "for now MFR edit option should only available before
approval. Post approval edit should be not allowed. We will revisit if
required."

So, as of `0043_mfr_recipe_edit_lock.sql`:

- There is just **one current recipe per MFR**. Editing it — via
  `update_mfr_recipe()`, a `security definer` RPC that runs the whole thing
  as one transaction (a `for update` row lock, then delete-and-reinsert
  `mfr_lines`) — replaces it in place. `mfr_definitions.version` stays `1`
  forever; no history is kept.
- Editing is **only available before approval**. Once `approved_by` is set,
  `update_mfr_recipe()` refuses outright ("This MFR is already approved —
  the recipe can no longer be edited. Deactivate it and create a new MFR if
  the recipe needs to change.") — not "allowed, but clears the approval"
  like before, just not offered at all: the detail page's Edit panel is
  hidden once approved (`canEdit && !def.approved_by`) and shows that same
  explanation as plain text instead.
- The `version` columns on both tables are **left in the schema**, unused
  beyond always being `1` — Ravi's own words, "we will add recipe
  versioning if required" — so real version history can be turned back on
  later (this doc's previous "Known follow-up" — a versions-browsing UI —
  would be the natural place to pick that back up) without another
  migration to re-add the columns.

The detail screen and the report still query `mfr_lines` filtered to
`version = mfr_definitions.version` (i.e., always `1` now) — harmless,
since that's the only version that will ever exist for an MFR created or
edited after this change.

## MFR ↔ Finished Product item link

Migration `0010_mfr_finished_product_link.sql` adds
`mfr_definitions.finished_product_item_id` (nullable `uuid references
items(id)`, `unique`) — a strict 1:1: one MFR per Finished Product item, one
Finished Product item per MFR. This is a deliberate architectural change:
"MFR is the formula for a Finished Product", so the MFR screen is the
*only* entry point for creating a Finished Product master item — no other
screen can. Item Master (`lib/actions/items.ts`, `CREATABLE_CATEGORIES`) can
no longer create or promote an item into category `processed`; it can still
list, view, and edit the non-category fields of existing Finished Product
items (Category renders read-only for those, both in the edit form and
enforced server-side in `updateItem`).

**When the item is actually created — deferred to approval (14 Sept 2026,
`0041_mfr_deferred_approval.sql`).** Ravi: "while creating MFR, transaction
should be atomic, new MFR, Finished Product or Packaged Finished Product
should only get created once MFR is approved otherwise there is no point of
creating these." Previously `createMfrDefinition()` created the Finished
Product item (and its paired Packaged FP item, see the Task F addendum
below) eagerly, the moment the MFR itself was created — before anyone had
reviewed or approved the recipe. An MFR that was created and then abandoned
or deleted without ever being approved had still permanently burned an
FP-##### and a PKG-FP-##### code and left two live Item Master rows behind
for a recipe nobody signed off on (this is exactly what happened in the
"draft MFR / draft FP deleted, counter not reset" incident the same day).

Now:
- `create_mfr_definition()` (the RPC `createMfrDefinition()` calls) creates
  only the `mfr_definitions` row and its `mfr_lines` — `finished_product_item_id`
  stays null. Nothing in Item Master exists yet for this recipe.
- `approve_mfr_definition()` (the RPC `approveMfrDefinition()` calls) is now
  the *only* place the Finished Product / Packaged FP item pair gets
  created — atomically, in the same transaction as setting
  `approved_by`/`approved_at`. Both RPCs are `security definer` functions
  (`0041_mfr_deferred_approval.sql`), giving this a real, single-transaction
  atomic guarantee — replacing the old manual multi-insert-with-best-effort-
  `.delete()`-rollback pattern this action used to use, the same real-
  transaction pattern `bulk_create_mfr_definitions()` already proved out
  (see `docs/modules/bulk-upload.md`).
- `approve_mfr_definition()`'s "only create items the first time
  `finished_product_item_id` is still null, reuse the pair on any later
  (re-)approval" logic is kept, but as of `0043_mfr_recipe_edit_lock.sql`
  it's effectively unreachable in normal use — a recipe can no longer be
  edited once approved at all (see Versioning above), so there's no path
  back to an unapproved state for an MFR that already has items. Left in
  place as a safety net rather than removed.
- The submitted Item Type has nowhere to live until an item exists to put
  it on — rather than add a new staging column, this repurposes
  `mfr_definitions.item_type_id` (present since `0001_init.sql`, marked
  deprecated once `finished_product_item_id` shipped): written at create
  time, read once at approval time to seed the new Finished Product item's
  `item_type_id`, left in place afterward.
- `/finished-product/new`'s MFR picker now also requires `approved_by is
  not null` (previously just `active = true`) — producing against a
  still-unapproved recipe no longer makes sense once that recipe might have
  no Finished Product item to push the eventual yield onto at all.
- Bulk-uploaded MFRs (`bulk_create_mfr_definitions()`) get the identical
  treatment — see `docs/modules/bulk-upload.md`.
- The New MFR screen's `peek_next_item_code('processed')` preview banner
  (FB-0010, "next auto generated FP code should be visible") is removed:
  the code is no longer assigned anywhere near creation time, so a peeked
  value would very likely not match what's actually assigned whenever this
  MFR eventually gets approved (which could be after other MFRs have been
  created and approved in between) — showing one would be misleading, not
  a useful preview.
- The detail page's "Finished product" row and header description already
  handled a null `finished_product_item_id` gracefully (the pre-existing
  legacy-data fallback) — now reworded to say "created on approval" for an
  unapproved MFR, keeping the old "created before this MFR/item link
  existed" wording only for the (now rarer) case of an *approved* MFR with
  no link.

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

**Task F addendum (3 Sept 2026, `claude/packaged-fp-redesign.md`):** the
Finished Product item also gets a second, paired item created alongside it
— category `packaged_fp`, same name, its own `PKG-FP-#####` code — linked
via `items.packaged_item_id` (nullable, unique, self-referencing). Same
"strict 1:1, set once, never guessed at for pre-existing rows" shape as
`finished_product_item_id` itself, one level further down the chain. As of
14 Sept 2026 this pairing is created at approval time, not creation time —
see the deferred-creation writeup above; Task F's original design ("PKG-FP
created automatically, the moment FP is created") is superseded by that
change. See `docs/modules/packaging.md`'s "Packaged Finished Product"
section for what this pairing is for (Store/R&D packaging issues transform
bulk FP into this paired item and dispatch it).

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

## Code prefix: F- → MFR- (14 Sept 2026)

Ravi: "MFR Record code should start with MFR-0001 so it is more
explicit." `get_next_mfr_code()` (`0001_init.sql`) generated `F-0001`-style
codes — a single letter, ambiguous next to every other module's clearer
prefix (`RM-`/`PKG-`/`FP-`/`V-`/`PO-`/`AR-`/`COA-`/`EQ-`/`DS-`).
`0042_mfr_code_prefix.sql` changes only the prefix text, same sequence
(`mfr_code_seq`), same 4-digit padding. Purely cosmetic and forward-only —
MFRs created before this migration keep their existing `F-####` codes
(codes are never rewritten retroactively anywhere in this app); only MFRs
created from now on get `MFR-####`.

## Manufacturing procedure (16 Sept 2026)

Ravi, via a sample "Master Formula Record" Word document (A. Jatamansi
Tail Procedure.docx): "suggest a way to input and store 'MANUFACTURING
PROCEDURE' against each MFR." The sample is a Sr.No / Stage / Operation
table (Cleaning → Pulverisation → Preparation of Kwath → ... → Packing),
preceded by an intro line about weighing raw materials at production
level and closed by a yield line ("Theoretical Yield = 100%, Permissible
yield = NLT 98%") — none of which the MFR module had anywhere to live
before this; `mfr_definitions`/`mfr_lines` only ever stored the *recipe*
(raw materials + quantities), not the *procedure* (the steps to make it).

Confirmed via AskUserQuestion before building:

- **Entered from the MFR Detail page, after the MFR already exists** —
  not bundled into `/mfr/new`. `create_mfr_definition()`'s signature and
  the New MFR screen are untouched; the procedure is purely additive,
  addable (and skippable) at any point in an MFR's life.
- **Yield stored as two structured numeric percentages** —
  `theoretical_yield_pct` / `permissible_yield_pct` — rather than one
  free-text line. The sample's "NLT 98%" reads as a not-less-than
  minimum, so `permissible_yield_pct` is that threshold, printed as
  "Permissible yield = NLT {value}%"; `theoretical_yield_pct` prints as
  "Theoretical Yield = {value}%". Either or both can be left blank — the
  line is only shown/printed with whichever parts are filled in.
- **Editable at any time, including after approval — deliberately NOT
  locked like the recipe.** Ravi's call: the procedure documents *how*
  the batch is made, not the signed-off formula itself, so a
  production-time correction shouldn't be blocked just because the MFR
  is already approved and in use. `update_mfr_procedure()` has no
  "already approved" guard, unlike `update_mfr_recipe()`
  (0043_mfr_recipe_edit_lock.sql).

**Schema (`0048_mfr_procedure.sql`).** Three new nullable columns on
`mfr_definitions` (`procedure_intro`, `theoretical_yield_pct`,
`permissible_yield_pct`) — additive, no backfill: every MFR that existed
before this migration simply has no procedure until one is entered. A new
child table, `mfr_procedure_steps` (`mfr_definition_id`, `version`
default 1 — unused beyond that, same "left in place for possible future
versioning" reasoning as `mfr_lines`, see Versioning above — `step_no`,
`stage`, `operation`), cascade-deleted with its MFR, same RLS shape as
`mfr_lines` (`system_admin`/`mfr_manager` write, any signed-in user
read).

**Write path.** `update_mfr_procedure()` (called by `updateMfrProcedure()`
in `lib/actions/mfr.ts`) is a `security definer` RPC, sibling to
`update_mfr_recipe()`: same replace-in-place shape (delete every step for
this MFR, then re-insert the submitted set, all in one transaction), same
role check. Two differences from the recipe's version: no
already-approved lock (see above), and an empty/null step list is valid
(the procedure is optional — a recipe with zero lines is rejected;
a procedure with zero steps just means "not entered yet" or "cleared").
Validates each step needs both a stage and an operation, and that either
yield percentage, if given, is greater than 0.

**UI.** A "Manufacturing Procedure" card on `/mfr/[id]`, below the recipe
table: read-only display (intro line, Sr.No/Stage/Operation table, yield
line) when a procedure exists, an empty-state message when it doesn't,
and an "Add procedure"/"Edit procedure" button (`canWrite`-gated, same as
the recipe) that opens `EditProcedureForm` — an intro textarea, the
dynamic step editor (`MfrProcedureEditor`, same add/remove-row UX as
`MfrLineEditor` but Stage/Operation text fields instead of item/qty/unit
pickers; `Operation` supports multi-line text, rendered `whitespace-pre-
wrap` for sub-bullets like the sample's Agni/Fena/Varti Pariksha lines),
and the two yield-percentage inputs. Unlike `EditRecipeForm` (which
redirects on save, so its open/closed state resets for free on the fresh
page load), `updateMfrProcedure()` doesn't redirect — the panel stays
open after a successful save (same "keep editing" pattern the old BMR
add-line forms used) with an inline success message, closed by an
explicit Close button.

**Report/PDF.** `/mfr/[id]/report` and its PDF download (`MfrPdfButton`)
both add the procedure — intro line, Sr.No/Stage/Operation table (via the
same `jspdf-autotable` approach as the recipe), yield line — beneath the
recipe table and above the signature block, matching the sample document.
The whole section is skipped (no empty heading) when nothing's been
entered for that MFR yet.

**Local verification (before shipping).** A fresh local Postgres replay
of all 48 migrations in order (including `0001_init.sql`'s handle_new_user
trigger, via the project's existing `auth` schema stub for RLS/RPC
testing outside Supabase) applied cleanly end-to-end. Exercised
`update_mfr_procedure()` directly: intro/yields/two steps (one with a
literal newline in its operation text) saved and read back correctly;
approving the MFR and then editing the procedure again succeeded and left
`approved_by` untouched (confirming the "no lock" design actually holds,
not just that the code compiles); clearing back to `null`/empty removed
all steps; a step missing `operation`, and a yield ≤ 0, each raised the
expected clean validation error; a `quality_checker`-only user (not
`system_admin`/`mfr_manager`) was correctly rejected with "Not authorized
to edit an MFR procedure." `npx next build` and `npx eslint` both clean
(only the pre-existing `_prev`/`_formData` unused-arg warnings in
`lib/actions/mfr.ts`, same six now joined by no new ones).

## Print MFR .docx download (16 Sept 2026)

Ravi, attaching a real sample "Master Formula Record" (A.Jatamansi_Tail.docx,
a fuller document than the earlier procedure-only sample above — the same
product's complete MFR): "Print MFR option should give me .docx document
in attached format. It should pick up data already entered as part of MFR
and recipe and print the MFR in attached format."

**"Print MFR" on `/mfr/[id]` is now a direct one-click .docx download**
(`mfr-docx.ts` + `print-mfr-button.tsx`) — same architecture as the
Finished Product screen's existing BMR `.docx` download (`bmr-docx.ts`):
the `docx` npm package, `Packer.toBlob()` run client-side, no Server
Action, no migration for the document generation itself. Confirmed via
AskUserQuestion before building:

- **The sample's closing "Label Specimen" section (a photo of the
  physical product label) is omitted.** Nothing in the app stores a label
  image anywhere — adding that would be its own separate feature, not
  something to fold into "generate a document from data that already
  exists."
- **No Prepared/Checked/Approved sign-off block**, even though the
  existing PDF report has one and MFRs track approval — the sample simply
  doesn't have one, and this reproduces the sample exactly rather than
  adding to it. **Reversed same-day — see "Correction" below**: a
  re-attached copy of the same sample did have one, in its footer.
- **The `/mfr/[id]/report` preview page and its PDF download are
  untouched**, just no longer linked from "Print MFR" — see the Report
  screen entry above.

**What's in the document, in order:** company letterhead in a true
repeating Word header (not inlined per page like the BMR download's
letterhead table — this sample's header/footer are real Word header/
footer parts) with a "Page X of Y" footer via `docx`'s `PageNumber.CURRENT`/
`TOTAL_PAGES` fields; "Master Formula Record" + product name; a
"Composition:" list of bare ingredient names (from the recipe); "Manufacturing
Formula" + batch size + the formula table (Sr.No / Ingredients / **Botanical
Name** / Qty) + the REMARK line about proportionate scaling on a batch-size
change; then, only if a procedure has actually been entered (see
"Manufacturing procedure" above) — the whole section is skipped, not shown
empty, for an MFR with none — "MANUFACTURING PROCEDURE", the intro line,
and the Sr.No/Stage/OPERATION table with the yield line folded into its own
final row (`"", "Theoretical Yield = X %", "Permissible yield = NLT Y %"`),
matching how the sample itself lays that line out.

**Botanical Name column — no new column needed.** `items.botanical_alias`
already existed in the schema (`0001_init.sql`) and has its own field on
Item Master's New/Edit forms and detail screen — it just wasn't selected
by this page's recipe-line query before. `/mfr/[id]`'s `mfr_lines` query
now also selects it, and it flows straight into the docx (falls back to
"—" when an ingredient has none set).

Company letterhead text (`DOC_COMPANY_NAME`/`DOC_MFG_LIC`/`DOC_EMAIL_WEB`
in `mfr-docx.ts`) is transcribed verbatim from this sample's own header
and kept local rather than shared with `lib/pdf.ts`'s differently-cased
versions — same "each legacy document reproduces its own sample exactly"
precedent `bmr-docx.ts` established for the BMR download.

**Local verification (before shipping).** Ran the exact same document-
building logic standalone under `tsx` (writing to a file via
`Packer.toBuffer` instead of the browser download flow, since the real
module's tail uses browser-only globals) against two cases: the full
sample data including an ingredient with no botanical name set (correctly
printed "—"), a multi-line Operation cell (the Agni/Fena/Varti Pariksha
sub-lines, correctly preserved as separate lines within the same table
cell), and the closing yield row; and an MFR with no procedure entered at
all (correctly produced zero procedure content — no "MANUFACTURING
PROCEDURE" heading, no second table). Inspected both generated `.docx`
files' real XML content via `python-docx` to confirm structure, not just
that the code ran without throwing. `npx next build` and `npx eslint`
clean.

### Correction: logo, footer sign-off table, fonts (16 Sept 2026, same day)

Ravi, after seeing the actual generated document: "MFR is not printing in
correct format. Pls take reference of attached again. Use similar Logo,
color scheme, header, footer etc," re-attaching the sample. The first pass
above only reproduced the sample's header/footer **text** — inspecting the
re-attached copy's raw XML (not just python-docx's higher-level text/table
view) turned up three things the first inspection missed entirely:

- **The header has the real ATHARVA logo as an embedded image**, not just
  text — the exact same logo already used elsewhere in this app
  (`lib/atharva-logo.ts`, already reused by `bmr-docx.ts` and the RM/FP
  intimation PDFs), just never placed inside a real Word `Header` before.
  Reused directly rather than extracting a duplicate asset. Laid out as a
  borderless two-column table inside the header (logo left, company text
  block right), same pattern `bmr-docx.ts`'s inlined `letterheadTable`
  already uses in this app.
- **The footer has a blank Prepared-by/Checked-by/Approved-by sign-off
  table** (Name/Designation/Sign./Date columns, light shaded header row —
  `w:shd w:fill="EEECE1"` in the sample's own XML) above the "Page X of Y"
  line — found via `python-docx`'s `section.footer.tables`, which the
  first pass's inspection never checked (only `footer.paragraphs`). This
  directly reverses the "no sign-off block" decision above, not because
  Ravi changed his mind but because the first inspection was incomplete.
- **The header and body/footer use different explicit fonts**, confirmed
  by diffing `w:rFonts` declarations across `header1.xml`/`document.xml`/
  `footer1.xml`: the header is Arial, the body and footer are both Times
  New Roman. Set as Times New Roman document-wide (`styles.default.
  document.run`), with Arial layered on per-run only for the three header
  lines. The company name is left its default (black) color — an earlier
  version of this fix colored it this app's brand green
  (`lib/pdf.ts`'s `PDF_BRAND`) to match the jsPDF letterheads' own
  convention, but the sample's header XML has no explicit `w:color` at
  all, and "similar" here means matching what the reference actually is.

Re-verified the same way as the first pass — standalone `tsx` run of the
corrected logic, this time also converted to PDF via LibreOffice
(`soffice --headless --convert-to pdf`) and rendered to PNG for a direct
visual side-by-side against the sample, rather than only checking XML
structure. `npx next build` and `npx eslint` clean.

## Files

- `lib/actions/mfr.ts` — `createMfrDefinition`, `updateMfrLines`,
  `approveMfrDefinition`, `setMfrActive` (each re-checks
  `canWrite(user.roles, "mfr")` server-side), `deleteMfrDefinition` (checks
  `system_admin` directly, same as the other three master-data deletes),
  `updateMfrProcedure` (see "Manufacturing procedure" above — also
  `canWrite`-gated, thin wrapper around `update_mfr_procedure()`).
  `createMfrDefinition`/`approveMfrDefinition`/`updateMfrLines` are now thin
  wrappers around the `create_mfr_definition()`/`approve_mfr_definition()`/
  `update_mfr_recipe()` RPCs (`0041_mfr_deferred_approval.sql` /
  `0043_mfr_recipe_edit_lock.sql`) — see "When the item is actually
  created" and "Versioning" above.
- `app/(dashboard)/mfr/mfr-procedure-editor.tsx` — shared dynamic
  procedure-step editor (`MfrProcedureEditor`, `stage_i`/`operation_i`
  fields + `stepCount`), used by `EditProcedureForm`.
- `app/(dashboard)/mfr/[id]/edit-procedure-form.tsx` — the intro/steps/
  yield edit panel, open behind an "Add procedure"/"Edit procedure"
  button.
- `app/(dashboard)/mfr/[id]/mfr-docx.ts` + `print-mfr-button.tsx` — the
  "Print MFR" `.docx` download (see "Print MFR .docx download" above).
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
  turn out to be needed, they can reuse the same `useActionState` pattern;
  worth deciding at that point whether they should be locked post-approval
  too, same as recipe edits now are.
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
  used to do its `mfr_definitions.version` bump as an optimistic-locked
  update (`.eq("version", <version just read>)`) *before* inserting the new
  `mfr_lines`, not after — a losing concurrent editor got a clear "was
  edited by someone else" error with none of its lines inserted, instead of
  two edits silently interleaving under the same version number.
  **Superseded 14 Sept 2026** (see Versioning above): `update_mfr_recipe()`
  now takes a real `for update` row lock instead, giving the same
  no-interleaving guarantee without a version number to optimistically
  lock against. `approveMfrDefinition()` similarly used to require
  `approved_by is null` in its update's own `where` clause; `0041`
  replaced that with the same kind of real row lock, in
  `approve_mfr_definition()`.
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
