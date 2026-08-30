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
- **New** — `/items/new`. Fields: Name (required), Botanical alias,
  Category (select: Raw material / Packaging / Finished product — as of
  FB-0002, `processed` is a normal creatable category, not something only
  the Finished Product flow can set), Item type (dropdown of `item_types`,
  active ones), Unit (dropdown from `lib/constants/units.ts` `UNITS`),
  Default QC/Stability/R&D qty (numeric, optional), Default sample unit
  (dropdown, optional — see FB-0002 note below), Low stock threshold
  (numeric, optional), Barcode (free text, optional, unique). `item_code` is
  **not** shown on this screen — it doesn't exist yet: the Server Action
  calls `supabase.rpc("get_next_item_code", { p_category })` at insert time
  (never generated client-side, per the briefing), then redirects to the new
  item's detail page where the generated code is visible. As of
  `0007_item_code_fp_and_sample_unit.sql`, codes are 5-digit and 3-way:
  `RM-00001` (raw), `PKG-00001` (packaging), `FP-00001` (processed/finished
  product, its own sequence).
- **Detail/Edit** — `/items/[id]`. Same fields, all editable, plus:
  - A read-only "Stock on hand" stat card computed from `stock_balance.on_hand`.
  - A read-only "Low stock" stat (Yes/No).
  - A read-only "Item code" stat (the field is never editable after
    creation).
  - Category is a free Raw material / Packaging / Finished product select —
    as of FB-0002 there's no longer a locked state; any item can move
    between all three.
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

## Gap closed

`default_qc_qty` / `default_stability_qty` / `default_rnd_qty` are fully
editable fields on this screen (not just DB columns with no UI, which was
gap #1 in the requirements review) — they pre-fill the Purchase screen's
QC/Stability/R&D quantity fields, per DESIGN.md §7.1.

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
