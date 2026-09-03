# Module 3 — Item Master

Cross-reference: `docs/DESIGN.md` §4.2 (schema), §4.6 (`stock_balance` view),
§4.13 (low-stock banner), §6 (route map), §8 (UI system), §9 (barcode
simplification).

## Role

Write (`items` in `MODULE_WRITE_ROLES`): `system_admin`, `inventory_manager`,
`mfr_manager` — mirrors the RLS policy `items_write` in `0001_init.sql`.
Read is open to any signed-in user.

## Screens

- **List** — `/items` (`app/(dashboard)/items/page.tsx`). `DataTable` with
  columns Item Code / Name / Category / Type / Unit / Stock on hand (joined
  from the `stock_balance` view by `item_id`, "—" when the item has no
  ledger rows yet) / Low stock badge (`on_hand < low_stock_threshold`) /
  Active. A category filter (All / Raw material / Packaging / Finished
  product) is implemented as tab links (`?category=`), server-rendered, not
  blocking core CRUD. "New item" button shown only when `canWrite(user.roles,
  "items")`. Also carries the shared "Hide legacy data" toggle (see FB-0003
  below).
- **New** — `/items/new`. Fields: Item code (read-only preview — see
  "Next-code preview" below), Name (required), Botanical alias, Category
  (select: Raw material / Packaging **only**, as of the MFR/Finished Product
  link change below — see that section for why "Finished product" was
  removed here), Item type (dropdown of `item_types`, active ones), Unit
  (dropdown from `lib/constants/units.ts` `UNITS`), Barcode (free text,
  optional, unique), Low stock threshold (numeric, optional — see the
  "Sampling & stock defaults removed" note below for where the other fields
  that used to live next to it went). The real `item_code` doesn't exist until save —
  the Server Action calls `supabase.rpc("get_next_item_code", { p_category })`
  at insert time (never generated client-side, per the briefing), then
  redirects to the new item's detail page where the generated code is shown
  for real. As of `0007_item_code_fp_and_sample_unit.sql`, codes are 5-digit
  and 3-way: `RM-00001` (raw), `PKG-00001` (packaging), `FP-00001`
  (processed/finished product, its own sequence, now only ever assigned via
  MFR — see below).

## Next-code preview (1 Sept 2026)

Per a direct request ("while adding new Item, next assigned Item Code
should be visible e.g. RM-00005") — same idea as the matching change on
Vendor Master (`docs/modules/vendors.md`). A new SQL function,
`peek_next_item_code(p_category)` (`0012_peek_next_codes.sql`), reads the
relevant `item_code_seq_*` sequence's current state (`last_value`/
`is_called`) without calling `nextval()`, so a preview can be shown without
burning a real code number. Since Category is a client-side choice on this
form (Raw material vs Packaging — both are still creatable, see above),
`items/new/page.tsx` fetches **both** previews up front
(`peek_next_item_code('raw')` and `peek_next_item_code('packaging')`) and
passes them to `NewItemForm` as `nextCodes: { raw, packaging }`; the
Category `<Select>` there is now a controlled input (`useState`) so
switching it swaps which preview the read-only "Item code" field shows,
entirely client-side — no extra round trip per keystroke/selection.

Same caveat as the vendor version: this is a preview, not a reservation.
The code actually written on save always comes from
`get_next_item_code()` (`nextval`) inside `createItem()`, so it's correct
and unique even if the preview had gone stale (someone else created an
item of the same category in between).
- **Detail/Edit** — `/items/[id]`. Same fields, all editable, plus (as of
  the "delete access for all master data" follow-up to FB-0004,
  system_admin only) a two-step-confirm Delete control below the edit
  form, and:
  - A read-only "Stock on hand" stat card computed from `stock_balance.on_hand`.
  - A read-only "Low stock" stat (Yes/No).
  - A read-only "Item code" stat (the field is never editable after
    creation).
  - Category is a Raw material / Packaging select for those two categories —
    freely movable between them, same as FB-0002. For an item whose category
    is already `processed`, Category instead renders as a locked, disabled
    "Finished product" field (see MFR/Finished Product link section below);
    `updateItem` also enforces this server-side regardless of what the form
    submits.
  - A Barcode panel: if the item has a `barcode` value, it's rendered as an
    inline Code128 (Set B) SVG generated in `app/(dashboard)/items/barcode.tsx`
    (no external service/library, per DESIGN.md §9) with the human-readable
    value underneath; otherwise "No barcode on file."
  - Read-only view (no form) if the signed-in user can't write this module.

## FB-0002 (30 Aug 2026) — Finished Product category, 5-digit codes, sample unit

Tester feedback asked for three things on this screen: `processed` items
creatable here as "Finished product" with an `FP-` prefixed code (done —
`0007_item_code_fp_and_sample_unit.sql` adds `item_code_seq_fp` and
rewrites `get_next_item_code()` to a 3-way branch, 5 digits per prefix);
and a unit selector for the three "Default …qty" fields so a raw material
stocked in `kg` can have its QC sample recorded in `gm`.

That third part is implemented as `items.default_sample_unit` — one unit,
shared by QC/stability/R&D, shown on the New/Edit forms and on the detail
page — but it is **display-only**, not wired into `purchase_lines`
arithmetic. `purchase_lines.qc_qty` / `stability_qty` / `rnd_qty` still
share a single `unit` column with `quantity`, and `remaining_qty` is a
generated column (`quantity - qc_qty - stability_qty - rnd_qty`) that
assumes all four are in that one unit — automatically converting between
units there would need a real unit-conversion table, which doesn't exist
anywhere in this schema (`lib/constants/units.ts` `UNITS` is a flat,
unconvertible label list). Rather than guess at that schema change on a
live app, the Purchase line form (`purchase-line-form.tsx`) instead shows a
plain-text note when an item's `default_sample_unit` differs from its
`unit`, telling the person entering the line to convert by hand. A real
conversion system is a reasonable follow-up but is a separate, larger
change (new table + `purchase_lines` schema + inventory-ledger review), not
bundled into this pass.

## FB-0005 (1 Sep 2026) — Success message on new item

`createItem` redirects on success (unlike `updateItem`, which stays on the
same page), so a same-page `useActionState` success message doesn't work
here — the confirmation has to travel via the URL. `createItem` now
redirects to `/items/${id}?created=1` instead of `/items/${id}`, and
`[id]/page.tsx` reads `created` from `searchParams` and renders a one-time
banner: `New item "{name}" ({item_code}) has been successfully added.`
Refreshing or revisiting the detail page later drops the query param (the
link on `/items` and elsewhere doesn't carry it), so the banner only shows
right after creation, same one-shot feel as the item-type success message.

## FB-0006 (1 Sep 2026) — Newly created items were hard to find

`DataTable` (`components/ui/data-table.tsx`) fetches all matching rows
unbounded and slices 15/page client-side, so sort order alone determines
what's visible without searching or paging deep. The list was sorted
alphabetically by `item_code`, and ASCII order puts legacy-imported codes
(prefixed `LEG-`) ahead of app-generated `RM-`/`PKG-` codes (`FP-` sorts
before `LEG-`, but `RM-`/`PKG-` sort after it) — so a newly created Raw
material or Packaging item landed on some late page behind ~1000 legacy
rows, effectively invisible. `/items` now orders by `created_at` descending
(newest first) instead, and the list gained a "Created" column
(`items-table.tsx`, same `formatDate` pattern as Item Type Master) so the
sort order is visible, not just implicit.

## Admin-only delete (1 Sep 2026)

Extends FB-0004's item-type delete pattern to Item Master, per a direct
follow-up request ("provide delete access for all master data including
vendor, item etc to admin"). `deleteItem()` in `lib/actions/items.ts`
checks `user.roles.includes("system_admin")` directly rather than
`canWrite()` (which also allows `inventory_manager`/`mfr_manager`), and
`0009_master_data_delete_policy.sql` splits the old single `items_write`
RLS policy into insert/update (unchanged roles) plus a `system_admin`-only
delete policy, keeping the app check and RLS backstop in agreement.

Items are referenced by `purchase_lines`, `quality_checks`,
`inventory_ledger`, `mfr_lines`, `finished_product_components`,
`bmr_weighment_lines` and `packaging_issues` (all `ON DELETE RESTRICT`, the
Postgres default) — and, as of the MFR/Finished Product link above,
`mfr_definitions.finished_product_item_id` for `processed` items — so in
practice only an item with zero transaction history and no linked MFR can
be deleted — anything else raises `23503`, caught and translated to "Can't
delete — this item has purchase, QC, inventory, production, or MFR records
on file. Deactivate it instead," pointing at the existing Active toggle
rather than a dead end.

## MFR/Finished Product link — Finished product removed from Item Master (1 Sep 2026)

Per a direct architectural request ("MFR is formula for finished product,
let MFR screen be entry point for Finished Product master list creation
... Remove access to create Finished product master list from Item
Master"): `items.category = 'processed'` ("Finished product") can no longer
be created or set from this screen at all. `CREATABLE_CATEGORIES` in
`lib/actions/items.ts` is now `["raw", "packaging"]`; `createItem` rejects
`category=processed` with "Finished Product items are created from the MFR
screen, not here — go to MFR → New MFR." (checked server-side, not just
hidden from the New-item select), and `updateItem` never lets an existing
raw/packaging item be promoted into `processed`, nor an existing `processed`
item be demoted out of it — it pre-fetches the item's current category and
forces `update.category` back to `processed` if that's what's already on
file, regardless of what the form submits.

A Finished Product item now only ever comes into existence as a side effect
of creating an MFR recipe (`createMfrDefinition()` in `lib/actions/mfr.ts` —
see `docs/modules/mfr.md`'s "MFR ↔ Finished Product item link" section for
the full mechanics and the new `mfr_definitions.finished_product_item_id`
column added by `0010_mfr_finished_product_link.sql`). This supersedes the
FB-0002 behavior described above, where `processed` was a normal
Item-Master-creatable category alongside Raw material/Packaging — that is no
longer true for *creation*; existing `processed` items (including ones
created directly through Item Master before this change) are still fully
visible and editable here, just with Category locked.

`deleteItem()`'s foreign-key-violation message was also extended to mention
MFR records (an item linked to an MFR via `finished_product_item_id` can't
be deleted while that MFR exists), matching the "or MFR" addition already
reflected in the Files/Referenced-by note below.

**Task F addendum (3 Sept 2026):** a fourth category, `packaged_fp`
("Packaged finished product"), is locked the exact same way — created
only as a side effect of `createMfrDefinition()` (alongside the
`processed` item it pairs with, via the new `items.packaged_item_id`),
never through this screen, Category read-only once set. See
`docs/modules/mfr.md`'s Task F addendum and
`docs/modules/packaging.md`'s "Packaged Finished Product" section.

## Gap closed

`default_qc_qty` / `default_stability_qty` / `default_rnd_qty` are fully
editable fields on this screen (not just DB columns with no UI, which was
gap #1 in the requirements review) — they pre-fill the Purchase screen's
QC/Stability/R&D quantity fields, per DESIGN.md §7.1.

**Superseded 2 Sep 2026 — see "Sampling & stock defaults removed" below.**
The New/Edit forms no longer capture these at item-creation time at all;
QC/Stability/R&D quantity is now entered fresh per batch, at the point
where it's actually known.

## Sampling & stock defaults removed from Item Master (2 Sept 2026)

Per direct request ("while creating new item entry no need to capture
QC/Stability/R&D Quantity - it will be done at Purchase screen" — clarified
to remove the whole section, including Default sample unit, since with no
QC/Stability/R&D qty left to share a unit with, a unit-only default has
nothing left to convert): the "Sampling & stock defaults" section (Default
QC qty, Default stability qty, Default R&D qty, Default sample unit) is
gone from both the New and Edit item forms, and from the read-only detail
view. Low stock threshold — visually grouped with those four fields before,
but unrelated (it drives the topbar low-stock banner, not sampling) — moved
into the main field grid on both forms instead of being removed.

The underlying `items.default_qc_qty` / `default_stability_qty` /
`default_rnd_qty` / `default_sample_unit` columns are untouched — no
migration, no data change. `createItem()` simply no longer sets them (they
insert as `null` on every new item going forward, same as if the columns
didn't exist from that item's point of view). `updateItem()` was changed to
stop including all four in its update payload entirely, rather than reading
empty values from a form that no longer sends them — the difference
matters: reading-and-writing `null` would have silently wiped these values
on every legacy item on its very next edit (even a name-only change),
whereas simply not touching the columns leaves whatever a legacy item
already had exactly as it was. Existing items that had these set keep
them; the fields are just no longer visible or editable on this screen.

Where QC/Stability/R&D quantity is captured instead:
- **Raw material / Packaging** — already handled, no change needed. The
  Purchase Add-line/Edit-line form (`purchase-line-form.tsx`) has captured
  `qc_qty` / `stability_qty` / `rnd_qty` directly on each purchase line
  since FB-0007/FB-0017 (the "Automatic Sampling Deduction" feature,
  DESIGN.md §7.1) — deducted from that line's `remaining_qty` the moment
  the line is entered. It already pre-fills from an item's
  `default_qc_qty` etc. *when set* and falls back to `"0"` / the line's own
  unit when not — so an item with no defaults (every new item, from now
  on) behaves exactly like one whose defaults were filled in and left at
  zero. No code change was needed here.
- **Finished Product** — open, tracked separately. Unlike Purchase,
  `finished_product_batches` only has a single `qc_sample_qty` column
  (captured on the Complete Batch screen, `complete-batch-form.tsx`) — there
  is currently no `stability_qty` / `rnd_qty` equivalent anywhere in the
  Finished Product flow to move this into. Adding one is a genuinely new
  feature (new columns, new form fields, and a decision about whether/how
  they deduct from the batch's `net_qty`), not a relocation of existing
  UI — see `claude/known-issues.md` for the open item and design questions
  before it's built.

## Files

- `lib/actions/items.ts` — `createItem`, `updateItem` (Server Actions,
  `canWrite` re-checked server-side; unique-violation Postgres errors on
  `item_code`/`barcode` are translated to a plain-English message).
- `app/(dashboard)/items/page.tsx`, `new/page.tsx`, `[id]/page.tsx`,
  `item-form.tsx` (client form components, `useActionState`), `barcode.tsx`
  (inline Code128-B SVG renderer, pure function/component — not a scanner,
  not a print/label layout).

## Deviations / follow-ups

- **List shows inactive items too**, same reasoning as Item Type Master: the
  screen explicitly needs an Active column/badge, so filtering to
  `active=true` only would hide the exact rows that column exists to show.
- **Barcode SVG is best-effort, not scanner-verified.** `barcode.tsx`
  implements the standard Code128 Set B module-width table and checksum
  algorithm and renders bars at 2px/module, but it has not been print-tested
  against a physical barcode scanner in this pass — DESIGN.md §9 already
  flags physical scanner integration as out of scope pending Open Question
  15. If a real device rejects it, the fallback is trivial (swap the SVG for
  a plain text render of `item.barcode`, already the fallback path here for
  any value containing characters outside printable ASCII).
- Item type and unit are optional on both forms (the schema allows null for
  both `item_type_id` and `unit`) rather than required — the task brief
  listed them as dropdowns without marking them required, so validation
  matches the schema's own nullability rather than adding a stricter rule.
