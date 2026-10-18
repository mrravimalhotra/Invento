---
title: Scan findings — Phase 4 (quality control, COA and labels)
---

# Phase 4 — Quality control, COA and labels

Steps done: P4.1 to P4.6 (Phase 4 complete). Next: P5.1. (Rewritten whole after every step.)

## Findings

### SCAN-P4-01 — A rejection needs no reason, no confirmation and no second person, and can never be undone
- Severity: Medium
- Kind: Gap (quality control integrity, usability)
- Where: Round 1 form `qc-checker-form.tsx`, Round 2 form `qc-reviewer-form.tsx`, `reviewQcRound1`, `reviewQcRound2`, trigger `trg_qc_enforce_review_stages`, Rejected Materials
- Finding: A Quality Checker can reject a batch in Round 1 with one click on "Save decision". The comments box is optional, there is no "are you sure" step, and the QC Reviewer never sees the record. The rejection is final ("this record can no longer be edited"), and the batch is moved out of On hand into Rejected Materials. Nothing in the app can reverse it: the purchase order cannot be reopened while a batch is rejected (migration 0104), and a rejected record cannot be edited. A wrong click, or a batch rejected for the wrong reason, can only be put right in the database. The same holds for a Round 2 rejection. At the database level a rejection with no comment at all is accepted (tested as Quality Checker and QC Reviewer: Round 1 reject with no comment and Round 2 reject with no comment both ALLOWED).
- Evidence: Local database, `claude/scan-evidence-p4.sql` steps B and C (both ALLOWED, batch status "rejected" with empty comments). Code read: the checker form's text says "Rejecting is final"; `checker_comments` and `review_comments` are optional in both actions.
- Suggested fix: (1) Require a reason of at least a few words for any rejection, in the form, the action and the database trigger. (2) Add a confirmation step for Reject on both forms. (3) Decide how a wrong rejection is corrected: either a Round 1 rejection also goes to the QC Reviewer to confirm, or the System Admin may void a rejection with a written reason (kept in the audit trail, batch returns to Awaiting QC). Size M.
- Needs decision from Ravi: Yes. Should a Round 1 rejection be confirmed by the Reviewer, and may a System Admin void a rejection?
- Confidence: Confirmed (local database and code)
- Status: New (ACC-06 covers reopening used batches; SCAN-P1-08 covers editing decided records)

### SCAN-P4-02 — Several QC rules are enforced only on the screen: expiry date on approval, the 180-day retest cap, sample quantity and unit, the retest limit, and the AR number text
- Severity: Medium
- Kind: Hardening (rules not repeated in the database)
- Where: `reviewQcRound2`, `createQualityCheck`, `startRetest`, table `quality_checks`, trigger `trg_qc_compute_retest_date`, `start_retest()`
- Finding: The rules from FB-0058 (expiry date required to approve) and FB-0061 (retest period at most 180 days, at most 3 retests) are checks in the server action only. A user with a QC role who calls the database directly (or any future screen that forgets the check) gets around them. Tested as Quality Checker then QC Reviewer: a Round 2 approval with a retest period of 400 days and no expiry date was ALLOWED and the batch became QC approved with expiry blank (a batch with no expiry date can never show as expired and never appears in Ageing). A QC record was inserted with a sample of 9999 "bogus" against a batch whose recorded QC sample is 1 kg (no check against the batch or unit). The AR number is whatever text the insert supplies, so a number outside the numbering series, or a future series number, can be taken. The 3-retest limit is counted in the action before calling `start_retest()`; the function itself has no count (it is blocked in practice only because the final retest has no next retest date). Also nowhere is the retest date compared with the expiry date: a 180-day retest period on a batch that expires in 30 days gives a retest date after the expiry.
- Evidence: Local database, `claude/scan-evidence-p4.sql` steps A and D (ALLOWED). Code read: all checks live in `lib/actions/qc.ts` (`MAX_RM_RETEST_DAYS`, `MAX_RM_RETESTS`, expiry required branch).
- Suggested fix: One migration: in `trg_fn_qc_enforce_review_stages` refuse an approval with no expiry date, a retest period over 180 days for raw material, and a retest date later than the expiry date; add a check that the AR number matches the series (or comes from the generator only); check the sample unit converts to the batch unit and the quantity is not above the batch; count retests inside `start_retest()`. Size M (migration, suite, no screen change beyond messages).
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New (nearest: SCAN-P1-07 and P1-08, which are about who may write and edit QC records; this is about which values are accepted)

### SCAN-P4-03 — Expired raw material can be retested, and the only way to approve it is to give it a new, later expiry date
- Severity: Medium
- Kind: Bug (quality control integrity)
- Where: `start_retest()` (migration 0080), Due for retest card (`getDueForRetestLines`), Round 2 form and `reviewQcRound2`
- Finding: A retest is allowed whenever the retest date has arrived; the expiry date is never looked at. A batch that expired long ago still appears on the Due for retest card (the list has no expiry filter), a retest can be started, and at Round 2 the Reviewer must enter an Expiry date that is not before today (the form pre-fills the old, expired date, which the rule then refuses). So the only way to approve the retest is to type a new, later expiry date: the batch comes back into use, and the manufacturer's expiry date is overwritten. Nothing limits a retest approval to the original expiry date either, so a retest can also extend a batch that has not yet expired. Reproduced: a batch that expired on 10 Jan 2025 was retested (ALLOWED), Round 1 approved, Round 2 approved with expiry 1 June 2027; the batch status read approved, expiry 2027-06-01, and 17.5 kg showed as Usable.
- Evidence: Local database, `claude/scan-evidence-p4.sql` (p42_expired_retest, run on a copy without a surrounding transaction). Code read: `getDueForRetestLines` filters on retest date and stock only; `start_retest` checks status and retest date only; `beforeDateError(expiry, today)` in `reviewQcRound2`.
- Suggested fix: (1) Refuse `start_retest()` when the batch's expiry date has passed ("expired; cannot be retested"), and leave expired batches off the Due for retest card (they show in Ageing and Stock Position instead). (2) Refuse a retest approval with an expiry date later than the original (first approved or manufacturer) expiry date. Size S to M (migration, suite, one list filter).
- Needs decision from Ravi: Yes (small). Confirm that a retest never extends the manufacturer's expiry date, and that expired material is not retested.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P4-04 — Finished product has no retest and no expiry control: the retest date set at approval does nothing, and packaging only checks "Approved"
- Severity: Medium
- Kind: Gap (quality control)
- Where: finished product QC approval, `resolveFpBatch` in `lib/actions/packaging.ts`, packaging issue trigger (0068), Due for retest card (raw material only)
- Finding: When QC approves a finished product batch, the Reviewer must give an expiry date and a retest period (any number of days; the 180-day cap is for raw material). But no retest workflow exists for finished product (the migration notes say so), the Due for retest card lists raw material only, and packaging checks nothing but that the batch is Approved: neither the server action nor the database trigger looks at the batch's expiry date or retest date. A finished product batch past its expiry or past its retest date can still be packed and issued, and the Finished Product label is still offered for it (the raw material labels do check expiry; the finished product label checks only that the batch status is approved). Ageing shows such a batch under "Retest overdue" or an expired bucket, but nothing stops it, and the retest date for a finished product is a number without a process behind it.
- Evidence: Code read: `resolveFpBatch` returns an error only when `resolveDisplayStatus` is not approved; `trg_fn_packaging_transform_and_issue` (0068) has no expiry or retest test; `getDueForRetestLines` has `.eq("item_category","raw")`; comment in 0030 says there is no finished product retest workflow in the codebase.
- Suggested fix: Block a packaging issue against a finished product batch whose expiry date has passed (database and action). Decide whether finished product needs a retest at all; if yes, add the same Due for retest and retest start for finished product, if no, stop asking for a retest period at FP approval. Size M.
- Needs decision from Ravi: Yes. Does finished product bulk get retested, or only carry an expiry date?
- Confidence: Confirmed (code, both layers read)
- Status: New

### SCAN-P4-05 — A batch drops off the dashboard's retest and expiry alerts the day after its date passes
- Severity: Low
- Kind: Gap (alerting)
- Where: `app/(dashboard)/dashboard-alerts.ts` (all six queries), dashboard
- Finding: The dashboard lists batches whose retest or expiry date falls between today and 90 days ahead (`.gte(field, today)`). A batch whose date has passed and that still has stock disappears from these lists, and the dashboard has no overdue or expired section. Overdue raw material still shows on the QC Due for retest card and, with expired stock, in Ageing and Stock Position, but the first screen people open goes quiet at the moment the situation gets worse.
- Evidence: Code read: every query in `dashboard-alerts.ts` uses `.gte(field, from).lte(field, to)` with `from` = today; no "overdue" text in the dashboard files.
- Suggested fix: Add an "Overdue" group (date before today, stock left) at the top of each alert list. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P4-06 — The QC list shows only the newest 1,000 records and does not say so; search and Excel export cover only those
- Severity: Low
- Kind: Hardening (completeness of a regulated record list)
- Where: `app/(dashboard)/qc/page.tsx` (`QC_LIMIT = 1000`), `qc-table.tsx`
- Finding: The list of all QC records is read with `.limit(1000)` newest first. The search box and the Excel and PDF exports work on those rows only, and nothing on the screen says that older records exist. Once more than 1,000 AR records exist (retests also create one each), an older AR number typed in the search shows "no results", although the record exists, and an export made for an inspection is silently incomplete. The cards above the list (Awaiting QC, Due for retest, in progress) are paged correctly and are not affected.
- Evidence: Code read: `.order("created_at", { ascending: false }).limit(QC_LIMIT)`; the comment says search runs "only over whatever got fetched"; no truncation notice in the table component. The Inventory Ledger tab shows a cap note; the QC list does not.
- Suggested fix: Server-side search by AR number, batch and item (as Batch Trace does), paging, and a visible "Showing the newest 1,000 of N" line; export through paged reads (`fetchAllRows`). Size M.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New (ACC-08 fixed the cards and other lists, not this one)

### SCAN-P4-07 — AR numbers are used up by failed saves and rolled-back actions, and nothing records the gaps
- Severity: Low
- Kind: Gap (document control)
- Where: `get_next_ar_number()`, `get_next_fp_ar_number()` (migration 0099), `createQualityCheck`, `start_retest()`, `submit_fp_batch_to_qc()`
- Finding: AR numbers come from a database sequence, which moves on even when the save that asked for the number fails or is rolled back. The creation action asks for the number first and inserts the record afterwards, so any failure between the two (a clash with another user's record, a validation error) leaves a number that no record carries. Reproduced: a number issued inside a rolled-back transaction (ARRM-0002/26) was never seen again, and the next call returned ARRM-0003/26. The migration comment accepts this ("a failed save may leave a gap"). For analytical report numbers, an inspector will ask why a number is missing; the app has no list of unused numbers and no way to mark one void with a reason.
- Evidence: Local database, `claude/scan-evidence-p4.sql` (p43_ar): number issued in a rolled-back transaction, next call skips it.
- Suggested fix: Either issue the number inside the same statement as the insert (so a failure rolls back with a sequence-free counter table under lock) or keep a small "AR numbers issued but not used" register that the System Admin can see and annotate. Size M. Lower priority than SCAN-P4-01 to 04.
- Needs decision from Ravi: Yes (small). Is a gap-free AR series required, or is an explained gap acceptable?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P4-08 — A certificate is saved exactly as sent: the batch number, product, test list, specifications and results are not compared with the batch or the template
- Severity: Medium
- Kind: Hardening (regulated document built from unchecked input)
- Where: `generateCoaCertificate` (`lib/actions/coa.ts`), `generate-coa-form.tsx`, table `coa_records`, policy `coa_insert`
- Finding: The form pre-fills the header from the batch and the QC record and the test list from the template, but the server only checks that every value is non-empty. Header values (batch number, product name, AR number, expiry and others) are editable text on the screen, with only four date lines locked, and the JSON the browser sends is stored as is: nothing compares the batch number with the QC record's batch, the test names or specifications with the template, or the number of tests with the template. The database stores any JSON in `header_data` and `result_lines`. Reproduced as Quality Checker: a certificate for an approved AR with batch number "SOMETHING-ELSE", a different product, one invented test with a changed specification ("Assay, NLT 1%, 99%") was saved. A certificate is the document that leaves the company; it should not be possible to issue one whose batch or specification differs from the record it claims to certify.
- Evidence: Local database, `claude/scan-evidence-p4.sql` step A (ALLOWED). Code read: validation loops only test non-empty strings.
- Suggested fix: In the action (and a database trigger), rebuild batch number, product, AR number and dates from the QC record; take test names and specifications from the template and accept only the result and remarks from the form; refuse a line count that differs from the template. Keep free text only for the few fields that are meant to be hand-written (for example sampled quantity wording). Size M.
- Needs decision from Ravi: No (which header fields are meant to stay editable can be settled while building).
- Confidence: Confirmed (local database)
- Status: New (SCAN-P1-09 covers who is named as issuer; this is about what the certificate says)

### SCAN-P4-09 — An issued certificate can never be corrected, voided or replaced, and a second certificate can be issued for the same QC record
- Severity: Medium
- Kind: Gap (document control)
- Where: `coa_records` (no update or delete policy), COA register, `generateCoaCertificate`
- Finding: Issued certificates are locked (no update or delete policy; tested, remarks unchanged), which is right. But there is no way to say "this one is wrong, replaced by COA-nnnn": no void or superseded status, no revision number, no link between the old and the new. The only remedy for a mistyped result is to issue another certificate, and nothing stops that: a second certificate for the same QC record was accepted (tested), the register then shows two valid certificates for one batch, and the older wrong one stays downloadable. The new-certificate screen does not mark or exclude batches that already have a certificate.
- Evidence: Local database, `claude/scan-evidence-p4.sql` steps B to D: second insert ALLOWED; update and delete leave the rows unchanged (RLS). Code read: no query in `coa/new/page.tsx` or the picker looks at existing `coa_records`.
- Suggested fix: Add `status` (issued or void), `void_reason`, `voided_by/at` and `replaces_id`; let QC Reviewer or System Admin void with a reason and issue a replacement that points to the old one; warn when a batch already has an issued certificate. Size M.
- Needs decision from Ravi: Yes (small). Who may void a certificate (QC Reviewer, System Admin)?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P4-10 — On the certificate PDF, long header values print over the next column and the remarks and signature lines can fall off the bottom of the page
- Severity: Medium
- Kind: Formatting bug
- Where: `lib/coa-pdf.ts` (`downloadCoaPdf`)
- Finding: Header values are written with a single text call and no wrapping. The left column has about 53 mm for a value; at 9 pt a value of more than about 32 characters runs into the right column. Measured in the same PDF library: a product name such as "Ashwagandha Root Extract (10:1) Withanolides 5%" is 73 mm wide, "Boswellia Serrata Gum Resin Extract 65% Boswellic Acids" 84 mm, a sampled-quantity sentence of 47 characters 71 mm; every one overlaps the right column. After the test table the code places Remarks and the two signature lines without checking the page: with the table ending in the last 30 mm of page 1 (about 17 to 19 tests with a normal header), the signature lines land at 290 mm of a 297 mm page and are cut off (the next page is not started).
- Evidence: Measured with the project's own jsPDF: `claude/scan-evidence-p4.sql` (script p44_coa_pdf.mjs): widths of 56 to 84 mm against 53 mm room; at 18 tests the signature line is at 290 mm, page height 297 mm.
- Suggested fix: Wrap each header value with `splitTextToSize` and let the grid row grow; before writing Remarks and signatures, start a new page when less than about 45 mm remains. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (measured)
- Status: New

### SCAN-P4-11 — QC approves a batch before any test result is recorded; results are first typed on the certificate and nothing compares them with the specification
- Severity: Medium
- Kind: Gap (quality control logic)
- Where: QC rounds, COA generation, COA templates
- Finding: A QC record holds a decision, comments, expiry and retest dates, but no results (checked: no result or specification column). The test results exist only on the certificate, which can be generated only after the QC is approved, and is typed by a Quality Checker, QC Reviewer or System Admin (not necessarily the analyst). No step compares a result with its specification (results are plain text), and approval does not depend on results being entered. So a batch can be approved and used, and a certificate issued later that shows a result outside its specification (or, as nothing forces a certificate, never issued). The reviewer who approves cannot see any result.
- Evidence: Code read: `quality_checks` columns; `reviewQcRound2` has no result input; `generateCoaCertificate` takes results as free text, requires non-empty only.
- Suggested fix: Decide the model first. Light version: result entry on the QC record before Round 2 (typed against the template tests, with a "meets / does not meet" mark the reviewer sees), and the certificate takes its results from there. Heavier version: numeric limits per test with automatic comparison. Size L.
- Needs decision from Ravi: Yes. Should results be captured in the app before approval, and compared automatically?
- Confidence: Confirmed (code)
- Status: New (carried from P4.1; also a regulated-plant gap for P9.1)

### SCAN-P4-12 — Specifications on a COA template can be changed by Inventory and MFR Managers, with no review
- Severity: Low
- Kind: Control (enhancement)
- Where: `saveItemCoaTemplate`, `saveMfrCoaTemplate`, `upsert_coa_template()`
- Finding: Whoever may edit the item (System Admin, Inventory Manager, MFR Manager) or the MFR (System Admin, MFR Manager) can replace the test list and specifications. QC roles cannot, unless they also hold one of those. A revision row is written for every change (good) and issued certificates keep their own copy of the lines (good), but a specification is a quality document; a purchasing user can change what the next certificate will certify, and nobody approves it.
- Evidence: Code read: role gates in `coa-templates.ts` and `upsert_coa_template`; revision history table exists.
- Suggested fix: Let a QC Reviewer or System Admin approve a template change before it applies (draft then approved), or at least let QC roles edit templates and show the revision list on the template card. Size M.
- Needs decision from Ravi: Yes. Who owns the specification?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P4-13 — The "Best Before" on a finished product label shows only the month, which rounds the expiry up to the end of the month
- Severity: Medium
- Kind: Bug (shelf-life claim on a product label)
- Where: `label-picker.tsx` (`monthYear`), finished product label template
- Finding: QC records an exact expiry date for a finished product batch, and the system treats the batch as expired the day after. The label prints that date as month and year only ("Mar 2028" for 5 March 2028). By the usual convention a month-only date means the end of that month, so the label claims up to 26 more days of shelf life than the approved date. The "Month of Manufacture" line works the same way, which is fine, but a best-before date should never be later than the approved expiry. (The browser also parses the date as UTC midnight, so on a machine set to a time zone west of UTC the first of a month prints as the month before; not an issue for India time.)
- Evidence: Code read: `{ label: "Best Before", value: monthYear(fp.qcExpiryDate ?? fp.expiryMonth) }`; `monthYear` returns `toLocaleDateString("en-IN", { month: "short", year: "numeric" })`.
- Suggested fix: Print the exact expiry date as a day, or print the month of the last full month before the expiry date when it is not the last day of a month. Size S.
- Needs decision from Ravi: Yes (small). Exact date, or month with the "round down" convention?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P4-14 — The raw material label's "Date of Receipt" is the vendor's invoice date, not the date the goods were received
- Severity: Low
- Kind: Bug (wrong date under a label)
- Where: `labels/page.tsx` (`receiptDate`), Approved RM and Under Test labels
- Finding: The label's "Date of Receipt" is filled from the purchase order's invoice date (only opening-stock batches use their own receipt date). An invoice dated 1 October for goods that arrive on 6 October prints 1 October. The app does record when the order was submitted into stock (`submitted_at`), which is the nearest thing to a receipt date.
- Evidence: Code read: `receiptDate: l.is_legacy ? toIstDateString(l.created_at) : po?.invoice_date ?? null`.
- Suggested fix: Use the order's submitted date (India time) or add a separate "Received on" date on the purchase order. Size S.
- Needs decision from Ravi: Yes (small). Is the submit date the receipt date, or should receipt be typed?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P4-15 — A product or vendor name of about 50 characters or more is cut off with "…" on the label, with no warning
- Severity: Low
- Kind: Formatting
- Where: `generate-label-pdf.ts` (`fitRmValueRun` and the finished product and under-test equivalents)
- Finding: A value that does not fit is first shrunk to 7 pt and then truncated with an ellipsis. Measured with the label's own font on the Approved Raw Material label: "Ashwagandha Root Extract 10:1 Standardised Withanolides 5%" (58 characters) prints as "Ashwagandha Root Extract 10:1 Standardised Witha…", and a 70-character vendor name loses its end. Batch number, quantity and dates fit. Cutting the end of a name removes exactly the part that distinguishes one grade from another (the standardisation). The preview shows the cut, but nothing warns the user.
- Evidence: Own script `claude/scan-evidence-p4.sql` (p45_labels.ts, run with the repo's `tsx`): three cases truncated, short and normal ones unchanged.
- Suggested fix: Allow the name to wrap onto a second line, or show a warning under the preview when any value is cut. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (measured)
- Status: New

### SCAN-P4-16 — The Labels page loads every batch ever received into the browser and offers them in one dropdown
- Severity: Low
- Kind: Performance (scale)
- Where: `inv_qc.sql` run on nine local databases; `labels/page.tsx`, `label-picker.tsx`
- Finding: Every raw material purchase line and every finished product batch (active, any age), with its QC status, is read and sent to the browser; the picker then filters it. With the number of batches growing every month, the page gets slower and the batch dropdown becomes a very long list (the name filter narrows it only after a choice). The search by item name helps but the page cost stays.
- Evidence: Code read: two `fetchAllRows` without any date or status filter, `fetchByIdChunks` for statuses of all lines.
- Suggested fix: Load only eligible batches for the chosen label type (approved, or under test) and search batches on the server by number or name. Size M.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

## Carried to later steps

- QC records hold only a decision, comments, expiry and retest dates and an AR number; no test results, specification or attached report (columns of `quality_checks` checked). The AR number points to a paper or outside report (→ P9.1).
- Finished product QC and packaging against an FP batch (P4.4 / P5.4 may add detail on COA and packaged-FP expiry).
- Labels printed are not recorded anywhere (no print log, no count of labels issued or reconciled against the batch); the PDF is made in the browser (→ P9.1).
- Two people working on the same record at once (→ P10.1).

## P4.1 — QC rounds and decisions

- Assign: only a batch on a submitted order and with no QC record yet; AR number from `get_next_ar_number()`; one QC record per batch (unique index, race handled with a clear message).
- Round 1: Quality Checker (or System Admin) moves submitted to approved-awaiting-review or rejected; the action also re-checks the record is still in `submitted`.
- Round 2: QC Reviewer (or System Admin); the reviewer must differ from the checker, repeated in the trigger (System Admin exempt, SCAN-P1-09); expiry date required and not in the past; retest period required and capped at 180 days for raw material, none on the last allowed retest; the review date starts the retest clock (`trg_qc_compute_retest_date`).
- Consumption gate: a batch cannot be used unless approved, within retest date and not expired; shared advisory lock per batch against a decision made at the same moment.
- Problems: SCAN-P4-01 and 02. Open design points already logged elsewhere: editing after decision (P1-08), names typed by the browser (P1-09).

## P4.2 — Retests, expiry, stability

- Retest start (`start_retest`): needs an approved batch whose retest date has arrived and stock or reserve for the sample; takes the sample from the stability reserve first and only the rest from stock, in the batch's unit, in one transaction with a lock per batch.
- Stability reserve: set aside at receipt (or at production issue) and counted down as retests use it (`stability_reserve_used`); the Retained Samples screen shows what is left. No problem found.
- Limits: retest period at most 180 days and at most 3 retests for raw material (screen only: SCAN-P4-02); the last retest takes only an expiry date; opening stock counts retests already done.
- Production raw material retests use the same function and cards as purchased batches.
- Problems: SCAN-P4-03 (expired batches retested, expiry extended), P4-04 (no finished product retest or expiry control), P4-05 (dashboard alerts).

## P4.3 — AR numbers and QC lists

- Numbering: ARRM-0001/26 for raw material and ARFP-0001/26 for finished product, a sequence per type and year created on first use, India-time year, minimum width of four digits so it never truncates after 9999; two people asking at once cannot get the same number; old numbers keep their form; the AR number is unique (case-sensitive text, see SCAN-P4-02).
- Opening stock refuses old AR numbers that look like generated ones.
- Lists: the cards (Awaiting QC, Awaiting FP QC, Due for retest, production raw material, in progress) are paged and filtered in the database; the main QC list is capped at 1,000 (SCAN-P4-06).
- Problems: SCAN-P4-06, P4-07.

## P4.4 — COA and COA templates

- Templates belong to each raw material and each MFR; one template each; saving replaces the tests in place and writes a revision row (also in the audit log); upload by code available.
- Generation: needs an Approved QC that is the batch's current approval (action and a database trigger, migration 0082); a template must exist; remarks and every result required; COA number from a sequence (COA-0001-2026; the counter runs on across years, the year part follows India time).
- Issued certificates: insert-only table (no update or delete policy), audited; the certificate keeps its own copy of header and result lines, so later template edits do not change old ones.
- PDF: client-side with jsPDF; logo, company block, two-column header grid, test table, remarks, blank signature lines.
- Problems: SCAN-P4-08 to 12. Company details printed live: SCAN-P2-13. Names typed by the browser: SCAN-P1-09.

## P4.5 — Labels

- Four templates: Approved Raw Material (6 on A4), Finished Product and In-process (6 on US Letter), Under Test (10 on US Legal); the whole sheet is the same label repeated, as asked on 19 Sept (B33 asks for single-label printing).
- Eligibility: raw material labels check QC state, retest due, expiry and whether the purchase order is submitted (ACC-14); the finished product label checks only that the batch status is approved.
- Layout: values shrink to 7 pt then truncate with "…"; company details come from Company Details; JPEG output was removed on 19 Sept.
- Problems: SCAN-P4-13 to 16; finished product label for expired batches is added to SCAN-P4-04.

## P4.6 — Data invariants, QC side

The pack `claude/scan-invariants-qc.sql` has ten read-only checks (INV-Q1 to Q10): approved records with no expiry date; more than one open QC record on a batch or an approved record that is not the latest; retest rule breaches (over 3 retests, over 180 days, retest date after expiry); duplicate AR numbers ignoring case and AR numbers outside the series; two-round decisions that break the rules (no checker decision, no reviewer, same person, rejection with no comment); QC record item or sample out of line with its batch; certificates not tied to an approved QC, duplicated, or whose header batch number differs from the batch; approved batches past expiry that still have stock (information); finished product packed after expiry or approved with no expiry; raw material with stock and no QC record for over 14 days (information).

Run on the nine local databases: the pack runs without errors everywhere. It returns nothing on the clean install. On the others it returns only rows made by the regression suites and by this scan's own tests (365-day retest periods, approvals without expiry, AR names such as "AR-T9" and "AR-FAKE", approvals written straight into the table), which is what it should catch on a real database that had the same kind of data. No row points to a new problem in the app beyond those already reported (SCAN-P4-02, 03, 08, 09). Live data may differ; the first live run is the useful one.

## Checked and found sound (P4.1 to P4.6)

- A second QC record on a batch is refused (unique index), and a double click gives a clear message.
- A QC record cannot move backwards or skip a round (trigger and action both check the current status).
- A batch cannot be assigned for QC while its purchase order is a draft or reopened.
- Used material is checked against QC status, retest date and expiry in the database at the moment it is consumed.
- Approved raw material labels cannot be printed for a rejected, under-test, due-for-retest, expired or reopened-order batch; batch number, quantity and dates always fit on the Approved RM label (measured with long product, vendor and invoice texts).
- An issued certificate cannot be altered or deleted (update and delete leave the row unchanged), and template edits do not change old certificates.
- A certificate cannot be issued for a QC record that is not the batch's current approval (retested, rejected, or due for retest), in the action and in the database.
- Year change: a new sequence is made at the first AR of the new year (India time), starting at 0001; no collision between raw material and finished product series.
- A retest cannot start before the retest date, on a draft-order batch, with a unit that does not convert, or with more than the batch holds; reserve and stock are drawn in the right order.
- A different Reviewer from the Checker is required in the database, not only on the screen.

## Areas read (P4.1 to P4.6)

`lib/actions/qc.ts` (create, Round 1, Round 2, retest), `qc-checker-form.tsx`, `qc-assign-form.tsx`, `qc/new/page.tsx`, `lib/qc-retests.ts`, `lib/constants/qc-rules.ts`, `qc/page.tsx` card queries, `dashboard-alerts.ts`, `lib/actions/packaging.ts` (`resolveFpBatch`), migrations 0050/0068 (consumption and packaging triggers), 0054 (two-round trigger), 0080 (`start_retest`), 0098 (consumption gate and advisory locks), 0099 (AR numbers); `labels/page.tsx`, `label-picker.tsx`, `label-eligibility.ts`, `generate-label-pdf.ts` (fit/truncate logic, field arrays), the three sheet previews skimmed; `lib/actions/coa.ts`, `coa-templates.ts`, `generate-coa-form.tsx`, `lib/coa-pdf.ts`, `coa_records` table, policies and triggers, migrations 0059/0060/0082/0096; `qc/page.tsx`, `qc-table.tsx`, migration 0099; own local-database tests `p41_qc.sql`, `p42_expired_retest.sql`, `p43_ar.sql`, `p44_coa.sql`, `p44_coa_pdf.mjs` (PDF measurements with the project's jsPDF), `p45_labels.ts` (label text fit, run with the repo's tsx).
