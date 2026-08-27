# Module 4 — Vendor Master

Cross-reference: `docs/DESIGN.md` §4.3.

## Screens

| Route | Purpose |
|---|---|
| `/vendors` | List. `DataTable` of active vendors — code, name, mobile, phone, email. Search across all columns. "New vendor" button shown only if the signed-in user can write. |
| `/vendors/new` | Create form. |
| `/vendors/[id]` | Detail — the edit form for users with write access; a read-only field list for everyone else (read is open to any signed-in user per the cross-cutting rule in DESIGN.md §3). |

## Fields

`vendor_code` (auto, `get_next_vendor_code()` RPC — `V-0001`, read-only, shown once a vendor exists), `name` (required), `address`, `mobile`, `phone`, `email` (validated as an email when provided).

## Workflow

Straightforward CRUD, no soft-delete/deactivate action added in this pass (not requested in scope; list still filters `.eq("active", true)` per the shared convention so a future deactivate action needs no other change). Create redirects to the detail page on success; edit stays on the detail page and shows a success message inline.

## Role

Write (create/update) requires the `vendors` module key — `system_admin` or `inventory_manager`, matching `MODULE_WRITE_ROLES.vendors` in `lib/constants/roles.ts` and the `vendors_write` RLS policy in `0001_init.sql`. Every Server Action re-checks this before touching the database.

## Files

- `lib/actions/vendors.ts` — `createVendor`, `updateVendor` (Zod-validated, `use server`).
- `app/(dashboard)/vendors/page.tsx`, `app/(dashboard)/vendors/new/page.tsx`, `app/(dashboard)/vendors/[id]/page.tsx`
- `app/(dashboard)/vendors/vendor-form.tsx` — shared client form (create + edit).

## Deviations from the briefing

None.
