# Module 4 — Vendor Master

Cross-reference: `docs/DESIGN.md` §4.3.

## Screens

| Route | Purpose |
|---|---|
| `/vendors` | List **and** create, on one page (see "Add form and list share the page" below) — `DataTable` of active vendors (code, name, mobile, phone, email; search across all columns) beside an "Add new vendor" panel for users with write access. |
| `/vendors/[id]` | Detail — the edit form for users with write access, plus (system_admin only, as of the "delete access for all master data" follow-up to FB-0004) a two-step-confirm Delete control; a read-only field list for everyone else (read is open to any signed-in user per the cross-cutting rule in DESIGN.md §3). |

## Fields

`vendor_code` (auto, `get_next_vendor_code()` RPC — `V-0001`), `name` (required), `address`, `mobile`, `phone`, `email` (validated as an email when provided). On the Add-vendor panel, `vendor_code` is shown as a read-only preview of what the code *will* be (see "Add form and list share the page" below) rather than blank; on the edit screen it's the real, already-assigned code.

## Workflow

No soft-delete/deactivate action (not requested in scope; list still filters `.eq("active", true)` per the shared convention so a future deactivate action needs no other change). Create redirects back to the list (`/vendors?created=<vendor_code>`), which shows a one-time success banner and refreshes the list + next-code preview — not to a detail page, since the point of the combined screen is to stay put and add the next one. Edit stays on the detail page and shows a success message inline. A hard delete exists (system_admin only, see below) — since there's no deactivate UI to fall back on, the FK-violation message points at reassigning/removing the referencing purchase orders instead.

## Add form and list share the page (1 Sept 2026)

Per a direct request ("Add vendor functionality should be available in the
same screen as of Vendor page. The next assigned vendor code should be
visible in the add vendor page"), matching a screenshot of the old app's
paired add-form/list layout. Two changes, both mirroring patterns already
established elsewhere in the app:

- **Combined screen.** `/vendors/new` is gone; `NewVendorForm`
  (`vendor-form.tsx`) now renders inline on `/vendors` next to
  `VendorsTable`, same "add form and list share the page" layout Item Type
  Master already used (`item-types/page.tsx`). `vendor-form.tsx` is now
  three exports — `NewVendorForm`, `EditVendorForm` (renamed from the old
  single `VendorForm`, used only on `/vendors/[id]`), `DeleteVendorForm`
  (unchanged) — rather than one component branching on an optional
  `vendor` prop.
- **Next-code preview.** A new SQL function, `peek_next_vendor_code()`
  (`0012_peek_next_codes.sql` — see `docs/modules/items.md`'s matching
  section for the full rationale), reads the `vendor_code_seq` sequence's
  current state without calling `nextval()`, so the Add-vendor panel can
  show what code the vendor *will* get (e.g. `V-0093`) without burning a
  real number just to display it. `vendors/page.tsx` calls it once
  server-side (only when the panel will render at all) and passes the
  result into `NewVendorForm`. It's a preview, not a reservation: the
  actual code assigned on save still comes from `get_next_vendor_code()`
  (`nextval`) inside `createVendor()`, so it's always correct even if the
  preview went stale (e.g. two admins had the page open at once).

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
- `app/(dashboard)/vendors/page.tsx` — list + inline add form.
- `app/(dashboard)/vendors/[id]/page.tsx` — detail/edit.
- `app/(dashboard)/vendors/vendor-form.tsx` — `NewVendorForm`, `EditVendorForm`, `DeleteVendorForm` (the admin-only delete confirm).

## Deviations from the briefing

None.
