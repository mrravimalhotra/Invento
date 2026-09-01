# Module 4 — Vendor Master

Cross-reference: `docs/DESIGN.md` §4.3.

## Screens

| Route | Purpose |
|---|---|
| `/vendors` | List. `DataTable` of active vendors — code, name, mobile, phone, email. Search across all columns. "New vendor" button shown only if the signed-in user can write. |
| `/vendors/new` | Create form. |
| `/vendors/[id]` | Detail — the edit form for users with write access, plus (system_admin only, as of the "delete access for all master data" follow-up to FB-0004) a two-step-confirm Delete control; a read-only field list for everyone else (read is open to any signed-in user per the cross-cutting rule in DESIGN.md §3). |

## Fields

`vendor_code` (auto, `get_next_vendor_code()` RPC — `V-0001`, read-only, shown once a vendor exists), `name` (required), `address`, `mobile`, `phone`, `email` (validated as an email when provided).

## Workflow

No soft-delete/deactivate action (not requested in scope; list still filters `.eq("active", true)` per the shared convention so a future deactivate action needs no other change). Create redirects to the detail page on success; edit stays on the detail page and shows a success message inline. As of the delete-access follow-up below, a hard delete exists (system_admin only) — since there's no deactivate UI to fall back on, the FK-violation message points at reassigning/removing the referencing purchase orders instead.

## Role

Write (create/update) requires the `vendors` module key — `system_admin` or `inventory_manager`, matching `MODULE_WRITE_ROLES.vendors` in `lib/constants/roles.ts` and the `vendors_insert`/`vendors_update` RLS policies in `0001_init.sql`/`0009_master_data_delete_policy.sql`. Every Server Action re-checks this before touching the database. Delete is tighter: `system_admin` only (see below), checked directly rather than through `canWrite()`.

## Admin-only delete (1 Sep 2026)

Extends FB-0004's item-type delete pattern here, per a direct follow-up
request ("provide delete access for all master data including vendor,
item etc to admin"). `deleteVendor()` in `lib/actions/vendors.ts` checks
`user.roles.includes("system_admin")` directly, and
`0009_master_data_delete_policy.sql` splits the old single `vendors_write`
RLS policy into insert/update (unchanged roles: `system_admin`,
`inventory_manager`) plus a `system_admin`-only delete policy. `vendors.id`
is referenced by `purchase_orders.vendor_id` (`ON DELETE RESTRICT`, the
Postgres default), so a vendor with any purchase order on file can't be
deleted — that raises Postgres `23503`, caught and translated to "Can't
delete — this vendor has purchase orders on file. Reassign or remove
those first."

## Files

- `lib/actions/vendors.ts` — `createVendor`, `updateVendor`, `deleteVendor` (Zod-validated where applicable, `use server`).
- `app/(dashboard)/vendors/page.tsx`, `app/(dashboard)/vendors/new/page.tsx`, `app/(dashboard)/vendors/[id]/page.tsx`
- `app/(dashboard)/vendors/vendor-form.tsx` — shared client form (`VendorForm` for create + edit, `DeleteVendorForm` for the admin-only delete confirm).

## Deviations from the briefing

None.
