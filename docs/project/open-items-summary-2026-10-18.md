# Invento: open items summary (18 Oct 2026)

Short form of `claude/open-items-master-list.md` (the full register, with every closed item, ticket and decision). This file lists only what is still open, parked or waiting, so a new session can see the whole picture in one read. Counts below are from the master list as of 12 Oct 2026 plus the 18 Oct go-live decision.

## Scoreboard

| Group | What it is | Count |
|---|---|---|
| 1A | To fix, no decision needed | 0 |
| 1B | Open, needs Ravi's decision or scoping | 34 |
| 1C | Parked or on hold by Ravi | 17 |
| 1D | Accepted by design, no action, deprecated | 42 |
| 1E | Waiting on Ravi: live checks | 55 |
| 1F | Scan findings open | 36 (0 High, 12 Medium, 24 Low); 86 fixed, 14 accepted, 3 set aside |

## Needs Ravi first (highest value)

1. **Live check E70** (finished product retest, 7 steps). Ask Claude for the SQL line that moves one batch's approval back so it falls due.
2. **"Go" on the corrections group**: P4-09 (void or replace a certificate), P6-01 (void a packaging issue), P5-04 (correct or close a finished product batch), P8-01 (equipment calibration status).
3. **Decisions:** B45 (invoice date or received date, per output), P6-04 (production raw material QC), MFA (B3), P9-01 (paper or app for deviations and CAPA).
4. **Quick wins:** Vercel Function Region to Tokyo (hnd1) and redeploy now; Mumbai (ap-south-1 plus bom1) when the production project is created (reminder on record).
5. **Mobile:** say "go" for the read-only phone-width walk, then the two fix patches (see the handoff, section 8).
6. **Go-live register** (`claude/go-live-readiness-log.md`): G1 to G11, deferred to go-live with the move to Supabase Pro and Vercel Pro.

## Live checks waiting (E-numbers)

E1 to E16, E20, E22, E26 (partly), E27 (partly), E28 to E70 as listed in Part 1E of the master list. Most recent and most important: E62 (integrity check wording), E63 (typed opening stock), E64 (quick wins), E65 (Loaded by), E66 (Item Master COA column), E67 (QC results and rejection control), E68 (Legacy tag), E69 (live walk fixes), E70 (finished product retest). Not covered by any live walk: Batch Trace results, forms, PDF and Excel downloads, sign-in and Profile pages.

## B. Open: needs Ravi's decision or scoping first

- **B1** (DES-01) Everyone with any role can read everything. Should some roles not see vendor prices or formulae?
- **B2** (DES-09) COA wording is composed in the browser and stored as sent. Lock the data fields and allow only free-text remarks, or keep it editable?
- **B3** (SEC-09) MFA for System Admin. Wanted? (Leaked-password protection needs the Supabase Pro plan.)
- **B4** (Req #12) Opening balance entry. Fully built and live 4 Oct 2026: part 1 raw material and packaging (live check E33; commit 4ef09bd, migration 0100) and part 2 finished product, packed and bulk (live check E34; commit 1d9d49c,…
- **B5** (Req #11) Vendor credit/debit running balance. Not built; listed as a non-goal in the design doc.
- **B6** (Req #9) Sales / Customer module. Not built; non-goal in the design doc. Confirm out of scope.
- **B7** (Req #9) Employee / Payroll / Staff information module. Not built (name, DOB, IDs, insurance, health check-up, Staff ID). Sensitive data would need its own access controls. Confirm out of scope. Scan P9 (SCAN-P9-08): training record is separate from the…
- **B8** (Req #16) Barcode scanning. Printing exists; scanning does not. "All products from day one" phasing undecided.
- **B9** (Req) Purchase intimation as Word/Excel. PDF only. List Excel exports are done.
- **B10** (Req #5) Backup and restore policy ("backup after 7 days" in the old app). Nothing scheduled or documented, only the one-off pre-purge script. Parked, Ravi, 30 Sept 2026 (recommended first before real data). Scan P9 (11 Oct 2026) ranks this first among the gaps: before real…
- **B11** (Hosting) Move off Supabase/Vercel?. Options written up; no decision recorded.
- **B12** (Req #2) Campus/LAN-only access. The app is reachable from anywhere; never ruled in or out.
- **B13** (Req #3) SOP/STP as a full workflow. Today a URL register (title, revision, file link, effective date). Screen not in use yet. Scan P8 (SCAN-P8-06, 07): even for the plain register, old revisions cannot be retired and duplicates are…
- **B14** (Req #10) Finer role model. Six fixed roles vs the old per-user per-module flags.
- **B17** (Req #18) COA file upload and in-process test reports. COA file is a URL field (accepted as v1); no structured in-process test record.
- **B18** (Req #4) AR number format vs the mockups. Cosmetic; never decided (`AR-NNN-DDMMYYYY` vs `ARN` + 3 digits + `ddMMyy`). Now raised by the tester as FB-0059; see B43.
- **B19** (Req) Password expiry/complexity. Only a 10-character minimum.
- **B20** (Tasks 57/58) Ready-to-upload test data and the scheduled testing agent. Raised 13 Sept; not built; still wanted?
- **B21** (Req) "Control Sample Qty" for packaging items and packaging purchase lines. Sample fields exist only for raw-material lines. Is Control Sample the QC/Stability/R&D split or one retained-sample quantity?
- **B22** (Req) Purchase restricted to the Production In-charge only; QC limited to reports and AR No.. Today System Admin and Inventory Manager can purchase. Add a narrower role, or accept?
- **B24** (Req) Wastage against production-issued raw-material batches. Wastage records only against purchase batches (flagged, not built; ask before acting).
- **B25** (Req) Labels for production-sourced raw-material batches. The label screen prints only from purchase lines (flagged, not built).
- **B27** (Req) Legacy MFRs with no packaged-item link are not backfilled. Packaging transform skips them. Only matters if legacy MFRs are used for packing.
- **B28** (Req) `documents.doc_type` has no values for label templates or COA templates. Extend the list or keep them separate?
- **B29** (Req) Units list lacks some legacy increments (for example 0.1 kg packs). Workaround: pack size is free text.
- **B30** (Data) Legacy sample is small (18 of 248 MFRs, 7 batches, 381 ledger opening rows; item codes…. Widen the import, or is the sample enough?
- **B32** (FB-0046) Report header: licence "PD/AYU/111" and company name directly below the logo. Built and live 4 Oct 2026 (live check E36; commit 0c405a4, migration 0102; save fixed by 0103, commit 8671b44). Ravi: licence is editable in the app. New Admin → Company Details screen (System…
- **B33** (FB-0048) Label printing: one label instead of six. The 6-up A4 sheet is what you asked for on 19 Sept ("6 labels per page as per template"). Add a "Single label / Sheet of 6" choice, or replace the sheet? Which label types (Raw material, Finished…
- **B34** (FB-0049) Tell QC when a finished-product batch is started. Built and live 10 Oct 2026 (live check E40; commit c25bdd6, no migration). Ravi's wording in FB-0056 put the trigger at Submit / In Process, so a batch shows in the new "Finished Product Batches In…
- **B41** (FB-0057) Quality Control (Namrata): after QC rejects a raw material it is added in stock; see…. Built and live 5 Oct 2026 (live check E37); still Awaiting review on the screen until Ravi sets it to Implemented. Logged as B41. Rejected raw material now leaves On hand and is listed in Inventory →…
- **B44** (FB-0060) Finished product stability check reminders. "Similar to RM": a pop-up at 3, 6, 9 and 12 months after the QC approval date, created 15 days in advance. Today only a retest alert exists for raw material and finished product (B15, 90-day window);…
- **B40** (Env) Separate test and production environments. Plan saved 2 Oct 2026 (`claude/environments-plan.md`): `staging` branch + second Supabase project + Vercel Preview variables; code moves test to production by SQL then `git push origin staging:main`.…
- **B45** (Dates) Which date goes where: Invoice Date or Received Date (raised by Ravi, 12 Oct 2026, after…. Today: the Raw Material Intimation Slip prints the invoice date (Bill No and Date are the vendor's invoice number and date); the raw material labels print the Received on date as Date of Receipt (the…
- **B46** (Live walk) Screen mistakes found by looking at the live app, 12 Oct 2026 (LW-01 to LW-11, detail in…. 11 findings, all display or wording: retest date after expiry on the QC list and Ageing (LW-01), Ageing intro date format (LW-02), Rejected on blank (LW-03), RM Report PQTY/SQTY headings (LW-04), COA…

## C. Parked or on hold by Ravi

- **C1** (ACC-11) RM Report "As On Date" shows today's quantities. Parked.
- **C2** (Export (a)) MFR/BMR format: Word or PDF (includes "MFR print formatting"). "Hold on to this one."
- **C3** (FB-0038) Line Clearance part to move to BMR, done by QC. On hold; do not touch ("to be reviewed at later date").
- **C4** (FB-0036) QC report template as a downloadable PDF. On hold; do not touch.
- **C5** (SEC-05) Documents links accept any URL type. Deferred until the screen is used. Scan P8 (SCAN-P8-07): revision and link checks are on the screen only.
- **C6** (SEC-08) Bulk upload reads the whole file before the row limit. No action for now.
- **C7** (SEC-11) No length limits on typed text. No action for now.
- **C8** (SEC-13) Purge has no environment guard. No action for now. High once real data exists.
- **C9** (L-2) Environmental Control range and excursion checks. Skipped 12 Sept; needs area ranges first. Scan P8 (11 Oct 2026, SCAN-P8-05): the smaller step needs no ranges (require…
- **C10** (Req #20) Sample unit chosen at purchase is not stored. Scoped and deferred 14 Sept. Needs a new column and about 10 files.
- **C11** (Req #19) One packaged item per finished product, so pack sizes pool into one count. Not to be built yet (14 Sept).
- **C12** (SX-2) `LEG-PKG-00055` and `LEG-PKG-00115` show negative stock. Left flagged; the stock guard blocks further pulls.
- **C14** (A21 / DES-14) No automated tests or CI. Deferred by Ravi, 29 Sept. Would include the staging Supabase project (R-1) and Playwright / SQL tests (R-2). Go-live…
- **C15** (A22 / SEC-10 (rest)) Full content-security policy still report-only. On hold, Ravi, 29 Sept. Framing is already blocked; only the script policy reports.
- **C16** (A15 / PERF-01) Stock views recompute the whole ledger on every read. Measured 29 Sept 2026 on a 400,000-row ledger: `stock_balance` 53 ms, `item_position` 100 ms, one item 1–5 ms. A…
- **C17** (A19 / PERF-05) Reports and Item Master send every row to the browser. On hold, Ravi, 29 Sept 2026: "will take decision later". Scan P7 (11 Oct 2026, SCAN-P7-02, duplicate): measured on a…
- **C18** (Housekeeping) CLOSED 18 Oct 2026 (`b54da87`): the read-only SQL checks are in `scripts/sql/` (see Pass 87). Left out on purpose: the cleanup, backup and bug-reproduction scripts. `live-data-checks.sql` run read-only on the live database 18 Oct 2026 (Pass 89); run again on production before go-live.
- **C19** (Mobile) Phone fit of the main screens (Dashboard, Purchase, QC, Inventory Ledger: wide tables and forms…. Parked, Ravi, 30 Sept 2026. Menu (E17) and install (E18) are done.

## F. Scan findings still open (36)

- **SCAN-P1-06** [Medium] Sign-in: Reset and invitation e-mails depend on Supabase's built-in sender (limited volume, may land in spam) Decision: Yes: custom SMTP or admin-reset only
- **SCAN-P3-07** [Medium] Inventory: Only purchased batches can be written off: no write-off for finished product, packed product or in-house raw material, no… Decision: Parked by Ravi 12 Oct 2026 (count scope, approval and method all parked; explained in…
- **SCAN-P4-09** [Medium] COA: An issued certificate can never be voided or replaced; a second certificate for the same QC record is accepted (reproduced) Decision: Yes (small): who may void?
- **SCAN-P5-01** [Medium] MFR: The person who creates an MFR can approve it, so a master formula needs no second person (reproduced) Decision: Yes: admin exemption, enough MFR Managers?
- **SCAN-P5-04** [Medium] Finished product: After Create Batch there is no way to correct a typing mistake (yield, expiry, samples) or to close a failed batch (reproduced) Decision: Yes: who may send back; zero-yield close or loss?
- **SCAN-P6-01** [Medium] Packaging: A packaging issue made by mistake can never be voided, corrected or returned (reproduced) Decision: Yes: who may void; returns from Store or R&D?
- **SCAN-P6-04** [Medium] QC, Production raw material: Raw material made from Production can be approved by QC with no sample taken and an expiry unrelated to its source finished… Decision: Yes: own sample and QC, or inherit the source approval?
- **SCAN-P1-11** [Low] Opening stock: Super Auditor (read-only role) can load opening stock Decision: Decided by Ravi 12 Oct 2026: all roles may load; kept as is.
- **SCAN-P2-05** [Low] Vendors: Editing a vendor's name or address changes how old purchase orders and labels print; contact details unchecked Decision: Yes: note only or snapshot
- **SCAN-P2-11** [Low] Opening stock: Page does not show who loaded each file; uploaded file not kept Decision: Partly done 12 Oct 2026: Loaded by column built (E65); file copy not kept (Ravi).
- **SCAN-P3-04** [Low] Stock (FIFO): First-in-first-out guard orders by when the line was typed, not arrival; no expiry rule Decision: Yes: FIFO or first-expiry-first-out?
- **SCAN-P3-09** [Low] Wastage: A write-off needs no second person, whatever the quantity Decision: Yes: approval for large write-offs?
- **SCAN-P3-14** [Low] Retained Samples: 'Taken on' is the date the record was typed, not the sampling or receipt date Decision: Parked by Ravi 12 Oct 2026.
- **SCAN-P4-07** [Low] QC, document control: AR numbers are used up by failed or rolled-back saves; gaps are unexplained (reproduced) Decision: Yes (small): gap-free series needed?
- **SCAN-P4-12** [Low] COA templates: Specifications can be changed by Inventory and MFR Managers with no QC review Decision: Yes: who owns the specification?
- **SCAN-P5-03** [Low] MFR: Procedure and yield limits change after approval with nothing on the printout to show it Decision: Yes (small): last-revised line or revision list
- **SCAN-P5-10** [Low] Finished product: A raw material deactivated after MFR approval is still offered and consumed Decision: Yes: warn or block?
- **SCAN-P5-12** [Low] Batch Record: Record does not name the MFR code, version or approval, carries no procedure, and can only be printed after completion Decision: Yes: print from In progress; add procedure?
- **SCAN-P7-03** [Low] Reports: RM Stock and Purchase Register filter by a date they do not show; "Received" is the day the line was typed, not the day the order… Decision: Yes: what is "received"?
- **SCAN-P7-04** [Low] Reports: Downloads ignore the search box and Hide legacy switch (more rows than on screen); the PDF file name has no date Decision: Yes: match the screen?
- **SCAN-P7-05** [Low] Reports: Purchase Register has no price, GST or value, and there is no stock value report Decision: Yes: who may see prices?
- **SCAN-P7-06** [Low] Reports: Only four registers: no packaging stock, packaging issues, wastage, rejected or expiry register; FP Register lacks yield quantity Decision: Yes: which registers?
- **SCAN-P7-12** [Low] Dashboard: Finished product alerts: retest dates on products with no retest workflow; expiry alerts for batches with nothing left Decision: Yes: what should the FP alert mean?
- **SCAN-P7-16** [Low] MFR: Old MFR PDF page still reachable by address, unlinked, a second MFR format; signature block can print off the page Decision: Yes: remove it? Parked by Ravi 12 Oct 2026.
- **SCAN-P8-01** [Medium] Equipment: Calibration status is typed apart from the dates; dates hidden on the list, Excel and read-only page; nothing marks overdue;… Decision: Yes: compute status from dates?
- **SCAN-P8-06** [Low] SOP / STP documents: No way to retire an old revision; same title and revision can be added twice; link swappable under the same revision (overlaps… Decision: Parked by Ravi 12 Oct 2026.
- **SCAN-P9-01** [Medium] Quality system: No place for deviations, out-of-specification results, change control, CAPA, complaints or self-inspection (six of the ten… Decision: Yes: paper by design, or hold them in the app?
- **SCAN-P9-02** [Medium] Vendors, receipt: Vendors carry contact details only (no approval status or licences); a receipt does not capture supplier lot, manufacturer,… Decision: Yes: which fields; warn or block?
- **SCAN-P9-03** [Medium] Batch release: Release rests on QC approval alone: no signed batch record to review (weighed quantities, who, equipment, times) and no release… Decision: Yes: paper or electronic batch records?
- **SCAN-P9-04** [Low] Rejected material, rework: No return-to-vendor / destruction record for a rejected batch; no reprocessing path for finished product Decision: Yes (small)
- **SCAN-P9-05** [Low] Retained samples: The tab has no storage location, retain-until date or disposal record Decision: Yes (small): retention rule
- **SCAN-P9-06** [Low] Labels, documents: Printing and downloads are not logged; no label issue and reconciliation record Decision: Yes (small)
- **SCAN-P9-07** [Low] Alerts: Alerts exist only as Dashboard cards; no e-mail or WhatsApp digest for retest, expiry, calibration, QC waiting Decision: Yes: e-mail, WhatsApp or dashboard only?
- **SCAN-P9-08** [Low] Training: No training record or SOP "read and understood" acknowledgement Decision: Yes: keep on paper?
- **SCAN-P9-09** [Low] Stability: Stability is a sample quantity, not a programme: no study, pull schedule or result record (builds on B44) Decision: Yes: run from this app?
- **SCAN-P10-08** [Medium] Testing: No automatic tests for app code and nothing runs on a push; the 26 database suites are run by hand Decision: Yes: GitHub workflow wanted? Fixes delivered with their suites? Parked by Ravi 12 Oct…

## Known small gaps

- Batch Trace shows the retest QC record but not the retest sample quantity as its own row.
- A reopened opening-stock purchase order can still be edited like any other.
- The COA date lock is on the screen only.
- The Excel file of an opening-stock load is not kept (Ravi's choice).
