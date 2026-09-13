# Module 19 — Bulk Data Upload

Not part of the original 15-module baseline. Requested by Ravi (13 Sept
2026): "create a link in admin panel to upload data... as bulk upload"
for Item Master, Vendor, Purchase, etc, with a standard downloadable
Excel template per module. Scoped via `AskUserQuestion` before any code
was written:

- **Modules**: Item Master, Vendor Master, Item Type Master, and MFR —
  pure master/setup data with no ledger or workflow side effects.
  Purchase is deliberately **not** included this pass (a materially more
  complex multi-table shape — PO header + GST/pricing lines that push
  real `inventory_ledger` rows — left for a later, separately-scoped
  pass).
- **Codes**: always server-generated. A file's Item/Vendor/MFR code
  column, if someone adds one, is never read — every template omits a
  code column entirely.
- **Errors**: all-or-nothing per file. If any row fails validation,
  nothing is imported; every row's problem is listed at once (not just
  the first).
- **Access**: gated by the same `canWrite()` role set each module's own
  create screen already uses — not admin-only.

Migration: `0037_bulk_upload_mfr.sql` (MFR only — see "Why only MFR
needs a migration" below).

## Screens
- `/bulk-upload` — one card per module the signed-in user has write
  access to (a user with no write access to any of the four sees a
  plain "no access" message instead of an empty page). Each card has a
  file picker, an "Upload" button, and a "Download template" link.
- `GET /api/bulk-upload/template/[module]` — streams that module's blank
  `.xlsx` template. Gated by the same `canWrite()` check as the upload
  itself (not just "signed in"), since the template's Reference sheet
  embeds live Item Type / active Raw Material data from the database.

## Templates
Each template (`lib/bulk-upload/templates.ts`, via `exceljs`) has three
sheets: **Instructions** (plain-language rules, required columns marked
with `*`), the data sheet itself (bold header row + one filled-in
example row), and — for Item Master and MFR — a **Reference** sheet
listing the valid Unit values and the live active Item Type / Raw
Material item codes to copy from, so a filler never has to guess at a
free-text value that has to match exactly.

Column definitions (`lib/bulk-upload/schemas.ts`) are the single source
of truth for header text, read by both the template generator and the
upload parser — the two sides can't drift apart.

| Module | Required columns | Notable optional columns |
|---|---|---|
| Item Master | Name, Category (`Raw Material` / `Packaging`) | Item Type, Unit, Botanical Alias, Barcode, Low Stock Threshold |
| Vendor Master | Name | Address, Mobile, Phone, Email |
| Item Type Master | Description | — |
| MFR | MFR Name, Batch Size Qty, Batch Size Unit, Line Item Code, Line Quantity, Line Unit | Item Type |

MFR is the one flat-file wrinkle: one row = one recipe line, so an MFR
with several ingredients is several rows repeating the exact same **MFR
Name** (and the same Batch Size Qty / Unit / Item Type) — the upload
groups rows into one MFR by matching MFR Name text exactly, and errors
if a repeated name's header values don't match row-for-row.

## Validation and import (`lib/actions/bulk-upload.ts`)
1. `canWrite(user.roles, module)` — same gate as that module's own
   create screen.
2. Parse the first sheet (`lib/bulk-upload/parse.ts`, via `exceljs`);
   confirm every required column header is present (case-insensitive,
   trimmed) — a friendly "did you use the downloaded template?" error if
   not.
3. Row cap: 500 data rows per file (`MAX_UPLOAD_ROWS`) — bounds
   worst-case request time; split a bigger file and upload in batches.
4. Validate every row against live reference data (active Item Types,
   active Raw Material item codes) and collect **every** row's errors —
   not just the first — before touching the database. Any error at all
   ⇒ nothing is imported; the full list is shown back to the uploader.
5. Only once every row passes: Item Master, Vendor Master, and Item Type
   Master generate any needed codes (one `get_next_item_code()` /
   `get_next_vendor_code()` RPC round trip per row, sequentially) and
   then issue **one** multi-row `insert()` — already a single atomic
   Postgres statement, so "all rows or none" for the actual write is
   free once validation has passed. MFR calls the
   `bulk_create_mfr_definitions()` RPC once with the whole file's parsed
   payload.

## Why only MFR needs a migration
`createMfrDefinition()` (`lib/actions/mfr.ts`) already shows why: one
MFR is five separate inserts/updates across three tables (Finished
Product item → Packaged FP item → pairing update → `mfr_definitions` →
`mfr_lines`), each with manual best-effort rollback of the others on
failure, because the Supabase client gives no real multi-statement
transaction. That's an acceptable shape for one MFR submitted by hand,
but a bulk file can contain many MFRs — "all-or-nothing across the whole
file" done the same one-call-at-a-time way would mean a failure on MFR
#8 leaves MFRs #1-7 already committed, exactly the partial-import
outcome Ravi's error-handling choice rules out.

`bulk_create_mfr_definitions(p_payload jsonb)` is a `security definer`
Postgres function — the project's established pattern for multi-step
transactional business logic (`record_wastage()`,
`submit_purchase_order()`, `check_sufficient_stock()`). A function body
runs inside the caller's transaction, so any `raise exception` anywhere
in its loop rolls back every insert the call has made so far — true
all-or-nothing across every MFR in the file, verified locally (fresh
`invento_test`, all 37 migrations replayed): a 3-MFR payload where the
3rd MFR has an invalid line rolls back all 3, including the first two
which were individually valid.

**Accepted caveat**: `get_next_item_code()`/`get_next_mfr_code()` call
`nextval()` on a real sequence, and sequence advances are **not**
undone by a transaction rollback — same non-transactional-sequence gap
already tolerated elsewhere in this app (batch-number retries). A file
that fails validation partway through a multi-MFR RPC call rolls back
every row, but the code numbers already generated for the MFRs before
the failing one are still "spent." Cosmetic gap in the code sequence
only, not a data-integrity issue — confirmed locally (`mfr_code_seq`
advanced by 3 across a failed 3-MFR call even though zero rows landed).

## Dependency note
Parsing/generating `.xlsx` uses `exceljs`, not the more commonly-seen
`xlsx`/SheetJS package. `xlsx@0.18.5` (the latest version installable
from the default npm registry) carries two unpatched high-severity CVEs
— Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS
(GHSA-5pgg-2g8v-p4x9) — both squarely in this feature's threat model
(parsing untrusted files uploaded by any user with module write access,
not just admins). `exceljs` has no equivalent CVE for that threat model;
it does carry two moderate transitive advisories via its `uuid`
dependency (GHSA-w5hq-g745-h8pq), assessed as low/non-applicable risk
(only reachable via an explicit `buf` argument `exceljs`'s own internal
usage doesn't pass) and accepted rather than downgrading `exceljs`
(which would be a breaking change).

## Role / access
No new role or RLS policy — each module's upload reuses that module's
existing `canWrite()` set and existing RLS-enforced write policy exactly
(Item Master/Vendor/Item Type inserts go through the same
`items`/`vendors`/`item_types` tables and policies as their one-at-a-
time create screens; MFR's RPC re-checks `has_any_role('system_admin',
'mfr_manager')` itself, same set as `mfr_def_write`/`mfr_lines_write`).

## Not done in this pass
- Purchase bulk upload — deliberately out of scope (see above).
- No partial/best-effort import mode — all-or-nothing only, per Ravi's
  choice.
- No re-upload of a corrected file pre-fills previously-valid rows —
  a rejected file is fixed and re-uploaded from scratch.
