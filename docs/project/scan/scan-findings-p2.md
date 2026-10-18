---
title: Scan findings — Phase 2 (master data)
---

# Phase 2 — Master data

Steps done: P2.1 to P2.5 (Phase 2 complete). Next: P3.1. (Rewritten whole after every step.)

## Findings

### SCAN-P2-01 — An item's category can be switched after it has stock, purchases, QC or recipes; the code prefix and the product pairing do not follow
- Severity: Medium
- Kind: Bug (inventory tightening)
- Where: Item Master → open an item → Category (`app/(dashboard)/items/[id]` form, `lib/actions/items.ts` `updateItem`, table `items`; trigger `trg_00_unit_locked_item` locks the unit but nothing locks the category)
- Finding: On a Raw Material or Packaging item the edit screen offers the Category list at all times. Switching Raw Material to Packaging (or back) is accepted even when the item already has purchase lines, ledger movements, QC records or a recipe line. The unit has a lock for exactly this reason (migration 0076); the category has none. What follows from a switch: the code keeps its old prefix (a Packaging item called RM-0042, or a Raw Material called PKG-00007); QC, COA-template and stock screens that filter by category treat the old batches differently; and a Raw Material that is the "production stock" paired to a Finished Product silently becomes a Packaging item while the pairing still points at it (the pairing check only runs when the pairing is set, not when the category changes later). Through the API directly, an Inventory or MFR Manager can also set the category of a Finished Product to Raw Material, bypassing the "Finished Product is created from MFR only" rule that exists only in the action.
- Evidence: Local database, as an Inventory Manager: category switch on an item with ledger rows and a purchase line was ALLOWED; Finished Product switched to raw was ALLOWED; paired production Raw Material switched to packaging was ALLOWED and the Finished Product then pointed at a packaging item. The same session's unit change was REFUSED by the lock. Script `claude/scan-evidence-p2.sql`; live check queries P2-A and P2-B in `claude/scan-data-checks.sql`.
- Suggested fix: Extend the unit-lock trigger idea to the category: refuse a category change once the item appears in the ledger, purchase lines, recipe lines, packaging issues, production issues, QC or pairing, with a plain message ("Category can't be changed once the item has records. Create a new item instead"). Also refuse any change to or from `processed` and `packaged_fp` at the database. On the screen, show Category as read-only text (like the unit) when the item has records. Size S (one migration, one test suite, one form tweak).
- Needs decision from Ravi: No
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P2-02 — Some item rules are enforced only on the screen: raw material without an item type, deactivating an item that still has stock
- Severity: Low
- Kind: Inventory tightening
- Where: `items` table (no CHECK on item type for raw materials), Item Master "Active" tick (`updateItem`)
- Finding: "Item type is required for a Raw Material" and "Unit is required" are checked in the server action only; the table accepts a raw item with no item type (tested: ALLOWED as an Inventory Manager). Separately, un-ticking Active on an item that still has stock, an open purchase order line or a place in an active recipe gives no warning and no block; the pickers hide inactive items, but the item keeps its stock and keeps showing in Stock Position, so it becomes stock nobody can purchase against, issue to production or see in the lists they use. The database does not stop a new purchase line on an inactive item (the picker is the only guard; not exercised here because the test PO was submitted).
- Evidence: Local database: item type set to null on a raw item with stock: ALLOWED; deactivate item with stock: ALLOWED. Live check P2-C finds existing cases.
- Suggested fix: (a) add a CHECK that a raw item has an item type, once P2-C shows no existing exceptions; (b) when deactivating, show "This item has N kg on hand and is used in M active recipes. Deactivate anyway?" (screen only, no migration). Size S.
- Needs decision from Ravi: Yes. Should an item with stock be allowed to be deactivated at all, or only when stock is zero?
- Confidence: Confirmed (item type, deactivation); Likely (inactive item on a draft PO line)
- Status: New (P1-14 covers the negative low-stock threshold only)

### SCAN-P2-03 — Duplicate checks are narrower than they look
- Severity: Low
- Kind: Data quality
- Where: `createItem` / `updateItem` (name), `item_types.description` unique constraint, `items.barcode`
- Finding: Item names are matched case-insensitively, but two spaces inside a name ("Ashwagandha  Root" against "Ashwagandha Root") or a trailing full stop make a different name, so a near-duplicate passes. Item type descriptions are unique only for the exact text, so "Powder" and "powder" can both exist, and each then appears separately in pick-lists and filters. A barcode is free text with no length or character check; one with characters outside plain printable ASCII is accepted and then cannot be drawn ("can't encode"). Database-level uniqueness for item names is already accepted (D26), so this is only about normalising before comparing.
- Evidence: Reading `createItem` / `updateItem` (`ilike` on the trimmed name) and the `item_types_description_key` constraint (plain UNIQUE, case-sensitive); the barcode renderer returns its "can't encode" message for non-ASCII. Live check P2-D lists current near-duplicates.
- Suggested fix: Compare names after squeezing repeated spaces and ignoring case; make the item type uniqueness case-insensitive (unique index on `lower(description)`) after merging any existing pair; restrict barcode to printable ASCII, 3 to 40 characters. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed (code); data impact unknown until P2-D is run
- Status: New (D26 accepts only the missing database constraint)

### SCAN-P2-04 — A vendor can never be made inactive; the only way out of the list is delete, which is blocked once a purchase order exists
- Severity: Medium
- Kind: Missing function (GMP vendor control)
- Where: Vendors (`app/(dashboard)/vendors/vendor-form.tsx`, `lib/actions/vendors.ts` `updateVendor`, `deleteVendor`); table `vendors.active`
- Finding: The vendors table has an `active` column and the purchase order screen only lists active vendors, but the vendor edit form has no Active tick and `updateVendor` never writes `active`. So every vendor stays selectable for new purchase orders for ever. A vendor who has been used cannot be deleted either (purchase orders point at it, and delete is System Admin only). In a GMP plant a supplier that fails an audit, stops trading or is disqualified must be stoppable without erasing its history. Items and item types have the Active tick; vendors do not. (There is no "approved vendor" status or qualification date either; that part is a wider gap and is carried to P9.1.)
- Evidence: `grep -n "active"` over `vendor-form.tsx`, `vendors/[id]/page.tsx` and `updateVendor` finds no Active control or write; `vendors/page.tsx:22` and `purchase/new/page.tsx:19` filter `.eq("active", true)`, so the column is read but never set to false by the app.
- Suggested fix: Add an Active tick on the vendor edit form and write it in `updateVendor` (same pattern as Item Master), show inactive vendors in a "Show inactive" view, and keep old purchase orders readable. Size S, no migration.
- Needs decision from Ravi: No (deactivation); Yes for the larger approved-vendor idea, which is for P9.1.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P2-05 — Editing a vendor's name or address changes how old purchase orders and labels print; contact details have no format checks
- Severity: Low
- Kind: Data integrity / formatting
- Where: `updateVendor`; `purchase/[id]` page and print, `labels/page.tsx` (vendor name read through the purchase order), `vendors` table
- Finding: A purchase order stores only the vendor's id, so the vendor name and address shown on an old purchase order and on a label are whatever the vendor record says today. Renaming a supplier (or correcting its address) therefore alters the paper trail of every earlier order and the vendor name on any label reprinted later. The audit log keeps the change, but the printed document does not show it. The COA is not affected: it keeps a copy of its header at the time of issue (`coa_records.header_data`). Contact fields are free text: a mobile number can contain letters, there is no length limit, and the e-mail is checked but not lower-cased, so the same vendor can be keyed twice with different spellings.
- Evidence: `purchase_orders` columns (vendor_id only, no name copy); `labels/page.tsx:82` and `coa/new/page.tsx:238` read `vendors(name)` live (the COA then stores it in `header_data`); `vendorSchema` in `lib/actions/vendors.ts` (name min 1, no other limits).
- Suggested fix: Cheapest: keep as is and add a line on the vendor edit screen ("Changing the name also changes how earlier purchase orders and labels print"). Fuller: copy vendor name and address onto the purchase order when it is submitted (one migration, backfill from today's vendor). Also add a length cap and a phone-number pattern. Size S (note and validation) or M (snapshot).
- Needs decision from Ravi: Yes. Warning note only, or snapshot the vendor details on the submitted purchase order?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P2-06 — An Excel file with a stray cell far down the sheet can freeze or crash a bulk upload (and the opening-stock upload)
- Severity: Medium
- Kind: Bug (reliability)
- Where: `lib/bulk-upload/parse.ts` `readFirstSheet` (loop `for (let r = 2; r <= sheet.rowCount; r++)`), used by all eight bulk uploads and by `lib/actions/opening-stock.ts`
- Finding: The reader walks every row number from 2 up to the sheet's last used row, asking for each row and cell, even if nearly all of them are empty. Excel files very often have a stray formatted or space-filled cell far below the data (select-all then set borders, a pasted blank, a filter range). Such a file is tiny but the sheet then reports a last row near 1,048,576, and the loop creates a row object for each one. In a test with a 6.5 KB file holding two real rows and one blank-looking cell at row 1,000,000, reading took about 6 seconds and about 1.9 GB of memory. On the hosting plan that is enough to run out of memory or time and return a server error instead of the upload result. The row-count limit of 500 is applied only after this loop, so it does not help. The MFR upload reads the file twice (Recipe and Procedure sheets), so it doubles the cost. The same shape could be produced on purpose by a signed-in user with a write role (the hosting platform would restart the function; no data is exposed or changed). The size cap on the request (1 MB) limits the file but not what it unpacks to.
- Evidence: Script `claude/scan-evidence-p2.sql` header notes; test run in the sandbox with the project's own ExcelJS 4.4.0: stray cell at A1000000 → `rowCount 1000000`, loop 6.0 s, heap 1.9 GB. The same file read with `sheet.eachRow({ includeEmpty: false })` took 38 ms and 14 MB and returned the same two rows.
- Suggested fix: Replace the numeric loop with `eachRow({ includeEmpty: false })` (only rows that really hold something), stop and show "this sheet has too many filled rows" once more than `MAX_UPLOAD_ROWS + 20` non-blank rows are seen, and treat cells that hold only spaces as blank. Size S, one file, no migration; add the stray-cell file as a test case.
- Needs decision from Ravi: No
- Confidence: Confirmed (sandbox measurement)
- Status: New

### SCAN-P2-07 — Bulk Purchase upload accepts lines with no Unit Price or GST %, although the one-at-a-time form requires both
- Severity: Medium
- Kind: Bug (rule not applied to a second entry path) / Inventory tightening
- Where: `lib/bulk-upload/schemas.ts:206-207` (Unit Price and GST % `required: false`), `bulkUploadPurchase`, `bulk_create_purchase_orders` (`nullif(...)::numeric`); compare `lib/actions/purchase.ts:227-237`
- Finding: On 15 Sept 2026 Ravi decided that unit price and GST % are mandatory on every purchase line, and the line form refuses a blank. The Excel upload still treats both columns as optional and stores blanks as nothing. Nothing later checks them: submitting the purchase order does not look at price or GST. So a purchase order loaded by Excel can be submitted, received and used with no price and no tax, and every value-based figure built on it (a stock value report, cost per batch) would silently leave those lines out or show zero.
- Evidence: Schema rows `{ header: "Unit Price (₹)", required: false }` and `{ header: "GST %", required: false }`; the RPC inserts `nullif(v_line->>'unit_price','')::numeric`; `submit` path has no price check. Live check P2-F counts existing purchase lines with no price or GST.
- Suggested fix: Mark both columns required in the upload schema and template (price may be 0, GST may be 0, as in the form), add the same row error text as the form, and make the database function refuse a null price or GST on new lines. Decide separately how to treat lines already saved without them (see the live check). Size S.
- Needs decision from Ravi: Yes. Confirm that the 15 Sept rule applies to Excel uploads too, and what to do with existing lines that have no price (leave, or fill by hand).
- Confidence: Confirmed (code); size of existing data unknown until P2-F is run
- Status: New (the 15 Sept decision is on record; the bulk path was not updated)

### SCAN-P2-08 — A file over 1 MB gives a server error rather than a message; there is no check for decompressed size
- Severity: Low
- Kind: Bug (error handling)
- Where: `next.config.ts` (no `serverActions.bodySizeLimit` set, default 1 MB), `app/(dashboard)/bulk-upload/upload-form.tsx` (no size check), opening-stock upload form
- Finding: Server Actions accept request bodies up to 1 MB by default (stated in the Next.js guide shipped in `node_modules`). A normal 500-row template is far below that, but a workbook with a logo, pasted pictures or heavy formatting can pass it. The browser then posts the whole file and the platform answers with a body-size error that the form does not catch, so the user sees the application's error page instead of "file too large". Opening-stock files for a real plant (several hundred items with many sheets) are the likeliest to hit it. Separately, there is no limit on how large the unpacked workbook may be; a small zip can unpack to far more than 1 MB.
- Evidence: `grep -rn "bodySizeLimit|serverActions" next.config.ts` finds nothing; docs line "Action requests are capped at 1MB by default"; upload form has `accept=".xlsx"` only. Not exercised on the live site (needs a large file; would be a live check).
- Suggested fix: Check `file.size` in the browser before posting (limit 800 KB, plain message), and set `serverActions.bodySizeLimit` to a deliberate value such as 4 MB for the upload pages. Size S.
- Needs decision from Ravi: No
- Confidence: Likely (documented limit; error screen not seen)
- Status: New (carried note from P1.5)

### SCAN-P2-09 — Small rule differences between the forms and the Excel uploads
- Severity: Low
- Kind: Data quality
- Where: `createMfrDefinition` / `create_mfr_definition` and `bulkUploadMfr`; `bulkUploadPurchase`; `purchase.ts` line schemas
- Finding: (1) The one-at-a-time MFR form and its database function do not check that the batch size unit is one of the app's units; the Excel upload does. Calling the function directly with the unit "tonne" was ALLOWED and stored; approving that MFR later would try to create a Finished Product item in "tonne", which the item table refuses with a cryptic message. The form's drop-down hides this in normal use. (2) In an MFR Excel file, two groups whose names differ only in capitals ("Ashwa Churna" and "ashwa churna") are treated as different MFRs, so both are created; the case-insensitive duplicate check runs against existing MFRs only. (3) GST % and unit price have a minimum (0) but no maximum anywhere (form, upload or table), so 1800 instead of 18 is accepted. (4) Dead stock rows may show a rejected quantity larger than the quantity bought, and the balance is a free number (a stated design choice; noted only because the Excel upload adds no check either).
- Evidence: Local database: `create_mfr_definition('Unit test MFR', 10, 'tonne', …)` returned an MFR code and stored "tonne" (script `claude/scan-evidence-p2.sql`, part 2). Code reading for the others.
- Suggested fix: Add the unit list check to `createMfrDefinition` and a CHECK on `mfr_definitions.batch_size_unit`; group MFR names in the upload by lower-case; add a sensible upper limit for GST % (100) and flag unusual unit prices on the screen. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed (1); Likely (2, 3: from code); informational (4)
- Status: New

### SCAN-P2-10 — The opening stock template lists item codes only (no names, no units), and a quantity typed in a different unit loads silently wrong
- Severity: Medium
- Kind: Inventory tightening (data-entry safety on a one-time load)
- Where: `lib/opening-stock/template.ts` (Reference sheet: "Active … item codes" and vendor codes only), `lib/opening-stock/columns.ts` ("In the item's own unit, as counted"), `validate.ts`, `load_opening_stock`
- Finding: Quantity is read as being in the item's own unit, but nothing on the sheet shows what that unit is: the Reference sheet gives only a list of item codes, with no item names and no units, and there is no Unit column in the data sheet. A person copying from old records ("Ashwagandha root, 250 g") has to guess which code is Ashwagandha and which unit that item is stocked in. If the item is kept in kg and they type 250, the load records 250 kg (the file passes every check, because 250 is a valid positive number). The Check-file result then shows only row counts (approved / pending / rejected), not what stock each item will receive, so the mistake is not visible before loading. A load can be undone only until any of its stock is used, and a wrong quantity found later has no correction path other than a manual adjustment. Opening stock is the single largest data entry in the project, done once.
- Evidence: Template builder writes `addReferenceColumn(ref, 1, "Active … item codes", itemCodes)` and a vendor-code column; no names or units. `OPENING_COLUMNS` has no Unit column. `submitOpeningStock` returns `{ checked: { kind, rows, approved, pending, rejected } }` only.
- Suggested fix: (1) Reference sheet: Item Code | Item Name | Unit for every active item. (2) Add a required Unit column to the data sheet, accepted only when it equals the item's unit (or converts to it, converting the quantity), and refuse the row otherwise with "Ashwagandha is kept in kg; you entered g". (3) After Check, show a short table per item: code, name, total quantity, unit, number of batches, so the loader can compare it with the old stock sheet before pressing Load. Size M (template, validator, result panel; no migration).
- Needs decision from Ravi: Yes. Should the Unit column be mandatory with conversion (recommended), or only shown on the Reference sheet?
- Confidence: Confirmed (code); consequence assumes the loader mis-keys the unit, which is exactly the risk a template is meant to prevent
- Status: New

### SCAN-P2-11 — The opening stock page does not show who loaded each file, and the uploaded file is not kept
- Severity: Low
- Kind: Audit / traceability
- Where: `app/(dashboard)/opening-stock/page.tsx` (list of loads: number, kind, rows, summary, date), `opening_loads` table
- Finding: The list of loads shows the load number, type, row count, a summary and the date, but not the person who loaded it and not what was in it. The person is recorded in the audit log, and each load's purchase orders (OPN-0001-01) can be found in Purchase, so the information exists, but a reviewer or auditor looking at "OPN-0003" cannot see from this page who loaded it, cannot download the rows, and cannot compare against the original Excel because the file itself is not stored. For a plant that will be inspected, the ability to show "this opening stock came from this file, loaded by this person on this date" is the normal expectation. The legacy QC records created by a load name the loader as both checker and reviewer, with the comment "Legacy record, loaded as opening stock OPN-xxxx"; they are flagged legacy and excluded from the two-person checks, so this is by design, but anyone reading a single QC record sees the loader as having done the QC.
- Evidence: Query on the page selects `id, load_no, kind, row_count, summary, created_at` (no creator); `load_opening_stock` inserts QC rows with `checker_by = reviewed_by = auth.uid()`.
- Suggested fix: Add "Loaded by" to the list, a "Download rows" link per load (built from the load's purchase lines or finished-product batches), and store the uploaded file in a private storage bucket (or at least its name and a checksum) against the load. Size S to M.
- Needs decision from Ravi: Yes. Keep a copy of every uploaded opening stock file (needs a storage bucket), or only show who/when?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P2-12 — Any user, including a read-only one, can change their own display name to anything, including another person's name; history shows the new name everywhere
- Severity: Medium
- Kind: Audit / data integrity
- Where: My Profile (`updateProfile` in `lib/actions/auth.ts`), table `profiles` (policy `profiles_self_write`: a user may update their own row); every screen that shows a person: QC record (assigned / checked / reviewed by), Audit list, MFR "Approved by", Ledger, COA template history
- Finding: The profile screen lets every signed-in user edit their full name. There is no length limit (a 5,000-character name was accepted), no uniqueness (a user can take another person's exact name), and no approval. Every place in the app that says who did something looks the name up at the moment of display, from this one editable field; none of them shows the e-mail or keeps the name as it was when the action happened. So (a) a Quality Checker can rename themselves to the QC Head's name and their entries then read as the Head's; (b) renaming changes how every earlier action by that person is displayed, including on the Audit screen, which shows the name only; (c) a very long name breaks table layouts wherever it appears. The record behind each action still holds the true user id, and the profile change itself is in the audit log, so nothing is lost, but the screens a QA reviewer or an inspector would use do not show it.
- Evidence: Local database as an Inventory Manager: rename own profile to another user's exact name ALLOWED; 5,000-character name ALLOWED; renaming another user's profile had no effect (row-level security filters it). `grep full_name` shows eight screens resolving names live; `audit/page.tsx:78-84` maps `changed_by` to `full_name` only. Script `claude/scan-evidence-p2.sql`, part 5.
- Suggested fix: Make the display name changeable only by the System Admin (User Roles & Access), keep the profile screen read-only for the name, and add a case-insensitive unique index and a 100-character cap. Show "Name (e-mail)" on the Audit screen and on the QC record. For signed documents (COA, QC decisions) a stored copy of the name at signing is the stronger fix; that is part of SCAN-P1-09's stamping change. Size S for the first three points.
- Needs decision from Ravi: Yes. Should users be able to edit their own display name at all?
- Confidence: Confirmed (local database)
- Status: New (carried note from P1: "profile display name is freely editable and not unique")

### SCAN-P2-13 — Re-downloaded old documents print today's company name, address and licence number
- Severity: Low
- Kind: Document control
- Where: `lib/company.ts` `getCompany()` used by `coa-pdf.ts`, `pdf-company-heading.ts`, `table-export.ts`, label PDFs, MFR and batch Word documents; Company Details screen (`saveCompanySettings`)
- Finding: The Company Details screen (FB-0046) correctly says that already-downloaded files do not change. But every document is built at the moment of download from the current company settings, so a COA, label, MFR or report re-downloaded after a change shows the new name, address or manufacturing licence number, with no sign that it differs from what was printed originally. If the licence number is renewed or the address changes, a reprint of last year's COA would carry this year's licence number. The COA keeps a copy of its header fields at issue (`coa_records.header_data`) but not the company block. The Company screen also takes no effective date or reason (the change is in the audit log).
- Evidence: Every `getCompany()` caller is a download/print generator reading the module-level value filled from `company_settings` by the dashboard layout; `header_data` content comes from the COA header fields only.
- Suggested fix: Cheapest: add a line to the Company Details screen warning that reprints of older documents will show the new details. Fuller: store the company block inside `coa_records.header_data` when a COA is issued and use it when reprinting. Size S (note) or S to M (COA copy).
- Needs decision from Ravi: Yes. Warning only, or keep a copy of the company block on issued COAs?
- Confidence: Confirmed (code)
- Status: New

## Carried to later steps

(Earlier carry-overs are in `claude/scan-findings-p1.md`.)

- Approved-vendor status, qualification date, GST / drug licence number on the vendor record (→ P9.1).
- Does a printed purchase order show the vendor live or from a copy, and does it print the version of the item name at that time? (→ P3.1)
- Opening-stock upload must be checked for the same oversized-sheet problem and the 1 MB limit (→ P2.4; it uses the same reader).
- Dead stock: rejected quantity above quantity bought; free-number balance (→ P8 dead stock step).
- Opening stock effect on reports: ledger date of a loaded batch is the load time, receipt date is on the purchase line (→ P3.4 Stock Statement and P7.2).
- Template downloads: Reference sheets list active items only; very long lists and the 1,000-row cap on them (→ P7.5 exports).

## P2.1 — Items, item types, units, codes

- Codes: `get_next_item_code` uses sequences (no duplicates under concurrent saves); width is 3 for RM and 5 for the others, and widens naturally past 999 (padding takes the longer of width and length). Gaps appear when an insert fails after a number is taken; that is normal for sequences and harmless.
- Unit lock (0076) covers ledger, purchase lines, recipe lines, packaging issues, production issues and finished product recipes; no gap found.
- Delete: System Admin only; foreign keys stop deleting an item with records, with a clear message.
- Pairing (Finished Product to packaged and to production stock): one-to-one by unique indexes, self-pairing refused, category checked when the pairing is set (but see SCAN-P2-01).
- Item list: pages through all rows with a unique tiebreaker, so the 1,000-row cap does not hide items.

## P2.2 — Vendors

- Create and edit: name required, case-insensitive duplicate check (excluding self), e-mail checked, code from a sequence (`get_next_vendor_code`, but see SCAN-P1-10 for the public-key use of the generator).
- Delete: System Admin only; refused when purchase orders exist, with a clear message.
- Role gate: System Admin and Inventory Manager write; database policy repeats it (P1.3).
- Vendor details feed the purchase screen, labels and COA header; the COA keeps its own copy.
- Problems: SCAN-P2-04 (no deactivation), SCAN-P2-05 (live details on old documents, free-text contacts). The near-duplicate name weakness is the same as items (SCAN-P2-03); live check P2-E covers vendors.

## P2.3 — Bulk upload

- Method: all eight modules read (Items, Vendors, Item Types, MFR, Purchase, Equipment, Dead Stock, COA templates), the shared reader (`parse.ts`), date reader (`dates.ts`), schemas and the upload screen.
- Atomicity: sound. Every module validates all rows first and imports nothing if any row fails; inserts are single statements or one RPC, so a failure rolls back everything. A failed insert burns code numbers (harmless gaps).
- Idempotency: uploading the same file twice is refused by the duplicate checks (names, asset ids, invoice per vendor, existing templates). Two people uploading the same file at the same moment could both pass the checks (no database unique on names; D26 accepted).
- Row limit: 500 data rows per sheet, enforced after reading (see SCAN-P2-06 for why that is late).
- Dates: read by explicit format only (dd-mm-yyyy, yyyy-mm-dd, real Excel dates), years 1900 to 2100, impossible dates refused, future invoice date refused. Sound.
- Matching by name: names that match more than one active item or vendor are refused with the codes listed. Sound.
- Roles: each upload uses the same role set as the matching form; the MFR and COA RPCs repeat the check in the database.
- Problems: SCAN-P2-06 to 09.

## P2.4 — Opening stock

- Rules read: `submitOpeningStock`, `validateOpeningSheet` (raw, packaging, finished product), `load_opening_stock`, `load_opening_finished_product`, `undo_opening_load`, `set_opening_stock_open`, the page, the template builder, and the two existing test suites (`opening_stock_0100`, `opening_stock_0101_fp`).
- All-or-nothing: the file is checked in full in the app, and the database repeats the checks (item category, batch and AR number clashes, dates, retest rules), so a file that passes the screen but breaks a rule in the database loads nothing.
- Legacy handling: loaded purchase lines are flagged legacy; QC records for approved and rejected rows carry the old AR number and are flagged legacy; pending rows go to the QC queue normally. Numbers that look app-made (batch and AR patterns) are refused so they cannot clash with future numbers.
- Expired stock: an approved row whose expiry date is already past loads as expired, not usable (the stock status view classifies it first). Tested on the local database. A retest date later than expiry is accepted but harmless for the same reason.
- Undo: System Admin only, only while loading is open, and refused if any stock from the load has been used, a QC record has been started, or the batch has a COA.
- Close and re-open: System Admin only; a single settings row (singleton constraint).
- Price and GST are optional on opening stock; that is intended (old stock with no recorded price). It means these lines will have no value in any future stock-value figure.
- Problems: SCAN-P2-10, SCAN-P2-11. The same oversized-sheet problem applies here (SCAN-P2-06), since the file is read by the same function.

## P2.5 — Company, users, roles, profile

- Company details: System Admin only in the action and in `set_company_settings`; length limits; applied through the layout. See SCAN-P2-13 for reprints.
- Accounts: created by System Admin only (e-mail checked, at least one role, temporary password 10 to 72 characters, forced change at first sign-in); creation undone if roles cannot be saved; disable refuses self and the last System Admin; accounts in the audit log cannot be deleted (history stays attributable); re-enable keeps roles.
- Roles: `set_user_roles` saves the whole set in one call, refuses leaving no System Admin, and a System Admin cannot remove their own role; effect is immediate because roles are read on every request.
- User list: reads all accounts in pages of 1,000, so there is no 50-user truncation.
- Profile: name only (no e-mail or role editing); see SCAN-P2-12. Password change: SCAN-P1-04 and 05.

## Checked and found sound (P2.1 to P2.5)

- Code numbering has no duplicate or width problem; `_pad_seq_code` never truncates.
- Unit change is blocked once the item has any record.
- Name duplicate search escapes `%`, `_` and backslash correctly.
- Item type delete is System Admin only and refuses when items use the type.
- Barcode rendering is self-contained (Code 128-B) with a clear message for unsupported characters.
- Users and roles: last System Admin protected, own role removal blocked, whole role set saved atomically, account list not truncated, leavers disabled not deleted.
- Opening stock: loads are all-or-nothing, repeat their checks in the database, refuse app-style numbers, treat past-expiry stock as expired, and undo only unused loads.
- Vendor delete is Admin-only and protected by the purchase-order foreign key; the COA keeps a header copy so a vendor edit does not alter an issued COA.

## Areas read (P2.1 to P2.5)

`lib/actions/items.ts`, `lib/actions/item-types.ts`, `app/(dashboard)/items/{page,item-form,barcode,items-table}.tsx`, item-types pages (listing), `lib/utils.ts` (`escapeLike`), `get_next_item_code`, `_pad_seq_code`, `trg_fn_item_unit_locked`, `trg_fn_check_item_pairing`, `items` and `item_types` constraints, indexes and policies; active-filter use across 25 pages and actions; own SQL script on a scratch database (`claude/scan-evidence-p2.sql`).

`lib/actions/vendors.ts`, `app/(dashboard)/vendors/{page,vendor-form,[id]/page}.tsx`, `vendors` and `purchase_orders` columns and constraints, `coa_records` columns, the vendor reads in `purchase`, `labels` and `coa/new` pages, `createPurchaseOrder` duplicate-invoice check.

`lib/actions/bulk-upload.ts` (all 1,593 lines), `lib/bulk-upload/{parse,dates,schemas,examples}.ts`, `app/(dashboard)/bulk-upload/{page,upload-form}.tsx`, `bulk_create_mfr_definitions`, `bulk_create_purchase_orders`, mfr line/unit triggers, `equipment` and `dead_stock_items` constraints, `purchase.ts` line schemas; Next.js Server Actions guide in `node_modules/next/dist/docs`; own timing test of the Excel reader with a stray far-down cell; local-database test of the MFR unit (`claude/scan-evidence-p2.sql`).

`lib/actions/opening-stock.ts`, `lib/opening-stock/{validate,columns,template,legacy-lines}.ts`, `app/(dashboard)/opening-stock/{page,upload-form,admin-controls}.tsx`, `load_opening_stock`, `load_opening_finished_product`, `undo_opening_load`, `set_opening_stock_open`, `item_stock_status` view, `lib/usable-stock.ts`, test suites `opening_stock_0100` and `opening_stock_0101_fp`; own local-database test of an already-expired approved row (script in `claude/scan-evidence-p2.sql`, part 4).

`lib/actions/{company,user-roles,admin-users,auth}.ts`, `lib/company.ts`, `lib/company-server.ts`, `lib/auth/user-accounts.ts`, `profiles` columns, policies, triggers and constraints, all `getCompany()` callers, the eight screens that show `full_name`; own local-database test of profile renaming (`claude/scan-evidence-p2.sql`, part 5).
