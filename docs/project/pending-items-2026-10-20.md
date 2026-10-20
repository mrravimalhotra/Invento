# Invento: pending items (20 Oct 2026)

Everything still open, in one place, as of `main` after 18 Oct 2026 (migrations 0001 to 0125 live; next 0126; next known-issues pass 99).
Source of truth stays `docs/project/open-items-master-list.md` (full wording, history and closed items) and `docs/project/go-live-readiness-log.md`; this file is a working summary of what is left.

## 1. Decided, waiting for a mockup and build

Ravi decided these on 18 Oct 2026. Each is built after its mockup is approved (P8-01 is done: migration 0125).

| # | Item | Decision |
|---|---|---|
| SCAN-P4-09 | Certificate (COA) can never be voided or replaced; a second certificate for the same QC record is accepted | QC Reviewer or System Admin may void with a reason; the replacement links to the voided one; a second valid certificate is refused; voided ones stay on the register marked Void. |
| SCAN-P6-01 | A packaging issue made by mistake can never be undone | Inventory Manager or System Admin may void with a reason at any time; bulk, material and packed count return through new ledger rows; issue shows Void. No Store/R&D returns yet. |
| SCAN-P5-04 | A finished product batch cannot be corrected after Complete, nor closed when it fails | Manager or System Admin may send a Complete - Awaiting QC batch back to In Process (before QC starts); an In Process batch may be closed as failed (raw material stays used, no yield, status Closed). Both audited. |

## 2. Live checks waiting on Ravi (screen checks)

62 checks. The data side of many was confirmed read-only on 18 Oct (see the notes in the master list).

| # | What to check | Note |
|---|---|---|
| E1 | Printed outputs (pass 53) |  |
| E2 | Exports (pass 54) |  |
| E3 | Bulk upload, all 8 modules |  |
| E4 | Purge button |  |
| E5 | Single-screen New PO (13 Sept) |  |
| E6 | Account flows (passes 30 and 36) |  |
| E8 | Audit log size | Database side checked 18 Oct (1 MB of 500 MB); repeat before go-live. |
| E9 | Production-batch retest | No production raw material batch has been retested yet. |
| E11 | Part A batch 1 (pass 55) |  |
| E12 | Part A batch 2 (pass 56) |  |
| E13 | Part A batch 3 and Production issue (pass 57) |  |
| E14 | COA upload fix and clearer errors (pass 58) |  |
| E15 | Success/failure messages and B23 (pass 59) |  |
| E16 | B26 and B15 (pass 60) |  |
| E20 | Item Type mandatory for Raw Material |  |
| E22 | FIFO hard rule (0090) |  |
| E27 | FB-0052 several lines, Production (0095) | Partly checked 2 Oct; a Production save with R&D is confirmed in the data. |
| E28 | FB-0050 short batch number |  |
| E29 | FB-0053 COA templates per item / MFR (0096) |  |
| E30 | A24 / FB-0055 date entry rules (no migration) |  |
| E31 | FB-0058 / FB-0061 expiry date and last retest (0098) |  |
| E32 | FB-0059 AR number format (0099) |  |
| E33 | B4 / FB-0054 opening stock part 1 (0100) | No opening stock loaded on the live database yet. |
| E34 | B4 / FB-0054 opening stock part 2, finished product (0101) | No opening stock loaded on the live database yet. |
| E35 | Legacy tag on Reports and lists (no migration) | Needs an opening stock load first. |
| E36 | B32 / FB-0046 company details (0102) |  |
| E37 | B41 / FB-0057 Rejected Materials and Stock In / Stock Out (0104) |  |
| E38 | Stock Position by QC status (0105) |  |
| E39 | Batch Trace (0106) |  |
| E40 | B34 / FB-0049 / FB-0056 QC told when a finished product batch starts (no migration) |  |
| E41 | Stock Statement (0107) |  |
| E42 | Expiry & Retest Ageing (0108) |  |
| E43 | Retained Samples (0108) |  |
| E44 | Stock Statement drill-down |  |
| E45 | Excel uploads (B2, B9; no migration) |  |
| E46 | B4 password reset link | First set the two Supabase settings (redirect URL, reset e-mail template). |
| E47 | Purchase (0109): Received on, price/GST, empty order |  |
| E48 | Screens changed by group 1 |  |
| E49 | Bug-fix group 2 (0110): figures and quantities |  |
| E50 | Bug-fix group 3 (0111): clean-ups |  |
| E51 | Bug-fix group 4 wave 1 (no migration): error pages and subtitles |  |
| E52 | Bug-fix group 4 wave 2 (no migration): lists and batch page |  |
| E53 | Bug-fix group 5 (0112): approved batches, retests, labels, COA |  |
| E54 | Documentation and clean-up (no migration) |  |
| E55 | Security group (0113): public key, automatic sign-out, Profile password |  |
| E56 | Reliability group (0114): Stock Integrity Check, Labels search, New packaging issue, PDF limit | Parts 1 and 2 confirmed 18 Oct; parts 3 to 6 are screen checks. |
| E57 | Data-integrity group (0115): duplicate names, item rules, COA check, stale edit, display names |  |
| E58 | Convenience group (no SQL): sorting, phone use, dropdowns, Audit Log |  |
| E59 | PDF group (no SQL): certificate layout, sideways table PDFs, Unicode font |  |
| E60 | Limits group (SQL 0116 run 12 Oct 2026): quantity, price and text ceilings, 10-times warning |  |
| E61 | Accounts group (SQL 0117 run 12 Oct 2026): sign-in log, vendor Active tick, edit invoice details | No failed sign-in recorded yet; mistype a password once. |
| E62 | Stock Integrity Check explains each difference (SQL 0118 run 12 Oct 2026, push 20fb5c0) | Part 1 confirmed 18 Oct; part 3 (User Guide cards) left. |
| E63 | Opening Stock: type the rows in on the page (push 445fe1c, no SQL) | Needs an opening stock load. |
| E64 | Quick wins (push e9dba65, no SQL) |  |
| E65 | Opening Stock: Loaded by column (push 72af8e4, no SQL) | Needs an opening stock load. |
| E66 | Item Master: COA template column (push 91c41ab, no SQL) |  |
| E67 | QC results, reasons and rejection control (SQL 0119 run 12 Oct 2026, push 8d2c7a3) |  |
| E68 | Legacy tag fix (push 9ca548a, no SQL) |  |
| E69 | Live walk fixes (push b9edc35, no SQL) |  |
| E70 | Finished product retest (SQL 0120 run, push 93de17e) | No finished product batch is due yet (earliest 05-01-2027); needs a data change to test. |
| E71 | P8-01 equipment calibration (0125, push 4c95666) |  |
| E72 | Phone basics (Pass 98, no SQL) |  |

Also walk after the 18 Oct code-quality pass (Pass 97, no behaviour change): add and edit a purchase line; QC page retest cards and a rejection; Rejected Materials, Retained Samples, Expiry & Retest Ageing (open, search); one small bulk upload; one feedback note.

## 3. Decisions needed from Ravi

### 3.1 Requirements and scope (section B of the master list)

| # | Item | Question / status |
|---|---|---|
| B1 | Everyone with any role can read everything | Should some roles not see vendor prices or formulae? |
| B2 | COA wording is composed in the browser and stored as sent | Lock the data fields and allow only free-text remarks, or keep it editable? |
| B3 | MFA for System Admin | Wanted? (Leaked-password protection needs the Supabase Pro plan.) |
| B5 | Vendor credit/debit running balance | Not built; listed as a non-goal in the design doc. |
| B6 | Sales / Customer module | Not built; non-goal in the design doc. Confirm out of scope. |
| B7 | Employee / Payroll / Staff information module | Not built (name, DOB, IDs, insurance, health check-up, Staff ID). Sensitive data would need its own access controls. Confirm out of scope. Scan P9 (SCAN-P9-08): training record is separate from the staff master. |
| B8 | Barcode scanning | Printing exists; scanning does not. "All products from day one" phasing undecided. |
| B9 | Purchase intimation as Word/Excel | PDF only. List Excel exports are done. |
| B11 | Move off Supabase/Vercel? | Options written up; no decision recorded. |
| B12 | Campus/LAN-only access | The app is reachable from anywhere; never ruled in or out. |
| B13 | SOP/STP as a full workflow | Today a URL register (title, revision, file link, effective date). Screen not in use yet. Scan P8 (SCAN-P8-06, 07): even for the plain register, old revisions cannot be retired and duplicates are accepted. Scan P9 (SCAN- |
| B14 | Finer role model | Six fixed roles vs the old per-user per-module flags. |
| B17 | COA file upload and in-process test reports | COA file is a URL field (accepted as v1); no structured in-process test record. |
| B18 | AR number format vs the mockups | Cosmetic; never decided (`AR-NNN-DDMMYYYY` vs `ARN` + 3 digits + `ddMMyy`). Now raised by the tester as FB-0059; see B43. |
| B19 | Password expiry/complexity | Only a 10-character minimum. |
| B20 | Ready-to-upload test data and the scheduled testing agent | Raised 13 Sept; not built; still wanted? |
| B21 | "Control Sample Qty" for packaging items and packaging purchase lines | Sample fields exist only for raw-material lines. Is Control Sample the QC/Stability/R&D split or one retained-sample quantity? |
| B22 | Purchase restricted to the Production In-charge only; QC limited to reports and AR No. | Today System Admin and Inventory Manager can purchase. Add a narrower role, or accept? |
| B24 | Wastage against production-issued raw-material batches | Wastage records only against purchase batches (flagged, not built; ask before acting). |
| B25 | Labels for production-sourced raw-material batches | The label screen prints only from purchase lines (flagged, not built). |
| B27 | Legacy MFRs with no packaged-item link are not backfilled | Packaging transform skips them. Only matters if legacy MFRs are used for packing. |
| B28 | `documents.doc_type` has no values for label templates or COA templates | Extend the list or keep them separate? |
| B29 | Units list lacks some legacy increments (for example 0.1 kg packs) | Workaround: pack size is free text. |
| B30 | Legacy sample is small (18 of 248 MFRs, 7 batches, 381 ledger opening rows; item codes only up to about LEG-RM-04144) | Widen the import, or is the sample enough? |
| B33 | Label printing: one label instead of six | The 6-up A4 sheet is what you asked for on 19 Sept ("6 labels per page as per template"). Add a "Single label / Sheet of 6" choice, or replace the sheet? Which label types (Raw material, Finished product, In-process)? |
| B44 | Finished product stability check reminders | "Similar to RM": a pop-up at 3, 6, 9 and 12 months after the QC approval date, created 15 days in advance. Today only a retest alert exists for raw material and finished product (B15, 90-day window); FP batches already s |
| B45 | Which date goes where: Invoice Date or Received Date (raised by Ravi, 12 Oct 2026, after PO-0033) | Today: the Raw Material Intimation Slip prints the invoice date (Bill No and Date are the vendor's invoice number and date); the raw material labels print the Received on date as Date of Receipt (the submit date if none  |

### 3.2 Scan findings still needing a decision (section F)

| # | Severity | Area | Finding |
|---|---|---|---|
| SCAN-P1-06 | Medium | Sign-in | Reset and invitation e-mails depend on Supabase's built-in sender (limited volume, may land in spam) |
| SCAN-P3-07 | Medium | Inventory | Only purchased batches can be written off: no write-off for finished product, packed product or in-house raw material, no correction of a wrong wastage, no stock adjustment or physical count |
| SCAN-P5-01 | Medium | MFR | The person who creates an MFR can approve it, so a master formula needs no second person (reproduced) |
| SCAN-P6-04 | Medium | QC, Production raw material | Raw material made from Production can be approved by QC with no sample taken and an expiry unrelated to its source finished product batch (reproduced) |
| SCAN-P2-05 | Low | Vendors | Editing a vendor's name or address changes how old purchase orders and labels print; contact details unchecked |
| SCAN-P3-04 | Low | Stock (FIFO) | First-in-first-out guard orders by when the line was typed, not arrival; no expiry rule |
| SCAN-P3-09 | Low | Wastage | A write-off needs no second person, whatever the quantity |
| SCAN-P4-07 | Low | QC, document control | AR numbers are used up by failed or rolled-back saves; gaps are unexplained (reproduced) |
| SCAN-P4-12 | Low | COA templates | Specifications can be changed by Inventory and MFR Managers with no QC review |
| SCAN-P5-03 | Low | MFR | Procedure and yield limits change after approval with nothing on the printout to show it |
| SCAN-P5-10 | Low | Finished product | A raw material deactivated after MFR approval is still offered and consumed |
| SCAN-P5-12 | Low | Batch Record | Record does not name the MFR code, version or approval, carries no procedure, and can only be printed after completion |
| SCAN-P7-03 | Low | Reports | RM Stock and Purchase Register filter by a date they do not show; "Received" is the day the line was typed, not the day the order was submitted; rows without a date vanish when a date is set |
| SCAN-P7-04 | Low | Reports | Downloads ignore the search box and Hide legacy switch (more rows than on screen); the PDF file name has no date |
| SCAN-P7-05 | Low | Reports | Purchase Register has no price, GST or value, and there is no stock value report |
| SCAN-P7-06 | Low | Reports | Only four registers: no packaging stock, packaging issues, wastage, rejected or expiry register; FP Register lacks yield quantity |
| SCAN-P7-12 | Low | Dashboard | Finished product alerts: retest dates on products with no retest workflow; expiry alerts for batches with nothing left |
| SCAN-P9-01 | Medium | Quality system | No place for deviations, out-of-specification results, change control, CAPA, complaints or self-inspection (six of the ten Missing checklist rows) |
| SCAN-P9-02 | Medium | Vendors, receipt | Vendors carry contact details only (no approval status or licences); a receipt does not capture supplier lot, manufacturer, manufacture date or condition of goods |
| SCAN-P9-03 | Medium | Batch release | Release rests on QC approval alone: no signed batch record to review (weighed quantities, who, equipment, times) and no release checklist |
| SCAN-P9-04 | Low | Rejected material, rework | No return-to-vendor / destruction record for a rejected batch; no reprocessing path for finished product |
| SCAN-P9-05 | Low | Retained samples | The tab has no storage location, retain-until date or disposal record |
| SCAN-P9-06 | Low | Labels, documents | Printing and downloads are not logged; no label issue and reconciliation record |
| SCAN-P9-07 | Low | Alerts | Alerts exist only as Dashboard cards; no e-mail or WhatsApp digest for retest, expiry, calibration, QC waiting |
| SCAN-P9-08 | Low | Training | No training record or SOP "read and understood" acknowledgement |
| SCAN-P9-09 | Low | Stability | Stability is a sample quantity, not a programme: no study, pull schedule or result record (builds on B44) |

## 4. Parked or on hold (Ravi's call)

| # | Item | Status |
|---|---|---|
| C1 | RM Report "As On Date" shows today's quantities | Parked. |
| C2 | MFR/BMR format: Word or PDF (includes "MFR print formatting") | "Hold on to this one." |
| C3 | Line Clearance part to move to BMR, done by QC | On hold; do not touch ("to be reviewed at later date"). |
| C4 | QC report template as a downloadable PDF | On hold; do not touch. |
| C5 | Documents links accept any URL type | Deferred until the screen is used. Scan P8 (SCAN-P8-07): revision and link checks are on the screen only. |
| C6 | Bulk upload reads the whole file before the row limit | No action for now. |
| C7 | No length limits on typed text | No action for now. |
| C8 | Purge has no environment guard | No action for now. High once real data exists. Ravi, 18 Oct 2026: the purge button stays (System Administrator) for the whole testing cycle; add the guard or remove it at go-live. |
| C9 | Environmental Control range and excursion checks | Skipped 12 Sept; needs area ranges first. Scan P8 (11 Oct 2026, SCAN-P8-05): the smaller step needs no ranges (require one value, typing guard 0 to 100 %RH). |
| C10 | Sample unit chosen at purchase is not stored | Scoped and deferred 14 Sept. Needs a new column and about 10 files. |
| C11 | One packaged item per finished product, so pack sizes pool into one count | Not to be built yet (14 Sept). |
| C12 | `LEG-PKG-00055` and `LEG-PKG-00115` show negative stock | Left flagged; the stock guard blocks further pulls. |
| C14 | No automated tests or CI | Deferred by Ravi, 29 Sept. Would include the staging Supabase project (R-1) and Playwright / SQL tests (R-2). Go-live decision (Ravi, 18 Oct 2026): taken care of at go-live with the move to Supabase a |
| C15 | Full content-security policy still report-only | On hold, Ravi, 29 Sept. Framing is already blocked; only the script policy reports. |
| C16 | Stock views recompute the whole ledger on every read | Measured 29 Sept 2026 on a 400,000-row ledger: `stock_balance` 53 ms, `item_position` 100 ms, one item 1–5 ms. A maintained summary table would add risk to the stock figures for no visible gain at thi |
| C17 | Reports and Item Master send every row to the browser | On hold, Ravi, 29 Sept 2026: "will take decision later". Scan P7 (11 Oct 2026, SCAN-P7-02, duplicate): measured on a test database with 92,000 lines, Reports makes about 190 requests of 70 to 100 ms e |
| C19 | Phone fit of the main screens (Dashboard, Purchase, QC, Inventory Ledger: wide tables and forms still side-scroll) | Parked, Ravi, 30 Sept 2026. Menu (E17) and install (E18) are done. Reopened by Ravi 18 Oct 2026: basics applied (Pass 98); phone-first set = Dashboard and Labels; their mockup (alerts first, charts fo |
| SCAN-P3-14 | 'Taken on' is the date the record was typed, not the sampling or receipt date | Parked by Ravi 12 Oct 2026. |
| SCAN-P7-16 | Old MFR PDF page still reachable by address, unlinked, a second MFR format; signature block can print off the page | Yes: remove it? Parked by Ravi 12 Oct 2026. |
| SCAN-P8-06 | No way to retire an old revision; same title and revision can be added twice; link swappable under the same revision (ov | Parked by Ravi 12 Oct 2026. |
| SCAN-P10-08 | No automatic tests for app code and nothing runs on a push; the 26 database suites are run by hand | Yes: GitHub workflow wanted? Fixes delivered with their suites? Parked by Ravi 12 Oct 2026. |

Also parked on 18 Oct 2026: the Dashboard and Labels phone-first layouts (alerts first, charts folded, label preview fitted to the screen, Download PDF kept in view). The Labels preview is fixed at 320 px and may scroll sideways on 360 px phones; a one-line fix if wanted.

## 5. Go-live (deferred until Supabase Pro and Vercel Pro)

From `docs/project/go-live-readiness-log.md`:

| # | Item |
|---|---|
| G1 | Backups on the paid plan and one tested restore (B10). |
| G2 | Separate test and production projects; `staging` branch (B40). |
| G3 | Production database and Vercel functions in Mumbai. |
| G4 | Automatic checks on every push (type-check, lint, unit tests, database suites) (C14, P10-08). |
| G5 | Custom e-mail sender for reset/invitation e-mails; decide e-mail alerts (P1-06, P9-07). |
| G6 | Leaked-password protection (Pro); MFA decision for System Admin (B3). |
| G7 | Purge guard / purge screen off in production (C8; the button stays for the testing cycle). |
| G8 | Database size check at the switch (E8). |
| G9 | Purge test data in production, load opening stock, close loading. |
| G10 | Clear the live checks (section 2), smoke test on production, run `scripts/sql/live-data-checks.sql` (incl. INV-SIC) on production. |
| G11 | Decisions that change use: B45 (invoice vs received date), P6-04 (production raw material QC). P4-09, P6-01, P5-04 are decided (section 1). |

## 6. Settings and small tasks for Ravi (outside the code)

- Supabase Auth: add the redirect URL `https://invento-atharva.vercel.app/auth/confirm` and set the reset e-mail template link (needed for E46).
- Confirm the GitHub repository is private.
- Vercel Function Region: set it once the go-live region is fixed (G3).

## 7. Old test data the checks flag (no action unless wanted before go-live)

Found by the read-only data checks on 18 Oct 2026 (known issues Pass 89); all made before the rules that now stop them.

- 12 approved QC records with no expiry date (AR-001 to AR-014, 28 Sept to 3 Oct).
- 4 approved records whose retest date is after the expiry date (ARRM-0001/26, 0002/26, 0003/26, 0009/26).
- RM-013 Musta batch RM-013-01/26 expired 07-10-2026 with 3.15 kg in stock.
- FP-00002-02/26 (In Process) started a day before its MFR was approved.
- FP-00001 and FP-00005 have no MFR (their approved MFRs were deleted before 0123).
- RM-00003 Dink has no Item type; vendor V-0006 has no contact; V-0004 has its address in the mobile field.
- Schema `backup_20260913_1116` (25 tables, pre-purge copy) still in the database: drop before go-live.

## 8. Code and maintenance (optional, behaviour unchanged)

- Kept on purpose in the 18 Oct code pass: the two label sheet previews (must match their PDFs exactly), the long linear bulk-upload functions, the history comments.
- Remaining Supabase performance advice: 91 foreign keys without an index, 5 access rules that re-check the user per row, 40 duplicate access rules (mostly on deprecated BMR tables). A behaviour-neutral migration if wanted.
- `npm audit`: 2 moderate in `uuid` under `exceljs` (a function the app does not use).
