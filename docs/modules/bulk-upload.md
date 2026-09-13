# Module 19 — Bulk Data Upload

Not part of the original 15-module baseline. Requested by Ravi (13 Sept
2026): "create a link in admin panel to upload data... as bulk upload"
for Item Master, Vendor, Purchase, etc, with a standard downloadable
Excel template per module. Scoped via `AskUserQuestion` before any code
was written:

- **Modules (first pass)**: Item Master, Vendor Master, Item Type
  Master, and MFR — pure master/setup data with no ledger or workflow
  side effects. Purchase was deliberately **not** included this pass (a
  materially more complex multi-table shape — PO header + GST/pricing
  lines that push real `inventory_ledger` rows — left for a later,
  separately-scoped pass).
- **Codes**: always server-generated. A file's Item/Vendor/MFR/Purchase/
  Equipment/Dead Stock code column, if someone adds one, is never read —
  every template omits a code column entirely.
- **Errors**: all-or-nothing per file. If any row fails validation,
  nothing is imported; every row's problem is listed at once (not just
  the first).
- **Access**: gated by the same `canWrite()` role set each module's own
  create screen already uses — not admin-only.

**Modules (second pass, 13 Sept 2026)**: Ravi asked for the rest —
"can we have purchase, instrument and dead stock entries done as excel
as part of bulk upload utility we created." Purchase, Instrument/
Equipment Master, and Dead Stock Register added, same conventions above.
Scoped via `AskUserQuestion` before writing the Purchase RPC: a bulk-
uploaded purchase order always lands as a **Draft**, exactly like one
entered by hand — nothing touches `inventory_ledger` until someone opens
it and clicks Final Submit. Equipment and Dead Stock needed no scoping
question — they're flat, single-table master data with no workflow of
their own.

Migrations: `0037_bulk_upload_mfr.sql` (MFR), `0038_bulk_upload_purchase.sql`
(Purchase) — see "Why Purchase and MFR need a migration (and Equipment/
Dead Stock don't)" below.

## Screens
- `/bulk-upload` — one card per module the signed-in user has write
  access to (a user with no write access to any module sees a plain "no
  access" message instead of an empty page). Each card has a file
  picker, an "Upload" button, and a "Download template" link.
- `GET /api/bulk-upload/template/[module]` — streams that module's blank
  `.xlsx` template. Gated by the same `canWrite()` check as the upload
  itself (not just "signed in"), since several templates' Reference
  sheets embed live data from the database (active Item Types, Raw
  Material/Packaging item codes, active Vendor codes).

## Templates
Each template (`lib/bulk-upload/templates.ts`, via `exceljs`) has three
sheets: **Instructions** (plain-language rules, required columns marked
with `*`), the data sheet itself (bold header row + one filled-in
example row), and — for every module except Vendor Master, Item Type
Master, and Dead Stock Register — a **Reference** sheet listing the
valid Unit/Calibration Status values and/or the live active codes to
copy from (Item Type, Raw Material/Packaging item codes, Vendor codes),
so a filler never has to guess at a free-text value that has to match
exactly.

Column definitions (`lib/bulk-upload/schemas.ts`) are the single source
of truth for header text, read by both the template generator and the
upload parser — the two sides can't drift apart.

| Module | Required columns | Notable optional columns |
|---|---|---|
| Item Master | Name, Category (`Raw Material` / `Packaging`) | Item Type, Unit, Botanical Alias, Barcode, Low Stock Threshold |
| Vendor Master | Name | Address, Mobile, Phone, Email |
| Item Type Master | Description | — |
| MFR | MFR Name, Batch Size Qty, Batch Size Unit, Line Item Code, Line Quantity, Line Unit | Item Type |
| Purchase | Vendor Code, Invoice Number, Invoice Date, Purchase Type (`Raw Material` / `Packaging Item`), Item Code, Quantity, Unit | QC Qty, Stability Qty, R&D Qty, Sample Unit, Unit Price, GST % |
| Instrument / Equipment Master | Name | Room No, Section, Legacy Asset ID, Quantity, Calibration Status, Last/Next Calibration date |
| Dead Stock Register | Name of Article | Date of Purchase, Quantity, Purchase Price, Depreciation %, Resolution Date, Rejected Qty/Value, Balance Qty/Value, Remark |

MFR and Purchase share the same flat-file wrinkle: one row is one
recipe/purchase line, so a record with several lines is several rows
repeating the exact same grouping key — **MFR Name** for MFR; **Vendor
Code + Invoice Number** (with **Invoice Date** also expected to repeat)
for Purchase. The upload groups rows into one MFR/purchase order by
matching that key exactly, and errors if a repeated key's other header
values (Batch Size Qty/Unit/Item Type for MFR; Invoice Date for
Purchase) don't match row-for-row. Equipment and Dead Stock have no such
wrinkle — one row is always one complete record.

## Validation and import (`lib/actions/bulk-upload.ts`)
1. `canWrite(user.roles, module)` — same gate as that module's own
   create screen.
2. Parse the first sheet (`lib/bulk-upload/parse.ts`, via `exceljs`);
   confirm every required column header is present (case-insensitive,
   trimmed) — a friendly "did you use the downloaded template?" error if
   not.
3. Row cap: 500 data rows per file (`MAX_UPLOAD_ROWS`) — bounds
   worst-case request time; split a bigger file and upload in batches.
   For Purchase, that's 500 purchase **lines** per file (not 500
   purchase orders), same as MFR counting recipe lines, not MFR
   definitions.
4. Validate every row against live reference data and collect **every**
   row's errors — not just the first — before touching the database. Any
   error at all ⇒ nothing is imported; the full list is shown back to the
   uploader. Specifically checked, per module:
   - **Item Master**: Category must resolve to Raw Material or Packaging
     (accepts "Raw Material"/"Raw", "Packaging"/"Packing Material"/
     "Packing" — anything else fails); Unit, if given, must be one of the
     app's canonical units; Item Type, if given, must match an existing
     **active** Item Type Master description; Barcode, if given, must be
     unique both within the file and against every barcode already on an
     existing item (checked up front — a specific row is named, not a
     generic failure after the fact); Low Stock Threshold, if given, must
     be a non-negative number.
   - **Vendor Master**: Email, if given, must look like a valid email
     address.
   - **Item Type Master**: Description must be unique both within the
     file and against every existing item type description
     (case-insensitive — `item_types.description`'s DB uniqueness is
     case-sensitive, so this closes a near-duplicate gap the constraint
     itself wouldn't catch).
   - **MFR**: Batch Size Qty and Line Quantity must be numbers greater
     than 0; Batch Size Unit and Line Unit must be valid units; Item
     Type, if given, must match an existing active Item Type Master
     description; Line Item Code must match an existing **active Raw
     Material** item code (an inactive item, a Packaging/Finished
     Product item, or an unknown code are all rejected the same way);
     every row sharing one MFR Name must repeat identical Batch Size
     Qty/Unit/Item Type; the same Line Item Code can't appear twice under
     one MFR Name (a likely copy-paste slip — combine into one line
     instead, since two separate lines for the same ingredient would
     silently double-count it at production time).
   - **Purchase**: Vendor Code must match an existing active vendor;
     Invoice Date must be a real date; Purchase Type must resolve to Raw
     Material or Packaging Item; Item Code must match an existing
     **active** item **of that same category** (a Raw Material row can't
     reference a Packaging item and vice versa); Quantity must be a
     number greater than 0 and Unit a valid unit; QC Qty/Stability Qty/
     R&D Qty/Sample Unit are rejected outright on a Packaging Item line
     (they only apply to Raw Material) and, when given on a Raw Material
     line, are converted from Sample Unit into the line's own Unit
     (`convertUnit()`, mirroring `createPurchaseLine()`'s own FB-0017
     logic) with the same QC+Stability+R&D ≤ Quantity bound enforced
     after conversion; Unit Price/GST %, if given, must be non-negative;
     every row sharing one Vendor Code + Invoice Number must repeat the
     same Invoice Date. Every purchase order created this way lands as a
     **Draft** — see the migration section below.
   - **Instrument / Equipment Master**: Name is required; Quantity, if
     given, must be a number greater than 0 (defaults to 1); Calibration
     Status, if given, must resolve to Calibrated/Due/Not Applicable;
     Last/Next Calibration dates, if given, must be real dates.
   - **Dead Stock Register**: Name of Article is required; Quantity, if
     given, must be a number greater than 0 (defaults to 1);
     Depreciation %, if given, must be 0–100 (defaults to 25); Purchase
     Price/Rejected Qty/Rejected Value/Balance Qty/Balance Value, if
     given, must be non-negative numbers; Date of Purchase/Resolution
     Date, if given, must be real dates.
5. Only once every row passes: Item Master, Vendor Master, Item Type
   Master, Equipment, and Dead Stock generate any needed codes (one
   `get_next_item_code()` / `get_next_vendor_code()` /
   `get_next_equipment_code()` / `get_next_dead_stock_code()` RPC round
   trip per row, sequentially) and then issue **one** multi-row
   `insert()` — already a single atomic Postgres statement, so "all rows
   or none" for the actual write is free once validation has passed.
   MFR and Purchase each call their own bulk RPC once with the whole
   file's parsed, grouped payload
   (`bulk_create_mfr_definitions()` / `bulk_create_purchase_orders()`).

## Why Purchase and MFR need a migration (and Equipment/Dead Stock don't)
`createMfrDefinition()` (`lib/actions/mfr.ts`) shows the general problem:
one MFR is five separate inserts/updates across three tables (Finished
Product item → Packaged FP item → pairing update → `mfr_definitions` →
`mfr_lines`), each with manual best-effort rollback of the others on
failure, because the Supabase client gives no real multi-statement
transaction. Purchase has the same shape at a smaller scale: one
purchase order is a header row plus one-or-more line rows. That's an
acceptable shape for one record submitted by hand, but a bulk file can
contain many — "all-or-nothing across the whole file" done the same
one-call-at-a-time way would mean a failure on record #8 leaves records
#1–7 already committed, exactly the partial-import outcome Ravi's
error-handling choice rules out.

Equipment and Dead Stock don't have this problem: both are flat,
single-table master data with no cross-table references, the same shape
as Vendor Master, so a loop of code-generation RPC calls followed by one
multi-row insert is already atomic for the whole file — no new RPC
needed, same reasoning as Item/Vendor/Item Type Master in the first
pass.

`bulk_create_mfr_definitions(p_payload jsonb)` and
`bulk_create_purchase_orders(p_payload jsonb)` are both `security
definer` Postgres functions — the project's established pattern for
multi-step transactional business logic (`record_wastage()`,
`submit_purchase_order()`, `check_sufficient_stock()`). A function body
runs inside the caller's transaction, so any `raise exception` anywhere
in its loop rolls back every insert the call has made so far — true
all-or-nothing across every record in the file.

Verified locally for both (fresh `invento_test`, all 38 migrations
replayed, a hand-built `auth` schema stub, direct RPC calls via `select
set_config('request.jwt.claim.sub', '<uuid>', false)`):
- MFR: a 3-MFR payload where the 3rd MFR has an invalid line rolls back
  all 3, including the first two which were individually valid.
- Purchase: a 2-purchase-order payload where the 2nd order has an
  invalid line (quantity ≤ 0) rolls back both, including the first order
  which was individually valid and would otherwise have landed. A
  separate valid 2-PO/3-line payload landed correctly — both orders
  `status = 'draft'`, `submitted_at` null, batch numbers auto-generated
  (`RM-01/26`, `PKG-01/26`, ...), `remaining_qty`/`live_remaining_qty`
  computed correctly, and zero `inventory_ledger` rows written — Draft
  really does need no special-case suppression code, since
  `purchase_orders.status` already defaults to `'draft'` and the
  trigger that used to push a line straight to the ledger was already
  dropped by `0019_purchase_submit_workflow.sql` (FB-0018). A
  non-privileged test user was rejected with "Not authorized to
  bulk-create purchase orders." by the RPC's own role check.

**Accepted caveat**: `get_next_item_code()`/`get_next_mfr_code()`/
`get_next_po_number()`/`get_next_batch_number()` all call `nextval()` on
a real sequence (or, for batch numbers, a `count(*)+1` computation), and
neither is undone by a transaction rollback — the same non-transactional
gap already tolerated elsewhere in this app (batch-number retries in
`createPurchaseLine()`). A file that fails validation partway through a
multi-record RPC call rolls back every row, but the code/PO numbers
already generated for the records before the failing one are still
"spent." Cosmetic gap in the number sequence only, not a data-integrity
issue — confirmed locally for both: `mfr_code_seq` advanced by 3 across
a failed 3-MFR call even though zero rows landed, and, in the Purchase
verification above, the PO number sequence skipped from `PO-0002`
straight to `PO-0005` across one rolled-back 2-order call plus one
successful single-order call afterward — a visible gap, never a
duplicate or a silent renumbering.

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
(Item Master/Vendor/Item Type/Equipment/Dead Stock inserts go through
the same tables and policies as their one-at-a-time create screens;
MFR's and Purchase's RPCs each re-check their own role set themselves —
`has_any_role('system_admin', 'mfr_manager')` for MFR,
`has_any_role('system_admin', 'inventory_manager')` for Purchase, same
sets as `mfr_def_write`/`mfr_lines_write` and `po_insert`/`pl_insert`).

## Not done in this pass
- No partial/best-effort import mode — all-or-nothing only, per Ravi's
  choice.
- No re-upload of a corrected file pre-fills previously-valid rows —
  a rejected file is fixed and re-uploaded from scratch.
- Purchase bulk upload never auto-submits — every purchase order it
  creates lands as a Draft and still needs a human to open it and click
  Final Submit before anything reaches inventory, even for a file that
  passed every check (Ravi's explicit scoping choice, not a limitation
  to lift later).
