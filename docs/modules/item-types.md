# Module 2 — Item Type Master

Cross-reference: `docs/DESIGN.md` §4.1 (schema), §6 (route map), §8 (UI system).

## Role

Write (`item_types` in `MODULE_WRITE_ROLES`): `system_admin`, `inventory_manager`,
`mfr_manager` — mirrors the RLS policy `item_types_write` in
`0001_init.sql`. Read is open to any signed-in user, per the cross-cutting
rule in DESIGN.md §3.

## Screens

- **List** — `/item-types` (`app/(dashboard)/item-types/page.tsx`). `DataTable`
  with columns Description (links to the edit screen) and Status (Active/Inactive
  badge). "New item type" button shown only when `canWrite(user.roles,
  "item_types")`.
- **New** — `/item-types/new`. Single required field: Description
  (`item_types.description`, `unique not null` in the schema — a duplicate
  submit surfaces "An item type with this description already exists."
  translated from the Postgres `23505` error).
- **Edit** — `/item-types/[id]`. Same Description field plus an Active
  checkbox (soft-delete toggle). Read-only view (status line, no form) if the
  signed-in user can't write this module.

## Files

- `lib/actions/item-types.ts` — `createItemType`, `updateItemType` (Server
  Actions; both re-check `canWrite` server-side even though RLS is the real
  backstop, per the briefing).
- `app/(dashboard)/item-types/page.tsx`, `new/page.tsx`, `[id]/page.tsx`,
  `item-type-form.tsx` (client form components, `useActionState`).

## Deviation from the briefing

The briefing's default rule is "every list screen queries `.eq('active',
true)`". This list intentionally shows **both** active and inactive rows,
because the whole point of this screen (per the task brief: "list +
create/edit … active badge") is to manage the active/inactive toggle itself —
filtering to active-only would make inactive item types unreachable from the
UI once deactivated. Flagging this as a deliberate deviation, not an
oversight.
