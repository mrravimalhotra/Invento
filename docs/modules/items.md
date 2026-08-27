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
  Active. A category filter (All / Raw material / Packaging / Processed) is
  implemented as tab links (`?category=`), server-rendered, not blocking
  core CRUD. "New item" button shown only when `canWrite(user.roles,
  "items")`.
- **New** — `/items/new`. Fields: Name (required), Botanical alias,
  Category (select: Raw material / Packaging **only** — Processed items are
  created by the Finished Product flow, not this screen, per the task
  brief), Item type (dropdown of `item_types`, active ones), Unit (dropdown
  from `lib/constants/units.ts` `UNITS`), Default QC/Stability/R&D qty
  (numeric, optional), Low stock threshold (numeric, optional), Barcode
  (free text, optional, unique). `item_code` is **not** shown on this
  screen — it doesn't exist yet: the Server Action calls
  `supabase.rpc("get_next_item_code", { p_category })` at insert time (never
  generated client-side, per the briefing), then redirects to the new
  item's detail page where the generated code is visible.
- **Detail/Edit** — `/items/[id]`. Same fields, all editable, plus:
  - A read-only "Stock on hand" stat card computed from `stock_balance.on_hand`.
  - A read-only "Low stock" stat (Yes/No).
  - A read-only "Item code" stat (the field is never editable after
    creation).
  - Category stays a Raw material/Packaging select **unless** the item's
    current category is already `processed` (created elsewhere), in which
    case the field is locked — this screen can move an item between
    raw/packaging but can never set or clear `processed`.
  - A Barcode panel: if the item has a `barcode` value, it's rendered as an
    inline Code128 (Set B) SVG generated in `app/(dashboard)/items/barcode.tsx`
    (no external service/library, per DESIGN.md §9) with the human-readable
    value underneath; otherwise "No barcode on file."
  - Read-only view (no form) if the signed-in user can't write this module.

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
