# Module 2 — Item Type Master

Cross-reference: `docs/DESIGN.md` §4.1 (schema), §6 (route map), §8 (UI system).

## Role

Write (`item_types` in `MODULE_WRITE_ROLES`): `system_admin`, `inventory_manager`,
`mfr_manager` — mirrors the RLS policy `item_types_write` in
`0001_init.sql`. Read is open to any signed-in user, per the cross-cutting
rule in DESIGN.md §3.

## Screens

- **List + Add** — `/item-types` (`app/(dashboard)/item-types/page.tsx`). Two
  columns when the signed-in user can write this module: an "Add new item
  type" form (just the Description field — `item_types.description`, `unique
  not null` in the schema; a duplicate submit surfaces "An item type with
  this description already exists." translated from the Postgres `23505`
  error) alongside the `DataTable` with columns ItemType (links to the edit
  screen), Status (Active/Inactive badge), Created, and Actions (View / Edit
  link). Redesigned 30 Aug 2026 (per tester feedback FB-0001 and a follow-up
  request) to put the add form directly on the list page instead of a
  separate `/new` route — one fewer click/page-round-trip to add an item
  type. The old `/item-types/new` route was removed; nothing else linked to
  it.
- **Edit** — `/item-types/[id]`. Same Description field plus an Active
  checkbox (soft-delete toggle), plus (as of FB-0004, system_admin only) a
  two-step-confirm Delete control below the edit form. Read-only view
  (status line, no form) if the signed-in user can't write this module.

## FB-0004 (1 Sep 2026) — Admin-only delete

Adds `deleteItemType()` in `lib/actions/item-types.ts`, gated tighter than
the other item-type actions: `canWrite()` allows `system_admin`,
`inventory_manager` and `mfr_manager`, but this ticket specifically asked
for delete to be Admin-only, so the action checks
`user.roles.includes("system_admin")` directly. `[id]/page.tsx` computes
`isSystemAdmin` the same way and only then renders `DeleteItemTypeForm`
(`item-type-form.tsx`) — a plain Delete button that expands into a
"Delete X? This can't be undone." confirm step before submitting.

`item_types.id` is referenced by `items.item_type_id` with the default
`ON DELETE RESTRICT`, so deleting an in-use item type raises Postgres
`23503` (foreign_key_violation); the action catches that and returns
"Can't delete — one or more items in Item Master still use this item type.
Reassign or remove those items first, or deactivate this item type
instead." rather than a raw DB error.

`0008_item_type_delete_policy.sql` splits the old single `item_types_write`
("for all", same three roles) RLS policy into separate insert/update
policies (unchanged, same three roles) and a new `item_types_delete` policy
restricted to `system_admin` — so the RLS backstop agrees with the app
check, per the briefing's "app checks are UI-affordance only, RLS is the
real backstop" convention.

## Files

- `lib/actions/item-types.ts` — `createItemType`, `updateItemType`,
  `deleteItemType` (Server Actions; all three re-check roles server-side
  even though RLS is the real backstop, per the briefing).
- `app/(dashboard)/item-types/page.tsx`, `[id]/page.tsx`, `item-type-form.tsx`
  (client form components, `useActionState`; `NewItemTypeForm` is rendered
  inline on `page.tsx`, not on its own route; `DeleteItemTypeForm` is
  rendered on `[id]/page.tsx` only for `system_admin`).

## Deviation from the briefing

The briefing's default rule is "every list screen queries `.eq('active',
true)`". This list intentionally shows **both** active and inactive rows,
because the whole point of this screen (per the task brief: "list +
create/edit … active badge") is to manage the active/inactive toggle itself —
filtering to active-only would make inactive item types unreachable from the
UI once deactivated. Flagging this as a deliberate deviation, not an
oversight.
