---
title: Known issues & suggested fixes — Invento
---

# Known issues & suggested fixes

Punch list from a full-app audit (1 Sept 2026), requested by Ravi in chat
("suggest any fixes, bugs, suggestions, integrity issues, UI issues, data
integrity issues to fix"), then fixed the same day per "fix all issues."
Two focused audit passes — one on data integrity/concurrency/RLS, one on
UI/UX consistency across modules — plus direct verification of every
finding against the actual migrations/action files before fixing. Update
this doc's checkboxes as items change state; don't delete resolved items,
keep the audit trail intact.

**Older passes (1–52) are in `claude/known-issues-archive.md`.** This file holds the preface and the latest passes only, so it stays cheap to read. New passes are appended at the end here; when this file passes about 10 passes, move the oldest to the archive. To find something old, use project_search on the archive — do not read it whole (about 220 KB).

## Fifty-third pass (29 Sept 2026) — One company identity on every printed output (export consistency, decision b)

**Issue.** The company name was spelled three ways and the licence number three ways across the PDFs and Word documents, and register PDFs had no logo, page numbers or generated-on/by line.

**Decision (Ravi, 29 Sept 2026): "Atharva Nature Healthcare Pvt. Ltd." and "PD/AYU-111" everywhere.**

**Fix: code only.** New `lib/company.ts` holds the name, address and licence; all outputs read it (slips, BMR and MFR Word documents, COA, labels, register PDFs). Register PDFs (Reports x4, RM Report, Packing Register, MFR report) now have the logo in the header and a footer on every page: "Generated dd-mm-yyyy hh:mm by <user>" and "Page X of Y". Reports PDFs also print the date filter and row count. MFR document and COA no longer print the name in capitals. `docs/modules/shell.md` updated.

**Verification.** tsc, eslint and next build clean; a sample register PDF rendered and checked. Downloaded slips, Word documents and COA have not been viewed yet.

**Deploy status: live 29 Sept 2026.** Pushed (`origin/main` at `28bb849`, content identical). No migration.

- [x] Export decision (b) done.
- [ ] Ravi to open a Reports PDF, a slip and the MFR document and confirm they look right.


## Fifty-fourth pass (29 Sept 2026) — Excel / PDF export from lists (export consistency, decision c)

**Issue.** Only a few screens could be downloaded; there was no Excel export of real data anywhere.

**Decision (Ravi, 29 Sept 2026):** the recommended table, with Instrument / Equipment Master and Dead Stock Register as Excel, SOP / STP Documents no action, existing formats and layouts unchanged.

**Fix: code only.** `DataTable` takes an optional `exportConfig` (`lib/table-export.ts`, `lib/excel-export.ts`); Excel / PDF buttons export every row matching the search box and "Hide legacy data".
- Excel: Item Master, Vendor Master, Instrument / Equipment Master, Dead Stock Register, Purchase orders list, Inventory Ledger (loaded events, up to 1,000), Stock Position (breakdown in separate columns), Audit Log (System Admin / Super Auditor only), RM Report (beside the unchanged Export PDF), and the four Reports registers (beside the unchanged PDFs).
- Excel and PDF: Quality Control list, Finished Product list.
- PDF: MFR list, COA list.
- No action: SOP / STP Documents, Item Type Master, Tester Feedback, User Roles, Packaging (already has PDF), all Deprecated screens.
- Excel files: real numbers and dates, frozen filterable header, "About this export" sheet (who, when, filter, rows). `docs/modules/shell.md` updated.

**Verification.** tsc, eslint and next build clean; Excel builder round-trip checks (22); a real headless Chromium download read back correctly. Downloaded files on the live site not yet viewed.

**Deploy status: live 29 Sept 2026.** Pushed (`origin/main` at `922e8f9`, content identical). No migration.

- [x] Export decision (c) done.
- [ ] Ravi to open an Item Master Excel and a QC list PDF and confirm they look right.


## Fifty-fifth pass (29 Sept 2026) — Part A batch 1: form fixes (UX-01/02/03, DES-11, FB-0025 rest, Submit-to-QC atomicity)

Ravi asked for the "to be fixed" list (Part A of the master list) to be built. Decisions (29 Sept 2026): A7 delete rights change only while a record is still editable; A14 removes dead triggers and functions only (unused columns stay); A21 (tests and CI) deferred; A22 (enforcing the full content-security policy) on hold. This pass is batch 1 of 3.

- **UX-01, QC decision.** Approved / Rejected is now a real radio group (`components/ui/decision-choice.tsx`) in both QC forms. Save stays disabled until a choice is made.
- **UX-01 / UX-02, confirmations.** Actions that change the page under the clicked form (QC decision, PO Final Submit, FP draft create / Create Batch / Cancel / Complete, Submit to QC) redirect to the same page with `?saved=<key>`; the page shows a green banner (`lib/saved-messages.ts`, `SavedBanner`). Only known keys are shown.
- **UX-03, combobox.** The hidden native select is now controlled by state (`value={currentValue}`) and the effect that wrote to its DOM value is removed. A value that is not among the options gets a hidden placeholder option, so an unchosen dropdown can never submit the first option silently. Checked in a scratch jsdom test (not added to the repo): required blocking, programmatic auto-fill, a parent refusing a change, and the auto-submit filters (`currentTarget.form` sees the new value inside onChange).
- **DES-11.** Purchase add-line and edit-line forms disable the button and show a red message when QC + Stability + R&D exceed the quantity.
- **FB-0025 (rest).** Finish date cannot be earlier than the batch start date: date field `min`, review-step check, server check, and `fp_finish_not_before_start` (NOT VALID CHECK, new writes only).
- **A6, Submit FP to QC.** `submit_fp_batch_to_qc(p_batch_id)` (0085, security invoker) does the AR number, the QC insert and the status change in one transaction; the earlier two-write version could leave a QC record with the batch still awaiting QC.

**Migration 0085.** Adds the CHECK and the function. Replay of all 85 migrations is clean; the security suite still gives 65 of 65; new checks (finish before start refused, finish on start day allowed, submit works once, second submit and unknown batch refused, created_by is the caller, no orphan QC row, mfr_manager keeps the access it had) all pass. tsc, eslint and next build clean.

**Deploy status: live 29 Sept 2026.** Migration `0085` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `0bce001`, content identical).

- [x] Batch 1 (A1–A6) done.
- [ ] Ravi to check live: a QC decision shows the banner, PO Final Submit shows the banner, and over-sampling on a Purchase line greys out Add line.


## Fifty-sixth pass (29 Sept 2026) — Part A batch 2: database hardening (DES-04/05/06/07/08/10/12/13)

Second batch of the "to be fixed" list (A7–A14). Decisions from Ravi: A7 delete rights only while a record is editable; A14 dead triggers and functions only (unused columns stay).

- **A7, delete rights (DES-04).** `finished_product_components`: no screen ever edits or deletes a component, and each insert has already pulled stock, so direct edit and delete through the API are now refused (Draft-cancel, stale-draft expiry and an admin deleting the whole batch are unaffected). `documents` and `coa_templates`: the catch-all write policy is split so QC roles keep add and edit while delete is System Admin only. `mfr_lines` was already locked once approved (0070); `mfr_procedure_steps` stays editable at any time by design (0048); `bmr_*` untouched (deprecated).
- **A8, CHECKs (DES-05).** Equipment quantity > 0; dead stock quantity > 0, price >= 0, depreciation 0–100, rejected and balance amounts >= 0; MFR batch size > 0. All `NOT VALID`, so they apply to new writes only.
- **A9, Purge Test Data (DES-06).** Resets `item_code_seq_rmfp`, no longer references `fp_batch_seq`, and lists `mfr_procedure_steps`, `coa_templates`, `coa_template_lines`, `production_issue_batches` in its result (the TRUNCATE cascade was already emptying them).
- **A10, bulk MFR import (DES-07).** `bulk_create_mfr_definitions()` no longer creates the Finished Product and Packaged FP items; they are created at approval, like a single MFR (0041). The MFR keeps its item type. Function return shape is now (mfr_name, mfr_code). Template note, Item Type hint and Bulk Upload page text reworded.
- **A11, pairing (DES-08).** Triggers check the category when a pointer is set or changed: `packaged_item_id` must be a Packaged FP, `production_rm_item_id` a Raw Material, holder a Finished Product; an MFR can only link to a Finished Product item.
- **A12, vendors (DES-10).** Single create and edit refuse a name that already exists (case-insensitive, app-level, like the other duplicate checks).
- **A13, feedback name (DES-12).** A trigger sets `submitted_by_name` from the submitter's profile (email if no name, the same fallback the app uses).
- **A14, dead code (DES-13).** Dropped `trg_qc_sample_pull` and its no-op function, `trg_fn_purchase_line_push`, and `fp_batch_seq`. Unused columns (`wastage`, `total_units`, `expiry_date`, `packaging_item_id`, `packaging_qty_used`, `version`) stay. `convert_unit()` also stays: other functions still call it.

**Verification.** Replay of all 86 migrations is clean. New SQL suite (about 110 checks) has zero failures, covering locked components, admin cascade delete of a batch, admin-only document and template delete, each CHECK, bulk MFR creating no items and the pair appearing at approval, pairing refusals and the correct pairings, faked feedback name replaced, dead objects gone, and the purge result and RM-FP counter restart. Earlier suites unchanged (b 25, p 21, r 36, u 36, sb, sec04 65, des02 62, tz 6, sec07 36 plus its one known harness FAIL). tsc, eslint and next build clean; the patch applies cleanly onto `origin/main`.

**Deploy status: live 29 Sept 2026.** Migration `0086` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `620f4e4`, content identical).

- [x] Batch 2 (A7–A14) done.
- [ ] Ravi to check live: adding a vendor with an existing name is refused; a bulk-uploaded MFR creates no Finished Product items until it is approved.


## Fifty-seventh pass (29 Sept 2026) — Part A batch 3: performance (PERF-02/03/04/06), and Production issue sampling made mandatory

- **Production issue sampling (Ravi request).** On a Production packaging issue, QC quantity, Stability quantity, R&D quantity and Sample unit are now mandatory, like a Purchase line: the quantities start blank, a blank is refused in the form and again in `createPackagingIssue`, and 0 is still accepted when typed. Store and R&D issues unchanged. `docs/modules/packaging.md` updated.
- **A16/A17, indexes (PERF-02/03).** Migration 0087 adds 15 indexes: ledger (item, event date, seq), ledger reference (type, id), ledger production batch, QC by purchase line and date, COA links (QC, FP batch, template), PO vendor, items and MFR item type, MFR line item, packaging issue links. Two single-column indexes made redundant by the new composites are dropped. Left out on purpose: PO status (two values), the deprecated `bmr_*` tables, the legacy `packaging_issues.packaging_item_id`. On a 400,000-row ledger, the reference lookup used by the QC-review trigger goes from about 30 ms to 0.03 ms.
- **A18, bulk codes (PERF-04).** `get_next_item_codes(category, n)`, `get_next_vendor_codes(n)`, `get_next_equipment_codes(n)`, `get_next_dead_stock_codes(n)` return n consecutive codes from the same sequences in one call (1–5000; authenticated only). Bulk upload of items, vendors, equipment and dead stock uses them, so a 500-row file makes one code request instead of 500.
- **A20, lazy PDF/Word (PERF-06).** RM and FP intimation slips, COA PDF, BMR Word, MFR Word and the register PDFs (Reports, RM Report, Packing Register) import their library when the button is clicked. Measured from the build output: jsPDF loads on 2 pages (Labels, MFR report page, which draw with it) instead of 10; docx on none instead of 1; total page code summed over all routes 14.2 MB to 9.7 MB.
- **A15 (PERF-01), not built.** Measured on a 400,000-row ledger: `stock_balance` 53 ms, `item_position` 100 ms, one item 1–5 ms. A maintained summary table would add risk to the stock figures for no visible gain. Moved to C16; revisit at about 5 million rows.
- **A19 (PERF-05), not built.** Server-side paging for Reports and Item Master changes what Reports show by default and touches the new exports. Moved to C17: on hold, Ravi will decide later (29 Sept 2026).

**Verification.** Replay of all 87 migrations clean; new SQL checks (indexes present, codes consecutive and in order, packaging codes on their own sequence, counts 0/5001/null refused, anon refused, reference lookup plans an index scan) pass; earlier suites unchanged (the `b` suite needs the app's IST time zone when the clock is past 18:30 UTC, then 25 of 25). tsc, eslint and next build clean.

**Deploy status: live 29 Sept 2026.** Migration `0087` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `081e096`, content identical), together with `418f239` (Production sampling).

- [x] Batch 3 done. Part A is finished.
- [ ] Ravi to check live: a new Production packaging issue will not save with a blank QC, Stability, R&D or Sample unit; a bulk upload still gives ordered codes; RM Intimation and COA PDFs still download.


## Fifty-eighth pass (30 Sept 2026) — COA Templates upload failed (PGRST202), and error messages explained in plain words

- **Symptom (Ravi).** Uploading the COA Templates sheet showed "Something went wrong (reference PGRST202)".
- **Cause.** PGRST202 = the database API could not find the function `bulk_create_coa_templates(p_payload jsonb)` (defined in 0062). The function was missing from, or not visible to, the live API. Nothing in the migrations drops it, so 0062 was probably never run on the live database (deployment log only said "live before 28 Sept").
- **Fix.** Migration 0088 re-creates the function exactly as in 0062 (`create or replace`), grants it to `authenticated` (revoked from public and anon), and runs `notify pgrst, 'reload schema'`. Safe to run any number of times; no data touched. Suite `a0088` (9 checks): drops the function, runs 0088, function is back, running it twice is harmless, 2 templates created with lines in order, duplicate item type refused, empty payload refused, user without COA role refused, anon refused.
- **Error messages (Ravi request: explain why in simple terms).** `friendlyDbError` now gives a plain reason: PGRST202/200/204/205 and 42P01/42703/42883 say a database update has not been applied and nothing was saved; unknown codes are explained by family (busy or unreachable database, missing database feature, unacceptable value, conflicting data) with the reference code kept; new wording for divide-by-zero, locked rows and timeouts. Each bulk upload now names what failed ("Nothing was imported — the COA template upload failed."). Seven list pages (Vendors, Purchase, Equipment, Dead Stock, Inventory, RM Report, Audit) showed raw database text when a load failed; they now use the same wording. Messages written by our own database rules (P0001/P0002/22023) still pass through unchanged. Documented in `docs/modules/bulk-upload.md`.
- **Not changed.** Two Auth-service messages in `lib/actions/admin-users.ts` (password reset, re-enable account) still append the service's own text; they are readable and not database errors.

**Verification.** All 13 suites match `expected.txt` (a0088 9/9); `tsc` and `eslint` clean; message wording checked by calling the function with sample codes.

**Deploy status: code live 30 Sept 2026.** Migration `0088` run by Ravi (SQL Editor: "Success. No rows returned"); pushed (`origin/main` at `b2df7f7`, content identical). A first `git am` failed because Ravi had copied the `.sql` into `supabase\migrations` himself; fixed with `git am --abort`, removing that copy, and re-applying.

- [x] Fix delivered and pushed.
- [ ] Ravi to check live: the COA Templates upload now imports (or names the wrong row); an item type that already has a template is refused in a plain sentence. Listed as E14 in the master list.

## Fifty-ninth pass (30 Sept 2026) — Every operation shows a success or failure message; B23 vendor address and mobile

- **Every operation gives a message (Ravi request).** After the COA Templates upload showed no success message, all actions were audited. `FlashHost` (dashboard layout) shows a notice fixed at the top of the window: success fades after 8 s, errors stay until closed. 44 forms now use `useFlashActionState` (`lib/use-flash-action.ts`) instead of `useActionState`, so the server's answer is shown the moment it arrives, whatever the form does afterwards. 16 actions that redirect had no confirmation and now redirect with `?saved=<key>` (delete item, vendor, equipment, dead stock, item type, MFR, PO; update item type; create MFR, QC record, COA; save recipe; start retest; record wastage; password change). The old per-page `SavedBanner` was removed (one mechanism). PO creation says "Purchase order … created as Draft". Bulk upload success now in a green box. Not covered on purpose: sign-in/out and the deprecated BMR screens. Browser-tested with a temporary page (notice visible while scrolled, error stays, `?saved=` shown once and cleaned from the address). Rule added to `CLAUDE.md` and `docs/modules/shell.md`. No database change.
- **B23, vendor address and mobile on the Purchase form.** Read-only line under the vendor dropdown on New Purchase Order and under the PO heading; "not on file" when blank. `docs/modules/purchase.md`. No database change.

**Verification.** `tsc`, `eslint` (0 errors, same 47 warnings as before), production build clean.

**Deploy status: live 30 Sept 2026.** Pushed by Ravi: `69df36d` (messages) and `2b93dca` (B23); `origin/main` at `2b93dca`, content identical.

- [x] Both done.
- [ ] Ravi to check live: E14 (COA upload) and E15 (notices on a save/delete/upload, vendor details on New PO).

## Sixtieth pass (30 Sept 2026) — B26 Packing Register RM-FP columns; B15 Dashboard retest and expiry alerts

- **B26.** The Packaging list has two new columns, RM-FP item code and RM-FP batch (before Date): a Production issue shows the raw-material item it created (for example RM-FP-00001) and each batch with quantity, one per line; Store and R&D rows show "—". Both columns are searchable and in the PDF; the list also gained an Excel export. Read from `production_issue_batches` (inactive rows ignored). `docs/modules/packaging.md`. No database change.
- **B15 (Ravi decisions: retest for raw materials and finished products, expiry for finished products only, 90-day window for both).** Dashboard cards: "Retest due in the next 90 days" and "Finished product expiring in the next 90 days". Each line: item and code, batch, a Raw material / Finished product tag, AR number (retest), date and days left; up to 8 per card with a "+ N more" link. Retest uses the latest approved QC per batch, like the QC page's Due for retest: `purchase_line_qc` (raw, active, stock left), `production_batch_status` (raw made from finished product issued to Production) and `current_qc_approvals` (finished products). The old query read every QC record with a retest date, so a batch already retested could still appear. Expiry reads `finished_product_batches.expiry_date` (approved, active). Hide legacy data applies. Not covered: remaining stock of a finished-product batch (no per-batch figure exists); batches already past expiry are not listed. Code in `app/(dashboard)/dashboard-alerts.ts`; `docs/modules/qc.md`. Column names checked on a local database; layout checked by rendering the real component with sample data. No database change.

**Verification.** `tsc`, `eslint` (0 errors), production build clean.

**Deploy status: live 30 Sept 2026.** Pushed by Ravi: `d4da70b` (B26) and `d2f826d` (B15); `origin/main` at `d2f826d`, content identical.

- [x] Both done.
- [ ] Ravi to check live: E16 (Packaging RM-FP columns and Excel export; Dashboard alerts).

## Sixty-first pass (11 Oct 2026) — Bug-fix group 1: 15 findings from the full-app scan

Ravi approved 15 of the 19 "bugs in the app" (B1, B5, B6, B10 parked). Decisions: B3 price and GST % required on the Excel upload and in the database, existing lines left; B13 typed "Received on" date printed as the label's Date of Receipt; B19 code only; B11 price/GST part follows B3.

- **Uploads (SCAN-P2-06, P2-08).** The Excel reader walks filled rows only and stops past 500; a file over 800 KB is refused on the screen and again on the server (Server Actions body limit 4 MB). Plain messages.
- **Password reset (SCAN-P1-01).** The e-mailed link goes to `/auth/confirm`, which exchanges the token and opens Set new password; an unusable link says so. Needs two Supabase dashboard settings (Redirect URLs, e-mail template; see `docs/SUPABASE_SETUP.md`).
- **Screens.** Wastage reason shown in the ledger, item page and Excel (P3-06); QC Register Type column and production batch (P7-01); dashboard retest/expiry cards keep overdue raw material and link to Ageing (P4-05, P7-08); BMR AR number for production raw material (P5-11); item page and intimation slip use the typed issue date (P6-05); feedback keeps the first resolved time, shows load errors, has search and a Page filter (P8-11).
- **QC (SCAN-P10-02).** Round 1 and Round 2 saves only succeed while the record is still in the state the page showed.
- **Purchase (migration 0109: SCAN-P2-07, P3-03, P4-14, P10-01).** `purchase_orders.received_on`; bulk create refuses a line without price or GST %; submit refuses an empty order and a line left without its stock push; the line guard reads the order with a shared lock. Price/GST on submit is checked in the app, not the database.

**Verification.** New suite pc109 16/16; all 27 suites match; tsc, eslint and next build clean; the patch applies cleanly on `origin/main`.

**Deploy status: live 11 Oct 2026.** Migration `0109` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `27947f6`, content identical).

- [x] Fixes delivered and pushed.
- [ ] Ravi: the two Supabase settings for the reset link, then live checks E45 to E48 in the master list.

## Sixty-second pass (11 Oct 2026) — Bug-fix group 2: 10 figure and quantity findings from the full-app scan

Ravi approved ten findings about arithmetic, quantities and figures (P10-05, the ceilings and 10x prompt, parked). Decisions: opening stock Unit mandatory with conversion; low stock on usable stock; RM Report current stock only; yield outside the MFR range needs a reason and above 150% is refused; compose quantities rounded to 3 decimals and under 0.0005 counts as empty; fully packed batches stay on Ageing; one chart per unit on the Dashboard; each money line rounded to the paisa half up; dead stock gets a warning, not a block.

- **Opening stock (P2-10).** Required Unit column; quantity converted to the item's unit; unit that cannot be converted refused; Reference sheet shows item name and own unit; per-item summary after Check.
- **Stock figures (P3-10, P3-11, P5-08, P6-06; migration 0110).** `lib/low-stock.ts` (usable stock for raw material everywhere); RM Report rewritten (current, no date, production raw material, "No price"); `lib/stock-precision.ts` and `allocateFifo` rounding; FIFO guard and `batch_ageing` use `live_remaining_qty >= 0.0005`; Ageing finished product stock = yield − samples − sum of packaging issues (unit-converted).
- **Yield (P5-05).** `lib/yield-rule.ts`; `finished_product_batches.yield_reason`; form, QC list and batch page show it.
- **Dashboard (P7-09, P7-11).** One movement chart per unit; internal pairs left out (`packaged_fp_yield`, `packaged_fp_issue`, `production_rm_yield`, production `fp_packaging_pull`); POs card and Purchase value chart on submitted orders dated by `received_on`.
- **Money (P10-06).** `lib/money.ts`; rule stated on the order page.
- **Dead stock (P8-02).** `lib/dead-stock-check.ts`; warning on forms and list; four more columns in list and Excel.

**Verification.** New suite yr110 23/23; the Ageing suite check for finished product stock was corrected (it expected the old packs-based figure); all 28 suites match (sec07 41/1 known); tsc, eslint and next build clean; the patch applies cleanly on `origin/main`.

**Deploy status: live 11 Oct 2026.** Migration `0110` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `d7fa9d1`, content identical).

- [x] Fixes delivered and pushed.
- [ ] Ravi: live check E49 in the master list.

## Sixty-third pass (11 Oct 2026) — Bug-fix group 3: 12 low-risk findings (no decisions needed)

Ravi asked for the must-have, low-risk findings that need no decision. Nothing blocks a user action that works today.

- **Silent failures (P7-17, P4-06, P3-13).** `components/ui/load-warning.tsx` shows a red banner when a database read fails (Dashboard, Reports, Items, QC, Finished Product, MFR, COA, Packaging, Labels); QC list notes the 1,000-record cap; Batch Trace notes 25-match, 1,000-line and 6-level limits. Other lists that ignore a failed read are not yet covered.
- **Display (P7-20, P7-21, P7-10).** "No rows match" with Clear button and always-visible row count; `formatQty` shows "< 0.001"; Low stock card with count, units, worst first.
- **Stock Statement (P3-12, migration 0111).** New Opening load column; rejected write-off hand-backs reduce Rejected instead of Other in.
- **Small fixes (P5-13, P1-03, P1-05, P8-05, P4-15).** `safeFileName`; sign-in `next` keeps the query; fixed password error text; environmental reading checks (temperature -50 to 100 °C, humidity 0 to 100 %RH, at least one value); label text floor 6 pt.
- **Dependencies (P1-18).** Next.js 16.3.8, sharp and source-map-js fixed; exceljs/uuid (moderate) left because the fix is a breaking exceljs change.

**Verification.** New suite sl111 5/5; st107 adjusted for the new column; all 29 suites match (sec07 41/1 known); tsc, eslint and next build clean; the patch applied cleanly on `origin/main`.

**Deploy status: live 11 Oct 2026.** Migration `0111` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `ac2acb8`, content identical).

- [x] Fixes delivered and pushed.
- [ ] Ravi: live check E50 in the master list (print one long-name label).

## Sixty-fourth pass (11 Oct 2026) — Bug-fix group 4, wave 1: no-decision, no-risk items

Ravi asked for fixes that need no decision and carry no risk, and approved building the safest five first. Code and documents only; no migration.

- **Error pages (P7-19).** A crash now shows "Something went wrong" with Try again, Go to Dashboard and an error code inside the normal layout; a missing record shows "Record not found" inside the layout; an unknown address and a root-layout failure each get a plain page.
- **Set-up notes (P8-13, partly).** README, `docs/SUPABASE_SETUP.md`, `supabase/README.md` and the seed-script message now match the single `fresh-install.sql`, the closed sign-up and the dashboard-created first user; `.env.example` added (names only). Not done: five unused pictures and six unused exports (need file deletion).
- **Wording (P7-07, P7-28 partly).** Reports and Dashboard subtitles rewritten; Current behaviour blocks added to the Packaging and Reports notes (18 other notes still to do).
- **Tests (P10-09).** New suite `uf` (39 checks) for `bulk_create_purchase_orders`, `update_mfr_recipe` and audit-log immutability; found no defect.

**Verification.** All 30 suites match; tsc, eslint and next build clean; the patch applied cleanly on `origin/main`.

**Deploy status: live 11 Oct 2026.** Pushed (`origin/main` at `5ef0f17`, content identical). Live check E51.

- [x] Wave 1 delivered and pushed.
- [x] Wave 2 built (see below). P7-13 landscape PDFs not started.

## Sixty-fifth pass (11 Oct 2026) — Bug-fix group 4, wave 2: three additive display items

Code and documents only; no migration.

- **Show inactive (P8-03).** Equipment and Dead Stock lists load inactive records too and hide them until "Show inactive" is ticked (off by default; appears only when one exists); Inactive tag; Status column in Excel. Optional `isInactive` added to `DataTable`.
- **After completion card (P5-14).** Finished product batch page shows samples, packed bulk, bulk remaining (yield less samples less packed, never below zero, same rule as the Ageing report) and the packing runs, from "Completed – awaiting QC" onward.
- **Audit Log wording (P8-12, partly).** "What changed" names up to three fields with short before and after values. Not done: names instead of ids on the detail page, Before and After columns in Excel.

**Verification.** tsc, eslint and next build clean; patch applied cleanly on `origin/main`; no database change.

**Deploy status: live 11 Oct 2026.** Pushed (`origin/main` at `f88f423`, content identical). Live check E52.

- [x] Wave 2 delivered and pushed.

## Sixty-sixth pass (12 Oct 2026) — Bug-fix group 5: the four pending bugs, decided by Ravi

Ravi answered each question in a prompt and chose the recommended option on all four.

- **P3-01 (the last High).** A purchase order cannot be reopened once QC has a record on any of its batches (any status); a draft line with a QC record keeps item, batch number, unit, quantity and sample quantities, price and GST % stay editable. Migration 0112.
- **P4-03.** An expired batch cannot be retested and leaves the Due for retest cards; a retest approval cannot set a later expiry than the batch was last approved with (screen rule, with the date box limit).
- **P4-13.** The finished product label prints the exact Best Before date.
- **P2-13.** Each issued COA keeps a copy of the company name, address and licence (`coa_records.company_snapshot`) and prints it on reprint; older COAs have no copy. Company Details says other documents print the current details.

**Verification.** New suite pa112 25/25; `r_po_reopen` rewritten; all 32 suites match; tsc, eslint and next build clean; the patch applied cleanly on `origin/main`.

**Deploy status: live 12 Oct 2026.** Migration `0112` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `28f568c`, content identical). Live check E53.

- [x] Fixes delivered and pushed.

## Sixty-seventh pass (12 Oct 2026) — Documentation, clean-up and tests

Code and documents only; no migration. Ravi chose this category; the two decisions were answered "Park it": P10-08 (GitHub workflow, delivering fixes with their suites) and P7-16 (old MFR PDF page).

- **User Guide text (P7-27).** Dashboard (four cards, 90-day windows), Purchase (no expiry on the line), Quality Control (expiry set at Round 2, 180-day retest period, three retests, last retest takes only the expiry), Finished Product (automatic oldest-first, Draft, Create Batch, 30-minute cancel, Complete Batch), Packaging (the real form, PKG codes), Reports (no column sorting, Excel and PDF, downloads follow the date filter not the search), Inventory (RM Report shows today's quantities). Also corrected: User Roles & Access (account creation, reset, disable, last-admin rule) and Signing in (no Register link).
- **User Guide PDF (P7-26).** Rebuilt, 39 pages, "Version: October 2026", with a new script `scripts/build-user-guide-pdf.py` (pandoc plus Playwright Chromium). Regenerate it in the same patch whenever the guide changes.
- **Module notes (P7-28).** A "Current behaviour" block at the top of the 23 notes that lacked one (all 25 now have it).
- **Leftovers (P8-13).** Five unused pictures in `public/` and six unused exports removed (PDF_BRAND, companyNameAndAddress, requireColumns, ItemCategory, hasAnyRole, the signUp stub).
- **Parked by Ravi:** P10-08, P7-16 (with P10-05 already parked).

**Verification.** tsc, eslint and next build clean; patch applied cleanly on `origin/main`; no database change.

**Deploy status: live 12 Oct 2026.** Pushed (`origin/main` at `c5917ec`, content identical). Live check E54.

- [x] Documentation and clean-up delivered and pushed.

## Sixty-eighth pass (12 Oct 2026) — Security and access: the six scan findings

Ravi chose "Security and access" and asked for the six findings to be closed. One decision: idle sign-out, answered "configurable, default 60 minutes, option to disable, exclude System Admin".

- **P1-10, P1-12, P1-13 (migration 0113).** The anonymous role holds no privilege on any table, view or number sequence in `public`, and no ordinary function there is executable by it or by PUBLIC; signed-in users and the service role keep exactly the rights they had. Views are read-only for signed-in users (`current_qc_approvals` was writable). `_item_stock_unit` and `check_sufficient_stock` refuse an account with no role. New tables, sequences and functions are closed to anon by default. Not added: restricting `_item_stock_unit` to Item Master editors (a QC Reviewer approving a finished product batch legitimately sets a blank unit).
- **P1-02.** `company_settings.idle_timeout_minutes` (default 60, 0 = off, else 5 to 480) set by `set_idle_timeout()`; a card on User Roles & Access; `IdleSignOut` in the dashboard layout for everyone except System Admin, warning two minutes before, sign-in page explains. Browser-side timer only (a session time-box needs the Supabase Pro plan).
- **P1-04.** Profile asks for the current password (`changeOwnPassword`); the reset page and forced first-sign-in change are unchanged.
- P1-18 was already done (Next.js 16.3.8; the exceljs/uuid remainder accepted, D15).

**Verification.** New suite sa113 44/44; the `sb` suite's helpers are now granted to anon (new functions are no longer open to PUBLIC); all 33 suites match; tsc, eslint, next build clean; patch applied cleanly on `origin/main`.

**Deploy status: live 12 Oct 2026.** Migration `0113` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `d435ea1`, content identical). Live check E55.

- [x] Security group delivered and pushed.

## Sixty-ninth pass (12 Oct 2026) — Reliability, speed and silent failures: the seven buildable findings

Ravi chose "Reliability, speed and silent failures" and said "lets do" for the seven findings that needed no decision.

- **P3-05 and P7-25 (migration 0114).** `stock_integrity_check()` (System Administrator only) runs nine read-only comparisons: On hand against the parts on Stock Position, purchase batches and production-issued batches against the ledger, negative stock, unsubmitted lines with stock, ledger unit and item, finished product ledger against bulk left, duplicate batch numbers, orphans. The write-off reason check was left out (P3-08 accepted). New page Admin → Stock Integrity Check shows the result and the ledger row count with a watch level at 3 million rows.
- **P4-16.** Label Printing no longer loads every batch; `searchLabelBatches` (server action) returns the newest 50 eligible batches matching a typed name or batch number.
- **P6-03.** View `fp_batch_packing_options` gives approved batches with product name, unit and quantity left (same arithmetic as the packaging guard); the New packaging issue page reads only that.
- **P5-07.** Compose and Stock Position run `expire_stale_fp_drafts()` before reading.
- **P7-15.** `downloadPdfTable` refuses more than 3,000 rows with a message (narrow the list or use Excel).
- **P10-07.** `ALTER FUNCTION ... SET timezone = 'Asia/Kolkata'` on seven functions; `current_qc_approvals` and `item_stock_status` use the India date.

**Verification.** New suite rl114 30/30 (includes a full purchase, QC, finished product and packaging flow that must leave all nine checks clean); all 33 suites match; tsc, eslint (0 errors) and next build clean; patch applied identically on `origin/main`.

**Deploy status: live 12 Oct 2026.** Migration `0114` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `c83d4c0`, content identical). Live check E56.

- [x] Reliability group delivered and pushed.

## Seventieth pass (12 Oct 2026) — Data integrity: rules the database now enforces (eight findings, three decisions)

Ravi picked the category "Rules only on the screen (data integrity)" and decided the three open points: **P1-09** keep System Admin exempt from the different-person QC rule (no change, accepted); **P2-12** only System Admin can edit display names; **P2-02** block deactivating an item while stock is on hand (warn if used in a recipe) and a raw material must have an item type.

- **P2-01.** Item category is locked once the item has stock, QC or recipes (screen and database).
- **P2-02.** Deactivating an item with stock on hand is refused; recipes show a warning; raw material without item type refused (database check, new and changed rows).
- **P2-03 and P10-04 (migration 0115).** `norm_name()` (ignores case, repeated spaces, trailing full stop); unique in the database for raw and packaging items (production RM-FP items and finished goods may share names), vendors and item types; the migration stops with a list of existing duplicates before changing anything. Screen checks use RPCs `item_name_taken` and `vendor_name_taken`. Barcode: letters, digits and a few separators only.
- **P2-09.** MFR batch unit checked against the unit list; GST % 0 to 100 on form and uploads; MFR names in one upload grouped by cleaned name.
- **P4-08.** COA save rebuilds the header from the batch and QC record and the test list from the template; only results, remarks and Sampled Qty come from the form; screen header fields locked.
- **P10-03.** Item and Vendor edit save only if the record is unchanged since the form opened ("changed since you opened it" message). Not done: MFR recipe and procedure edits.
- **P2-12.** Rename user control on User Roles & Access (System Admin; 100 characters; no clash with another name); Profile name box removed.

**Verification.** New suite dc115 51/51; five older suites' fixtures updated for the new rules; all 34 suites match; tsc, eslint (45 warnings, 0 errors) and next build clean; preflight tested on a copy with duplicates (stops with a list, passes after renaming); patch applied identically on `origin/main`. COA save and the screens were not click-tested here.

**Deploy status: live 12 Oct 2026.** Migration `0115` run by Ravi ("Success. No rows returned"); pushed (`origin/main` at `da3de7d`, content identical). Live check E57.

- [x] Data-integrity group delivered and pushed.
- Limits: warning on deactivate shows recipes only (not open orders); raw items saved earlier without an item type cannot be edited until given one; MFR edit stale-check not built.

## Seventy-first pass (12 Oct 2026) — User convenience and accessibility: six findings built, one set aside

Ravi chose the category and decided: **P7-24** phone entry matters (full phone treatment); **P8-09** none — new ground rule: ignore anything ending with "Deprecated", including Line Clearance and Environmental Control (not required anymore); P8-04 and P8-14 follow the same rule.

- **P7-18.** `DataTable` headings sort (`sortValue`, else search text; empty last; before paging and export). The User Guide sentence is now true.
- **P7-24.** Under 768 px: buttons, menu lines and paging buttons at least 40 px; first column stays in view; shadow and "Swipe sideways" line when more is to the right.
- **P7-22.** The dropdown's visible box carries the `id` (label click focuses it), `aria-activedescendant` and option ids.
- **P7-23.** Phone menu keeps Tab inside and returns focus; skip link; `aria-current`; labelled nav, search box and paging buttons; `scope="col"`; chart grey #6b7f7b (4.2:1). Not done: short text summary under each chart.
- **P1-15.** Audit Log filters (table incl. four added tables, action, person, record, dates), 200-row pages, Download all matching (newest 10,000), History button on five record pages.
- **P8-12.** Field names in words and names instead of ids on the detail page; Before and After columns in Excel.

**Verification.** tsc, eslint and next build clean; sorting, dropdown label click, phone menu focus, 40 px targets and scroll hint checked in a real browser on a test page (removed); patch identical on `origin/main`. Audit screens and the Record filter not click-tested against the live database.

**Deploy status: live 12 Oct 2026.** Code only; pushed (`origin/main` at `1eee591`, content identical). Live check E58.

- [x] Convenience group delivered and pushed.

## Seventy-second pass (12 Oct 2026) — Formatting and printouts: the three open PDF findings

Ravi said "Go" and answered P7-14 "Yes, build it".

- **P4-10.** `lib/coa-pdf.ts`: header values and labels wrap inside their column and the row grows; Remarks and signature lines start a new page when they do not fit under the test table.
- **P7-13.** `lib/pdf.ts`: upright A4 up to 7 columns, sideways above; short-value columns get the width of their longest value and never wrap; other columns wrap at spaces; font 8 / 7 / 6.5 pt (7 / 6.5 / 6 above 12 columns); the filter line wraps.
- **P7-14.** `lib/pdf-font.ts`: Noto Sans regular, bold, italic (reduced, about 110 KB each, `public/fonts`, SIL Open Font License) registered as "helvetica" per document, so every existing font call uses it; used by table PDFs, the certificate, both intimation slips and the MFR report; label sheets keep their own fonts. Built-in font if a file cannot be fetched. `proxy.ts` lets `.ttf` through. Limits: Hindi prints without joined forms (short-i vowel sign moved into place); arrows and ≥ ≤ written as -> >= <=.

**Verification.** tsc, eslint and next build clean; real PDFs generated in a headless browser (15-column list, 3-column list, certificates with a 49-character product name and 19 tests, ₹, Brahmī Ghṛta, Hindi) and viewed; patch identical on `origin/main`. Not tried on live data.

**Deploy status: live 12 Oct 2026.** Code and font files only; pushed (`origin/main` at `36412b3`, content identical). Live check E59.

- [x] PDF group delivered and pushed.

## Pass 73 — limits group (12 Oct 2026, `d4dd1b4`, migration 0116)
**Deploy status: live 12 Oct 2026.** SQL run, patch pushed (`origin/main` at `d4dd1b4`, content identical). Live check E60.

- [x] SCAN-P10-05 built: ceilings on quantity (per unit), unit price, unit counts and text lengths, in the database, the screens and the bulk upload; 10-times-last-purchase warning on the purchase line forms.
- Limits are not applied to opening stock, dead-stock quantities, finished-product component lines (these are bounded by available stock) or the bulk upload of non-purchase modules.
- The warning compares with the latest earlier line of the same item (any order, including drafts) and only when the units can be converted; it never blocks.
- Limits live in two places that must stay in step: `lib/limits.ts` and `qty_limit()` plus the `*_limit` constraints in 0116.

## Pass 74 — accounts group (12 Oct 2026, `7900604`, migration 0117)
**Deploy status: live 12 Oct 2026.** SQL run, patch pushed (`origin/main` at `7900604`, content identical). Live check E61.

- [x] SCAN-P1-16, SCAN-P2-04 and SCAN-P3-02 built.
- Failed sign-ins are written with the service-role key; if `SUPABASE_SERVICE_ROLE_KEY` is missing on the server they are silently not recorded. The log also cannot tell an idle sign-out from a manual one (both read "Signed out").
- A vendor made inactive is refused on new orders by the screen, the order action and the bulk upload, but the database itself does not refuse a purchase order for an inactive vendor (app-level only).
- Edit invoice details is offered on the order's own page only, not on the new-order screen right after creating (reload the page to get it).
- The sign-in and invoice-edit saves were checked with the type check, lint, build and a browser render of the form, not against a live database before push: live check E61 is the first real test.

## Pass 75 — Intermittent save errors; server and database are far apart (12 Oct 2026, open: recommendation)
**Reported by Ravi (12 Oct 2026):** the app sometimes errors, throws "This site can't be reached" or times out when saving or changing data; it works on the second try; seen last week.

**Findings (read-only look at Vercel and Supabase dashboards, 12 Oct 2026).**
- Vercel (Hobby) keeps only 1 hour of logs, so last week's failures cannot be traced. Over the last 12 hours there were no function errors or timeouts.
- The Supabase project "Invento" (organisation Loftech) is on the free plan, smallest compute (NANO), in **Tokyo (ap-northeast-1)**. The Vercel function region was not confirmed; Hobby projects default to Washington D.C. (iad1), which would put every database query across the Pacific.
- "This site can't be reached" is a browser connection error (DNS or network), not an app or database error; it never reaches Vercel's logs.
- Every page load prefetches about 25 screens at once (sidebar links), each doing an auth check plus queries, a burst on a small free database.

**Recommendation (Ravi: "add this to known issues and remind me when we set up the new prod instance").**
1. Now: set Vercel Settings → Functions → Function Region to **Tokyo (hnd1)** (next to the database) and redeploy. Not Mumbai while the database stays in Tokyo: many queries per request make the server-to-database distance matter more than the user-to-server distance.
2. Small code change (optional): stop the sidebar prefetching every screen at sign-in.
3. **When the new production instance is created (B40): create the Supabase production project in Mumbai (ap-south-1) and set Vercel Function Region to Mumbai (bom1).** A Supabase project's region cannot be changed after creation, and moving costs least before real data. Decide the pair together; if the Tokyo project is kept as production instead, keep Vercel at Tokyo.
4. Pro plans (Vercel, Supabase) keep logs longer and add daily backups (B10); a custom domain avoids `vercel.app` DNS trouble. Not needed yet.
5. If it recurs: note the time, the screen and the exact wording, and check the logs the same hour.

- [ ] Vercel function region set to hnd1 and redeployed (Ravi).
- [ ] Region decision recorded when the production instance is set up (Mumbai pair).

## Pass 76 — guide and process map refresh; Stock Integrity Check explains each difference (12 Oct 2026, `1823c89` and `20fb5c0`, migration 0118)
**Deploy status: live 12 Oct 2026.** Guide and map pushed (`1823c89`, identical to the delivered branch, no SQL); SQL 0118 run (Success), patch pushed (`origin/main` at `20fb5c0`, content identical). Live check E62.

- [x] User Guide refreshed against the app at `7900604`; process map rebuilt as the static page `public/process-map.html` (new sections 7 Opening stock and 8 Inventory Ledger tabs, questions GL-31 to GL-35); both PDFs rebuilt; the User Guide page now has a Process Map card (opens in a new tab: the security headers forbid framing).
- [x] Ravi: "This error does not give enough information" (S6, five rows). Cause: raw-material stock-outs for finished product batches saved before migration 0076 with no unit; quantities in the item's unit, so no stock figure wrong. Fix: every difference row carries a sentence, date, item name, batch numbers; page explains each failing check; the five rows given their item's unit.
- Not verified against live data before the SQL ran: that all five rows were pre-0076 (the screen after the SQL is the proof, E62).
- Map and guide text must be kept in step with the app by hand; the map's date and commit line is in its footer.

## Pass 77 — Opening Stock can be typed in on the page (12 Oct 2026, `445fe1c`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`origin/main` at `445fe1c`, content identical). Live check E63.

- [x] Ravi: "Opening stock should also have option to input data using ui". Built as tabs (Upload Excel / Type it in) on each of the three cards; rows loaded together, all or nothing, same checks as the Excel route (`runOpening` in `lib/actions/opening-stock.ts`, `validateOpeningSheet` unchanged).
- Row numbers in messages ("Row 3") are the row's place on the page, including skipped empty rows; the form shows each message inside its row.
- The item list is read when the form is first opened (active items of the right kind, active vendors); an item or vendor added in another tab appears after reloading the page.
- Dates use the browser's date box (shown in the computer's own format). Opening stock still has no per-quantity ceilings (pass 73 note).
- Typed rows are kept only in the page: closing or reloading the tab loses them before Load.
- Not run against the live database before push (browser run used a stub for the lists and the checks); E63 is the first real test.

## Pass 78 — Quick wins: prefetch, failed-read banners, invoice edit on a new order (12 Oct 2026, `e9dba65`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`origin/main` at `e9dba65`, content identical). Live check E64.

- [x] Pass 75 follow-up: sidebar links no longer prefetch (they asked the server for every screen on each page load). A click now loads the page behind its loading screen, so it can feel a fraction slower than before; undo with `prefetch` removed in `components/shell/nav-list.tsx` if it bothers users.
- [x] Pass 63 follow-up: banner added to Item Types, SOP / STP Documents, COA Template Register, Rejected Materials and the RM Report status lookups (a failed lookup used to show every batch as QC Pending). Still without it: detail pages (item, MFR, PO, FP batch, QC) and the New-record screens' pick lists.
- [x] Pass 74 follow-up: Edit invoice details on a just-created order. Not tested live: after saving, the header cards rely on the same refresh the line actions use on that screen; if they keep the old value, reloading shows it.

## Pass 79 — Opening Stock shows who loaded (12 Oct 2026, `72af8e4`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`origin/main` at `72af8e4`, content identical). Live check E65.

- [x] SCAN-P2-11 (partly): Loaded by column on the Loads table. The Excel file is not kept (Ravi). Typed and Excel loads look the same in the list.
- [x] SCAN-P1-11: decided by Ravi, all roles may load (Super Auditor included); no change.
- Parked by Ravi: SCAN-P3-14 (Retained Samples "Taken on" date), SCAN-P8-06 (SOP register: duplicates, Obsolete).
- Not tested against live data: the name comes from the person's profile; an account with no full name shows a dash.

## Pass 80 — Item Master shows whether a COA template exists (12 Oct 2026, `91c41ab`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`origin/main` content identical to branch `coacol18`). Live check E66.

- [x] Ravi's request: a column on the raw material and finished product lists shows if a COA template exists, with a link to add one when it does not.
- Raw material: template belongs to the item; finished product: to the MFR. Add goes to the card on the item or MFR page.

## Pass 81 — QC results, reasons and rejection control (12 Oct 2026, `8d2c7a3`, migration 0119)
**Deploy status: live 12 Oct 2026.** SQL run (Ravi: "Success. No rows returned"), pushed (`91c41ab..8d2c7a3`, content identical to branch `qcresults19`). Live check E67.

- [x] SCAN-P4-11: test results are captured in Round 1 against the COA template and can be edited in Round 2; the Reviewer's final results go on the certificate (locked when QC captured them). Both rounds kept in `quality_checks` and `qc_decision_history`.
- [x] SCAN-P4-01: every Round 1 and Round 2 decision needs a reason (3+ characters). A Round 1 rejection is a proposal ("Rejection proposed") that a different Reviewer confirms or sends back; a confirmed rejection can be voided with a reason (QC Reviewer or System Admin), which returns the batch to On hand unless wastage was written off.
- Decisions by Ravi: no template means Round 1 approve is blocked (link to add one); old records keep typing results on the certificate; reason minimum is 3 characters; results model and rejection control built together.
- Limits to know: reject is allowed without a template or results; raw material made in Production has no results step (P6-04 undecided); not tried in a browser, database checks only (suite qr119 60/60, about 17 older suites rewritten).
- Open nearby: SCAN-P4-04 (expired finished product batches; decided, not built), SCAN-P6-04 (undecided), SCAN-P4-09 (void certificates).

## Pass 82 — Legacy tag shown on app-made rows (12 Oct 2026, `9ca548a`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`8d2c7a3..9ca548a`, content identical to branch `legacytag20`). Live check E68.

- [x] Found by Ravi on the QC list: ARRM-0009/26 (batch made through a normal order, PO-0033) carried a Legacy tag. SQL showed the purchase line and the QC record both not legacy, so the screen was wrong.
- Cause: `LegacyTag` defaulted to showing when it got no value; on the QC list `false || undefined` gave undefined. Same risk on the Inventory ledger, QC record page and COA list for rows without a purchase line.
- Fix: the tag shows only when the value is true; the two places that used it with no value now pass `show`.
- Why the scan missed it: it read code and used scratch databases, with no live browser; the earlier live checks (E33 to E35) only confirmed the tag appears on loaded rows, never that it stays off app-made rows.

## Pass 83 — Live walk: screen wording and display fixes (12 Oct 2026, `b9edc35`, no migration)
**Deploy status: live 12 Oct 2026.** Pushed (`9ca548a..b9edc35`, content identical to branch `livewalk21`). Live check E69.

- [x] A read-only walk of the live app (6 slices, `claude/live-walk.md`) found 11 display and wording mistakes the code scan could not see. Built: LW-02, LW-04 (note only; headings kept to match the old paper report), LW-05, LW-06, LW-07, LW-08, LW-09, LW-10.
- No change: LW-03 (Kulith rejected under the old one-round rule, so no Round 2 date; new rejections carry one).
- Open: LW-11 (Stock Integrity Check S9 probably counts a reopened order's receipt without its reversal; needs a migration; confirm in the ledger for RM-00004-02/26 first). LW-01 was closed in Pass 84.
- Not covered by the walk: Batch Trace results, forms, PDFs and Excel downloads, sign-in and Profile.

## Pass 84 — Finished product retest, same cycle as raw material (12 Oct 2026, `93de17e`, migration 0120)
**Deploy status: live 12 Oct 2026.** SQL run (Success), pushed `b9edc35..93de17e`. Live check E70.

- [x] SCAN-P4-04: a finished product batch is retested when its retest date arrives (at most 3, period at most 180 days, last retest takes only an expiry date, never extends the expiry). `start_fp_retest()` takes the sample from the stability sample, then the bulk; own ARFP number; card on the QC page.
- [x] Retest approval does not repost the yield; a rejected retest takes the bulk out of On hand (packs stay, Ravi: bulk only); void brings it back. Bulk left subtracts retest samples in packaging, Ageing, Rejected Materials and the integrity check S7.
- [x] Packing and Finished Product labels refused when expired, past the retest date or while a retest is open (opening stock packs exempt).
- [x] LW-01: a retest date can never fall after the expiry date, all batch types (Reviewer form, action, database trigger).
- [x] Opening stock, finished product: Retest date and Retests already done (optional).
- [x] Also: batch page lists every QC record and keeps the first submission date on the intimation slip; dashboard expiry alerts use the newest approval; the packaging issue-date rule uses the first approval.
- Not done: Batch Trace shows the retest QC record but not the retest sample quantity as its own row; LW-11 not folded in.

## Pass 85 — Readiness review, go-live decision and handoff pack (17 to 18 Oct 2026, no code, no migration)
**Deploy status: nothing to deploy.** `main` stays `93de17e`; migrations stay at 0120.

- [x] Technology-only best-practices guide for Next.js + Supabase apps written and then stripped of all inventory, QC and pharma content at Ravi's request (`claude/best-practices-nextjs-supabase.md`).
- [x] Production readiness rated 7 of 10 overall (5.5 as the only system of record for a regulated plant). Weakest area: reliability and operations, 4. Detail in `claude/production-readiness-rating-2026-10-18.md`.
- [x] **Decision (Ravi, 18 Oct 2026):** backups (B10), separate test and production (B40), automatic checks (C14, P10-08), e-mail delivery (P1-06, P9-07) and the Mumbai region move are handled at go-live, when Supabase and Vercel move to Pro. Recorded as G1 to G11 in `claude/go-live-readiness-log.md`; B10, B40 and C14 in the master list now point to it.
- [x] Mobile gap (rating 6) analysed: four-step plan (confirm E58 on a phone, read-only phone-width walk, choose phone-first screens, two layout patches with no SQL). Waiting for Ravi's "go".
- [x] Handoff pack written: `claude/handoff-cloud-session-2026-10-18.md`, `claude/what-was-built-and-how.md`, `claude/open-items-summary-2026-10-18.md`.
- [x] Fixed a stale line in the deployment log: next migration number is 0121, not 0120.
- Still open (unchanged): LW-11 (needs migration 0121), B45, P6-04, P4-09, MFA, live checks E62 to E70.

## Pass 86 — User Guide and Process Map refresh, project documents in the repository (18 Oct 2026, `de1c60f`, no migration)
**Deploy status: live 18 Oct 2026** (docs and PDFs only). Pushed `93de17e..f6a87d7` (project documents) and `f6a87d7..de1c60f` (guide and map).

- [x] Project documents now live in `docs/project/` in the repository, with a README and a pointer in `CLAUDE.md`. They are snapshots of the Claude project copies.
- [x] User Guide stale text fixed: the Inventory tab is "RM Report" with no date box (the guide still described an As On Date box); PQTY, SQTY and QTY explained; retest block in Packaging and Finished Product; QC Decision History in the Audit Log; version line 18 October 2026. PDF 47 pages.
- [x] Process Map stale text fixed: Round 1 "reject ends the record" (now a proposal); RM Report box; COA question GL-20 (header is locked, results come from QC); QC statuses gain Rejection proposed; finished product retest note; rules for packing, labels and retest limits. PDF 24 pages.
- Not checked yet: the live User Guide page serving the new PDFs (Ravi to open Overview, User Guide after the Vercel deploy).
- Lesson: a user-guide refresh should be repeated after any change to a screen's wording or a tab name; the stale RM Report line survived since bug-fix group 2 (11 Oct) because the guide was refreshed for features, not re-read for removals.

## Pass 87 — SQL scripts in the repository, project documents completed in the repository (18 Oct 2026, `b54da87`, no migration)
**Deploy status: live 18 Oct 2026** (scripts and documents only). Pushed `de1c60f..b54da87`.

- [x] **C18 closed.** `scripts/sql/live-data-checks.sql` (97 read-only blocks) and `scripts/sql/README.md` are in the repository; `CLAUDE.md` points to them. The file merges the old `scan-data-checks.sql` with the four `scan-invariants-*.sql` files.
- [x] **Checks brought up to date for migration 0120** (they had gone stale): `retest_sample_qty` is now in the bulk-left formulas (INV-S8, K3, K11, P8); retest QC records no longer look like anomalies (INV-P4, INV-Q2); INV-Q3 covers finished product batches.
- [x] **Tested:** all 97 blocks run against an empty database built from `fresh-install.sql` (this proves every column exists; it does not test results on real data).
- Deliberately not in the repository: `task_f_live_test_cleanup.sql` (destructive, hard-coded ids, already run), `backup-before-purge-2026-09-13.sql` (data dump), `scan-evidence-p*.sql` (reproductions of findings that are fixed), `audit-impact-check.sql` (one-off check for the 28 Sept audit; refers to a column dropped in 0079). They stay in the Claude project; the evidence and audit-impact scripts are also copied into `docs/project/archive/` for the record.
- Known caveat: a finished product batch whose retest was rejected (bulk taken out of On hand) can appear in INV-S8 until someone looks at it.
- Not yet done: run `live-data-checks.sql` on the live database, block by block, before go-live (go-live log G10).
- Lesson: scripts kept outside the repository go stale unnoticed. The README tells the next author to fix a block in the same change whenever a migration renames or drops a column.

## Pass 88 — Delivery by push, migrations applied by the Supabase GitHub integration (18 Oct 2026, `0602487`, `811527a`, `b5ea6d0`, migration 0121)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude; 0121 applied by Supabase and confirmed on the live database.

- [x] **Found:** Supabase's migration history stopped at 0007. Migrations 0008 to 0120 had been run by hand in the SQL Editor, which records nothing, so the GitHub integration (Deploy to production on `main`) had been stuck on 0008 since then.
- [x] **Fixed:** `scripts/db/mark-migrations-applied.sql` (run once by Ravi: 120 rows, newest 0120) records 0008 to 0120; it refuses to run unless 0120's changes exist.
- [x] **Proved end to end:** migration 0121 (a description on the `public` schema only) was pushed to `main` and applied by the integration within about two minutes (121 rows, newest 0121). Suite mp121; 40 suites OK.
- [x] **New delivery method:** Claude pushes the session branch and fast-forwards `main` (`docs/GIT-WORKFLOW.md`); no patches; Ravi runs no SQL. Claude has a Supabase connector with write tools blocked and uses Execute SQL for read-only queries only.
- [x] Documents updated: handoff, deployment log, working agreement, what was built, open items, readiness rating, `supabase/README.md`, `CLAUDE.md`.
- Still open: the skill `invento-patch-delivery` (claude.ai settings) still describes patches; Ravi to update or retire it. LW-11 moves to migration 0122.
- Lesson: never run a migration by hand once an automatic deployer is connected; the deployer's history and the database drift apart silently.

## Pass 89 — Database checks run read-only on the live database (18 Oct 2026, documents only)
**Nothing in the database was changed.** Claude ran every block of `scripts/sql/live-data-checks.sql` (97 blocks, SELECT only) and the open live-check queries through the Supabase connector. Migrations: 121 recorded, newest 0121.

- [x] **Invariants (rows mean something is wrong):** INV-S1 to S9, INV-Q2, Q4 to Q7, Q9, Q10, INV-P1 to P4, P6 to P8, P10 and INV-K1 to K6, K8 to K11 return no rows. Stock, production and packaging figures agree with the ledger.
- [x] **LW-11 confirmed a false alarm** (INV-S10 / Stock Integrity Check S9): RM-00004-02/26 on PO-0032 has a receipt of 100 kg (12-10-2026 17:45) and its reversal at the reopen (18:49), samples returned too; net 0. Fix stays migration 0122, waiting on Ravi. Until then the Stock Integrity Check shows 8 of 9 passed (E56, E62).
- [x] **E8 audit log:** 1,032 kB (745 rows); database 19 MB of the 500 MB free plan.
- [x] **E70:** no finished product batch is due for retest yet (earliest 05-01-2027) and none has been retested; E9: no production raw material retest yet. Both stay open.
- Old test data the checks flag (made before the rule that now stops it; no action unless Ravi wants it cleaned before go-live):
  - INV-Q1: 12 approved QC records with no expiry date (AR-001 to AR-014, 28 Sept to 3 Oct, before 0098 made expiry required).
  - INV-Q3: 4 approved records whose retest date is after the expiry date (ARRM-0001/26, 0002/26, 0003/26, 0009/26; before LW-01's rule in 93de17e).
  - INV-Q8 / P7-E: RM-013 Musta batch RM-013-01/26 expired 07-10-2026 with 3.15 kg still in stock.
  - INV-P5: FP-00002-02/26 (in process) started 27-09-2026, a day before its MFR was approved (before the A24 date rule).
  - P3-B: PO-0003 was reopened on 30 Sept with an approved QC record (before the E53 guard in 0112).
  - P2-C: RM-00003 Dink has no Item type (before E20). P2-E: vendor V-0006 has no phone, mobile or e-mail; V-0004 has its address in the mobile field.
- Informational: INV-P9: four components of FP-00003-01/26 and one of FP-00004-01/26 carry binary-fraction tails (for example 0.6958000000000002); screens round them. INV-K7: PKG-0002 is missing from the series. P1-F: every QC record was decided by one person in both rounds (the System Administrator, allowed; INV-Q5 is clean). P1-A: the anonymous role can still execute 41 trigger functions; trigger functions cannot be called directly, so no exposure, but the expected list was 4 helpers. P1-D: schemas `backup_20260913_1116` (25 tables, pre-purge copy) and `legacy` (31 tables) are still there; drop the backup before go-live (B10). P2-K: no opening stock load has been made on the live database yet (E33, E34, E35, E63, E65 untested).
- Not run: P9-B and P9-C (column lists for the paper-form comparison) and P7-D (30-day ledger summary): reference output, nothing to judge.

## Pass 90 — Migration 0122: Stock Integrity Check S9 compares the net receipt (18 Oct 2026, `3444733`)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude (Ravi: go ahead with migration 0122); applied by the Supabase GitHub integration.

- [x] **LW-11 fixed:** S9 flagged any purchase receipt row on a line that is not submitted, so PO-0032 (submitted, then reopened: receipt of 100 kg plus its reversal, net 0) showed as a difference. S9 now flags such a line only when its purchase receipts do not net to zero. The other eight checks are unchanged.
- [x] `scripts/sql/live-data-checks.sql` INV-S10 uses the same rule. Suite ic122 (11 checks: reopened order clean, a stray receipt still found and explained, resubmit clean, other roles refused); 41 suites OK.
- [x] **Checked on the live database after 0122** (read-only transaction, as the System Administrator): S1 to S9 all 0 problems; a non-admin user is refused. Ledger rows 209. Repeatable as block INV-SIC in `scripts/sql/live-data-checks.sql`.

## Pass 91 — Testing: unit tests for the app's own rules, live checks confirmed in the data (18 Oct 2026, no migration)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude (Ravi: fix the Testing row of the rating).

- [x] **30 unit tests** (`tests/unit/`, `npm test`, Node's built-in test runner through `tsx`; no new package): FIFO allocation (cascade, shortfall, dust, the same batch never promised twice), unit conversion, money rounding, stock precision, limits, batch QC state, usable stock split, ageing buckets, QC rounds and results, yield rule, low stock, date rules, India dates and number formats, database error messages, name and paging helpers. They pass in UTC, New York and India time. A deliberately broken FIFO made the matching test fail.
- [x] `allocateFifo()` moved from `finished-product/new/compose/page.tsx` to `lib/fifo.ts` (no change in behaviour) so it can be tested; `Allocation` is defined once there.
- [x] `tsconfig.json` leaves `docs/` out: the archived scan scripts there broke `npx tsc --noEmit`.
- [x] **Live checks, data side (read-only):** evidence written into E10, E12, E20, E22, E27, E28, E29, E31, E32, E33, E36, E37, E40, E47, E53, E55, E57, E60, E61, E67 and E68 of the master list. What each still needs on screen is unchanged.
- Finding for Ravi (no change made): an approved MFR that no batch has used can be deleted by the System Administrator, and its finished product item stays behind. It happened twice (MFR-0001 on 28 Sept, MFR-0006 on 7 Oct, each deleted within a minute of approval), leaving FP-00001 and FP-00005 with no MFR. For GMP, an approved master record is usually retired (Deactivate), not deleted. **Decided by Ravi 18 Oct 2026: refuse delete once approved (Deactivate only); built as migration 0123 (Pass 92).** FP-00001 and FP-00005 stay as old test data.

## Pass 92 — Migration 0123: an approved MFR cannot be deleted (18 Oct 2026, `0eb9369`)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude (Ravi: "Refuse delete once an MFR is approved (Deactivate only)"); applied by the Supabase GitHub integration.

- [x] A before-delete trigger on `mfr_definitions` refuses any delete of an approved MFR with "MFR … is approved, so it cannot be deleted. Deactivate it instead." It holds for every path, not only the app's. A draft MFR can still be deleted.
- [x] MFR page: the Delete button shows only on a draft (System Administrator); Deactivate stays for approved MFRs. **Confirmed on screen by Ravi, 18 Oct 2026: no Delete button on an approved MFR.**
- [x] Suite md123 (8 checks); sec04, a0085 and a0086 now expect the refusal instead of the delete. 42 suites OK; unit tests 30/30; build clean.

## Pass 93 — Migration 0124: function access hardening (18 Oct 2026, `402266c`)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude (Ravi: "Lock only what no screen uses"); applied by the Supabase GitHub integration.

- [x] Every trigger function lost EXECUTE for public, anon and authenticated (Supabase advisor: 24 anon-callable, most of the 74 signed-in-callable). Triggers still fire: PostgreSQL checks the right only when a trigger is created.
- [x] `can_manage_coa_template`, `check_sufficient_stock` and `stability_reserve_left` are database-only: no screen, policy, view or invoker function calls them (checked against the code and the live catalog); their callers (`upsert_coa_template`, the packaging triggers, `start_retest`) run as the owner.
- [x] Every public function has `search_path = public, extensions` (advisor: 48 without), the path API sessions already use.
- [x] The migration checks all three outcomes itself. Suite sh124 (6 checks, including every function the app calls still open); sa113 updated for the closed helper. 43 suites OK, unit tests 30/30.
- Purge left unchanged (Ravi: needed for the testing cycle; C8 at go-live).

## Pass 94 — Code quality check and no-behaviour-change cleanup (18 Oct 2026, no migration)
**Deploy status: live 18 Oct 2026.** Pushed to `main` by Claude (Ravi: go for the no-behaviour-change cleanup).

- Check (whole app, about 41,000 lines): 0 type errors, 0 lint errors, 3 justified `any`, no `@ts-ignore`, no debug logs, 1 TODO, 1.9% duplicated lines, no swallowed errors; `npm audit`: 2 moderate in `uuid` under `exceljs` (a function the app does not use).
- [x] Lint ignores parameters named with a leading `_` (server actions must accept `prevState, formData`): 44 noise warnings gone; lint now reports 0 problems.
- [x] Removed code nothing used: `lib/supabase/client.ts` (browser client), `fpEligibleForLabel()`, `ITEM_CATEGORIES`, and one lint suppression that suppressed nothing.
- Checks: type-check, lint, build, 30 unit tests, 43 database suites.
- Open, needs Ravi's go-ahead (touch screens, no behaviour change intended): split `lib/actions/bulk-upload.ts` (1,615 lines) by module; merge the Add line / Edit line purchase forms (~250 duplicated lines); one shared retest card for the three QC sections; look at the four suppressed hook warnings in the feedback widget alongside E10.
