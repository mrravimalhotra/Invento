# Scan Phase 11: de-duplicate and rank, final report

Steps done: P11.1 (this file), P11.2 (final report, last section).
Scan of the whole app, 10 to 11 Oct 2026. 53 steps in 12 phases (P0 to P11).

## P11.1 De-duplicate and rank

### How the count works

140 distinct findings stand (High 4 · Medium 47 · Low 89). One more was dropped as a duplicate of an item already on the master list (SCAN-P7-02 = C17, on hold). Every finding is in exactly one of 17 bundles below (checked by script: no finding missing, none twice).

Fourteen groups of findings overlap, so one change closes several of them (37 findings, 14 shared changes). That leaves about **117 separate changes** behind the 140 findings. The groups:

- SCAN-P1-08, SCAN-P10-02: one trigger on quality_checks stops a decided record changing (P10-02 is the same cause seen as a race).
- SCAN-P2-03, SCAN-P10-04: one unique rule on item and vendor names, in the database.
- SCAN-P3-06, SCAN-P3-08: wastage reason: require it in the database and show it where it is saved.
- SCAN-P7-03, SCAN-P7-11: one answer to 'which date counts: typed or submitted?' for reports and the dashboard.
- SCAN-P3-10, SCAN-P7-10: one definition of usable stock for the low-stock banner and the Dashboard card.
- SCAN-P4-05, SCAN-P7-08, SCAN-P7-12, SCAN-P9-07: alerts: one redesign of what the retest and expiry alerts mean, where they link, and whether they are e-mailed.
- SCAN-P3-07, SCAN-P9-04: write-off, return to vendor and rework share one 'disposition' record.
- SCAN-P1-15, SCAN-P1-17, SCAN-P8-12: Audit screen: filters, direct-call marker and readable field names.
- SCAN-P7-26, SCAN-P7-27, SCAN-P7-28, SCAN-P8-13: documentation refresh (user guide, module notes, setup notes).
- SCAN-P5-06, SCAN-P6-02, SCAN-P5-02, SCAN-P5-09: production and packaging rules moved into the database in one migration.
- SCAN-P8-06, SCAN-P8-07: documents register: retire a revision, block duplicates and bad values.
- SCAN-P1-09, SCAN-P8-08, SCAN-P8-10, SCAN-P2-12: stamp the name and time from the signed-in user in the database.
- SCAN-P4-08, SCAN-P4-09: certificate: compare with the batch and allow void and replace.
- SCAN-P5-04, SCAN-P6-01: the same 'void with a reason' pattern for a batch and a packaging issue.

### Ranking method

Each bundle is ranked on four things, in this order: (1) can it put wrong stock or a forged QC decision into the records, (2) does it happen in ordinary use rather than only by a deliberate call to the database, (3) how much work it is, (4) whether it waits for a decision from Ravi. Tier 1 means "before real data goes in" (real data expected in one to three months). Tier 2 is "in the first months of use". Tier 3 is "when wanted".

Rank 0 is not a scan finding: **B10 backup and restore** (parked by Ravi on 30 Sept; recommended before real data). It sits above this list.

### Ranked bundles

| Rank | Tier | Bundle | Findings | High / Med / Low | Effort | Decisions needed |
|---|---|---|---|---|---|---|
| 1 | 1 | **A. Trustworthy QC records** | 8 | 4 / 3 / 1 | Medium to large (two migrations, one new suite, small message changes) | 4 |
| 2 | 1 | **C. Close the open doors (security quick wins)** | 5 | 0 / 3 / 2 | Small (one migration for grants, one dependency upgrade) | 0 |
| 3 | 1 | **D. Wrong numbers on reports, the dashboard and alerts** | 16 | 0 / 5 / 11 | Medium (mostly screen and view changes, no data change) | 9 |
| 4 | 1 | **G. Correct a mistake without a database script** | 6 | 0 / 3 / 3 | Medium (void-with-reason pattern, reused three times) | 4 |
| 5 | 1 | **F. Yield, quantity and write-off sanity** | 10 | 0 / 4 / 6 | Medium | 8 |
| 6 | 1 | **B. The database stamps who and when** | 4 | 0 / 1 / 3 | Small (one trigger per table) | 1 |
| 7 | 1 | **E. Rules the screen enforces and the database does not** | 16 | 0 / 4 / 12 | Medium (several small migrations, one suite) | 4 |
| 8 | 1 | **L. Safety net: tests, concurrency, time zone** | 6 | 0 / 1 / 5 | Small to medium | 1 |
| 9 | 2 | **H. Test results, certificates and finished-product control** | 6 | 0 / 5 / 1 | Medium to large (needs decisions) | 5 |
| 10 | 2 | **I. Second-person approval and document control** | 5 | 0 / 1 / 4 | Small to medium (needs decisions) | 5 |
| 11 | 2 | **J. Dates and layout on labels and printouts** | 12 | 0 / 3 / 9 | Small to medium | 5 |
| 12 | 2 | **M. Sign-in and account comfort** | 8 | 0 / 4 / 4 | Small to medium | 3 |
| 13 | 2 | **K. Reads that fail quietly, big lists, speed** | 10 | 0 / 2 / 8 | Medium | 0 |
| 14 | 2 | **N. Audit trail you can read** | 3 | 0 / 1 / 2 | Small | 0 |
| 15 | 3 | **O. Guides, notes and wording up to date** | 7 | 0 / 2 / 5 | Small (documentation) | 1 |
| 16 | 3 | **Q. Records the plant does not yet keep** | 14 | 0 / 5 / 9 | Large (new modules, many decisions) | 13 |
| 17 | 3 | **P. Accessibility, phone and sorting** | 4 | 0 / 0 / 4 | Small to medium | 1 |

#### 1. Bundle A: Trustworthy QC records

Closes all four High findings. A direct call to the database can release a batch, change a decision after the fact, sign as someone else or keep an approval after a purchase order is reopened. Every other control (FIFO, Compose, Labels, COA) trusts the QC status, so this is the one that makes the rest believable.

- SCAN-P1-07 [High] Anyone with an inventory or production role can release a batch by inserting an already-approved QC record
- SCAN-P1-08 [High] A decided QC record can be changed afterwards (status, AR number, quantities, reviewer)
- SCAN-P1-09 [High] The person named on a QC decision, COA, line clearance or environmental reading is typed in by the browser, not stamped by the database; the "different person" rule can b (decision)
- SCAN-P3-01 [High] A purchase order reopened after QC approval keeps the approval; quantity, batch number and even the item can then be changed (decision)
- SCAN-P4-01 [Medium] A rejection needs no reason, no confirmation and no second person, and can never be undone (decision)
- SCAN-P4-02 [Medium] Several QC rules are enforced only on the screen: expiry date on approval, the 180-day retest cap, sample quantity and unit, the retest limit, and the AR number text
- SCAN-P4-03 [Medium] Expired raw material can be retested, and the only way to approve it is to give it a new, later expiry date (decision)
- SCAN-P10-02 [Low] Two people deciding the same QC record at once both succeed; the later one silently wins and the record can end up mixed

#### 2. Bundle C: Close the open doors (security quick wins)

Cheap and independent. The framework version has published advisories, the document-number function can be used up by anyone holding the public key, and three helper functions run with full rights. None of it needs a decision.

- SCAN-P1-10 [Medium] Anyone on the internet with the public key can use up document numbers
- SCAN-P1-13 [Medium] Three helper functions run with full database rights and can be called by anyone, signed in or not, including one that changes data
- SCAN-P1-18 [Medium] Next.js is pinned to a version with published security advisories; a patched release exists
- SCAN-P1-12 [Low] The anonymous role still holds privileges on every table, and signed-in users can write through one view
- SCAN-P1-14 [Low] Several server checks are missing or run before the permission check (unbounded line counts, negative thresholds)

#### 3. Bundle D: Wrong numbers on reports, the dashboard and alerts

These are figures staff read every day and act on: ageing shows kilograms minus packs, the low-stock banner counts expired material as stock, the RM Report prints today's quantities for a past date. A wrong number that looks right is worse than a missing feature.

- SCAN-P3-10 [Medium] The low-stock warning counts expired, awaiting-QC and retest-due material as stock you have (decision)
- SCAN-P3-11 [Medium] The RM Report "As on date" shows today's quantities for any past date, and its grand total value is not reliable (decision)
- SCAN-P6-06 [Medium] Expiry & Retest Ageing shows the wrong "In stock" quantity for finished product, because it subtracts the number of packs from kilograms (decision)
- SCAN-P7-01 [Medium] The QC Register shows no batch number for raw material made by Production
- SCAN-P7-09 [Medium] The "Inventory movement" chart adds kilograms, litres and counts together, and counts internal moves as stock in and out (decision)
- SCAN-P3-12 [Low] Stock Statement labels opening loads as "Purchased" and hand-backs as "Other in", and does not cover the same items as Stock Position
- SCAN-P3-14 [Low] "Taken on" in Retained Samples is the date the record was typed, not the date the sample was taken or received (decision)
- SCAN-P4-05 [Low] A batch drops off the dashboard's retest and expiry alerts the day after its date passes
- SCAN-P5-14 [Low] The batch page does not show the samples taken or how much of the bulk is packed or left
- SCAN-P7-03 [Low] Two reports filter by a date they never show, and the Purchase Register's "Received" date is the day the line was typed, not the day stock arrived (decision)
- SCAN-P7-04 [Low] Downloads ignore the search box and the "Hide legacy" switch, so the file can have more rows than the table on screen (decision)
- SCAN-P7-08 [Low] The "+ N more" lines under the Dashboard retest and expiry cards open the QC page, which does not list those batches
- SCAN-P7-10 [Low] The Low stock card shows six arbitrary items with no count and no way to see the rest
- SCAN-P7-11 [Low] "POs (30d)" counts draft orders, and the Purchase value chart plots each line on the day it was typed, not the day the order was submitted (decision)
- SCAN-P7-12 [Low] Finished product alerts: retest dates on products that have no retest workflow, and expiry alerts for batches with nothing left (decision)
- SCAN-P7-21 [Low] Very small quantities show as "0" and tiny negatives as "-0"

#### 4. Bundle G: Correct a mistake without a database script

With real data a typing mistake in a confirmed batch, a packaging issue or an invoice number will happen in the first month. Today the only fix is a script in the database, which is the situation the audit trail is meant to avoid.

- SCAN-P3-02 [Medium] The invoice details of a purchase order (vendor, invoice number, invoice date) can never be corrected in the app
- SCAN-P5-04 [Medium] Once a batch is confirmed there is no way to correct a typing mistake or to close a batch that failed (decision)
- SCAN-P6-01 [Medium] A packaging issue made by mistake can never be corrected, reversed or voided (decision)
- SCAN-P4-07 [Low] AR numbers are used up by failed saves and rolled-back actions, and nothing records the gaps (decision)
- SCAN-P8-03 [Low] An equipment or dead stock record that has been made inactive disappears from the screen and cannot be found again
- SCAN-P8-09 [Low] Line Clearance and Environmental lists leave out who recorded the entry, cannot be downloaded, and a wrong entry has no correction path (decision)

#### 5. Bundle F: Yield, quantity and write-off sanity

One extra zero on a batch yield adds stock that does not exist; a stock count and a write-off for finished product are missing. These put wrong quantities straight into the ledger.

- SCAN-P2-10 [Medium] The opening stock template lists item codes only (no names, no units), and a quantity typed in a different unit loads silently wrong (decision)
- SCAN-P3-06 [Medium] The reason entered for a wastage is saved but is not shown anywhere, and the screen still tells the user it is not stored
- SCAN-P3-07 [Medium] Nothing can be written off except a purchased batch: finished product, packed product and in-house raw material have no write-off, and no stock can be corrected after a m (decision)
- SCAN-P5-05 [Medium] A batch yield of any size is accepted, so one extra zero adds stock that does not exist (decision)
- SCAN-P3-04 [Low] The first-in-first-out guard orders batches by when the line was typed, not when the goods arrived, and does not look at expiry dates (decision)
- SCAN-P3-09 [Low] A write-off needs no second person, whatever the quantity (decision)
- SCAN-P5-08 [Low] Quantities are stored with up to 15 decimals, so a batch can be left with a speck of material that blocks the next batch
- SCAN-P5-10 [Low] A raw material that was deactivated after the MFR was approved is still offered and still consumed (decision)
- SCAN-P9-04 [Low] Returns and rework are not recorded: a rejected material has no return-to-vendor or destruction record, and a finished-product batch has no reprocessing path (decision)
- SCAN-P10-06 [Low] Money has no rounding rule: screen totals can differ from the sum of the lines shown by a paisa, and screen and Excel/PDF can differ too (decision)

#### 6. Bundle B: The database stamps who and when

Same idea as bundle A for the smaller registers: the name and time on a record come from the database, not from the browser. Small and safe once A is done.

- SCAN-P2-12 [Medium] Any user, including a read-only one, can change their own display name to anything, including another person's name; history shows the new name everywhere (decision)
- SCAN-P8-08 [Low] Time stamps on Line Clearance, Environmental readings and Documents can be set by the person saving them
- SCAN-P8-10 [Low] Feedback tickets: a tester can write the admin's "Response", category, dates and name on their own ticket, and the ticket number and text size are not controlled
- SCAN-P8-11 [Low] Feedback: every save by the administrator re-stamps the "resolved" time, and the widget and admin list say "nothing here" when the read failed

#### 7. Bundle E: Rules the screen enforces and the database does not

Rules that the screens enforce and the database does not. Each is unlikely alone; together they mean the database cannot be trusted by a second screen, an upload or a future change. Best done as one tidy-up migration after A.

- SCAN-P2-01 [Medium] An item's category can be switched after it has stock, purchases, QC or recipes; the code prefix and the product pairing do not follow
- SCAN-P2-07 [Medium] Bulk Purchase upload accepts lines with no Unit Price or GST %, although the one-at-a-time form requires both (decision)
- SCAN-P5-06 [Medium] Batch rules are on the screen only: an unapproved or inactive MFR, a future finish date and an expiry before the finish date are all accepted by the database
- SCAN-P6-02 [Medium] Packaging issue rules are on the screen only: an unapproved batch, no material, a raw material as packaging, and a wrong unit count are accepted by the database
- SCAN-P2-02 [Low] Some item rules are enforced only on the screen: raw material without an item type, deactivating an item that still has stock (decision)
- SCAN-P2-03 [Low] Duplicate checks are narrower than they look
- SCAN-P2-09 [Low] Small rule differences between the forms and the Excel uploads
- SCAN-P3-03 [Low] A purchase order with no lines can be submitted; submit does not check price and GST, and a line saved at the same moment can be missed
- SCAN-P3-08 [Low] The database accepts a wastage with a blank reason and from QC roles; the screen rules differ from the database rules
- SCAN-P5-02 [Low] Recipe rules are only on the screen: packaging, inactive and repeated items are accepted by the database, and MFR names that differ by spacing count as new
- SCAN-P5-09 [Low] A batch component can name a different item from the stock it draws, which takes stock from one item and records it against another
- SCAN-P8-02 [Low] Dead Stock Register: rejected, balance and value figures are typed by hand and need not agree, and the date rules are on the screen only (decision)
- SCAN-P8-05 [Low] Environmental readings: an empty reading can be saved, and impossible values (9999 °C, -50 %RH, Infinity) are accepted
- SCAN-P8-07 [Low] Document revision, link and date checks are on the screen only; a revision of 1.5 silently becomes 2
- SCAN-P10-04 [Low] Item and vendor name checks exist only in the app: the database accepts two items or vendors with the same name, so two saves at once or an upload plus a form can create 
- SCAN-P10-05 [Low] No ceiling on any quantity, price or text: a purchase of 1e30 kg at a price of 1e20 was accepted and pushed into stock (decision)

#### 8. Bundle L: Safety net: tests, concurrency, time zone

The safety net for everything above: run the 26 database suites on every push, add the reproductions from this scan as suites, fix the one race that loses a line. Without it the fixes in this list can break each other unnoticed.

- SCAN-P10-08 [Medium] Application code has no automatic tests and nothing runs on a push: the 26 database suites are the only safety net, and they are run by hand (decision)
- SCAN-P3-05 [Low] Stock is kept in two places that nothing compares; a drift would go unnoticed
- SCAN-P10-01 [Low] A line added at the moment an order is submitted lands on a submitted order but never enters stock
- SCAN-P10-03 [Low] No screen checks that a record is unchanged since it was opened: the last save overwrites the other person's edit
- SCAN-P10-07 [Low] Seven database functions and two views take "today" or the year from the session time zone, while the AR number names India time explicitly
- SCAN-P10-09 [Low] Three database functions are never run by any suite, including the bulk purchase upload, the MFR recipe edit and the audit-log protection

#### 9. Bundle H: Test results, certificates and finished-product control

Test results and certificates: today QC approves before any result is recorded and a certificate cannot be corrected. Needs your decisions on what QC records, so it waits.

- SCAN-P4-04 [Medium] Finished product has no retest and no expiry control: the retest date set at approval does nothing, and packaging only checks "Approved" (decision)
- SCAN-P4-08 [Medium] A certificate is saved exactly as sent: the batch number, product, test list, specifications and results are not compared with the batch or the template
- SCAN-P4-09 [Medium] An issued certificate can never be corrected, voided or replaced, and a second certificate can be issued for the same QC record (decision)
- SCAN-P4-11 [Medium] QC approves a batch before any test result is recorded; results are first typed on the certificate and nothing compares them with the specification (decision)
- SCAN-P6-04 [Medium] Raw material made from Production can be approved by QC with no sample taken and an expiry date unrelated to the finished product it came from (decision)
- SCAN-P4-12 [Low] Specifications on a COA template can be changed by Inventory and MFR Managers, with no review (decision)

#### 10. Bundle I: Second-person approval and document control

Second-person approval for master formulas and document control; includes the call on the deprecated BMR screen.

- SCAN-P5-01 [Medium] The person who creates an MFR can approve it, so a Master Formula Record needs no second person (decision)
- SCAN-P5-03 [Low] An approved MFR's procedure and yield limits can change later with nothing on the printout to show it (decision)
- SCAN-P8-04 [Low] Line Clearance is a note, not a control: the batch is free text, nothing checks it, and starting a batch does not need a "Clear" check (decision)
- SCAN-P8-06 [Low] SOP / STP Documents: an old revision cannot be retired, the same title and revision can be added twice, and a link can be swapped in place under the same revision (decision)
- SCAN-P8-14 [Low] Deprecated Batch Mfg. Record: nothing locks a record after approval, one administrator can do all three sign-offs, and four roles can still write to it directly (decision)

#### 11. Bundle J: Dates and layout on labels and printouts

Wrong or cut-off dates and layout on labels and PDFs (Best Before month, receipt date, wide tables in portrait). Visible to auditors and customers, but not stock-affecting.

- SCAN-P4-10 [Medium] On the certificate PDF, long header values print over the next column and the remarks and signature lines can fall off the bottom of the page
- SCAN-P4-13 [Medium] The "Best Before" on a finished product label shows only the month, which rounds the expiry up to the end of the month (decision)
- SCAN-P7-13 [Medium] Wide PDF exports are printed in portrait, so item codes, quantities and headings split in the middle of a word
- SCAN-P2-13 [Low] Re-downloaded old documents print today's company name, address and licence number (decision)
- SCAN-P4-14 [Low] The raw material label's "Date of Receipt" is the vendor's invoice date, not the date the goods were received (decision)
- SCAN-P4-15 [Low] A product or vendor name of about 50 characters or more is cut off with "…" on the label, with no warning
- SCAN-P5-11 [Low] The Batch Manufacturing Record leaves out the AR number of raw material that came from Production, and calls the quantity taken from a batch "as per MFR"
- SCAN-P5-12 [Low] The Batch Manufacturing Record does not name the master formula or carry its procedure, and can only be printed once the batch is complete (decision)
- SCAN-P5-13 [Low] Downloaded file names are built from batch numbers that contain a slash
- SCAN-P6-05 [Low] "Issued to Production on" and the Production RM Intimation slip show the day the record was saved, not the issue date typed on the packaging issue
- SCAN-P7-14 [Low] Any character outside the basic Western set prints wrong in a PDF: ₹, arrows, Hindi, and macron letters in product names (decision)
- SCAN-P7-15 [Low] A PDF export has no row limit: a long register can freeze the browser tab

#### 12. Bundle M: Sign-in and account comfort

Sign-in and account comfort: password reset path, session time-out, sign-in logging. Matters more once many users share the app.

- SCAN-P1-01 [Medium] Forgot-password link cannot sign the user in, so the reset cannot be completed
- SCAN-P1-02 [Medium] Sessions never time out; no automatic sign-out after inactivity (decision)
- SCAN-P1-06 [Medium] Password-reset and invitation e-mails depend on Supabase's built-in mail sender (decision)
- SCAN-P1-16 [Medium] Sign-ins, failed sign-ins and password changes by the user are not recorded in the app
- SCAN-P1-03 [Low] Sign-in return link drops the page's query string
- SCAN-P1-04 [Low] Changing the password does not ask for the current password
- SCAN-P1-05 [Low] Forced password change shows Supabase's raw error text
- SCAN-P1-11 [Low] Super Auditor (a read-only role) can load opening stock, including pre-approved batches (decision)

#### 13. Bundle K: Reads that fail quietly, big lists, speed

Silent failures and large lists. Safe at today's size; a watch-list for growth.

- SCAN-P2-06 [Medium] An Excel file with a stray cell far down the sheet can freeze or crash a bulk upload (and the opening-stock upload)
- SCAN-P7-17 [Medium] A failed or cut-short database read leaves a list partly filled or empty with no message, on about 40 screens
- SCAN-P2-08 [Low] A file over 1 MB gives a server error rather than a message; there is no check for decompressed size
- SCAN-P3-13 [Low] Batch Trace stops quietly at six levels or 1,000 lines, and the search shows only 25 matches per type
- SCAN-P4-06 [Low] The QC list shows only the newest 1,000 records and does not say so; search and Excel export cover only those
- SCAN-P4-16 [Low] The Labels page loads every batch ever received into the browser and offers them in one dropdown
- SCAN-P5-07 [Low] Reserved raw material from a stale draft stays locked until someone opens the batch list or a batch page
- SCAN-P6-03 [Low] The New packaging issue page reads every batch, every QC record and every packaging issue ever made
- SCAN-P7-19 [Low] There is no error page and no "not found" page: a failure or a wrong address shows the framework's bare default
- SCAN-P7-25 [Low] Scale watch-list: the full stock statement scans the whole ledger and could reach the database time limit at about 10 million rows

#### 14. Bundle N: Audit trail you can read

The Audit screen answers 'who changed this record?' only on a quiet day.

- SCAN-P1-15 [Medium] The Audit screen cannot answer "who changed this record?" once the day is busy
- SCAN-P1-17 [Low] The Audit screen cannot tell a normal screen action from a direct call to the database API
- SCAN-P8-12 [Low] Audit Log is hard to read: the list says "3 fields changed" without naming them, and the detail page shows column names and long ids instead of words

#### 15. Bundle O: Guides, notes and wording up to date

The user guide and notes no longer match the app. No risk to data; matters for training.

- SCAN-P7-26 [Medium] The User Guide PDF that people download in the app is the 22 September edition: it is missing everything added since
- SCAN-P7-27 [Medium] Several procedures in the User Guide text no longer match the app
- SCAN-P7-07 [Low] The Reports and Dashboard page subtitles are developer wording
- SCAN-P7-16 [Low] The old MFR PDF page is still reachable by address, is no longer linked, and can print off the page (decision)
- SCAN-P7-20 [Low] Lists say "No purchase orders yet" when a search matched nothing, and hide the row count when there is only one page
- SCAN-P7-28 [Low] The module notes keep old statements that later changes made untrue, with the correction pages away from the top
- SCAN-P8-13 [Low] Setup notes are out of date (README, SUPABASE_SETUP, seed script) and a few leftovers remain; anyone building a second environment by following them would fail

#### 16. Bundle Q: Records the plant does not yet keep

Records the plant does not keep yet. Ranked inside the bundle in `claude/scan-findings-p9.md` (stock count first).

- SCAN-P2-04 [Medium] A vendor can never be made inactive; the only way out of the list is delete, which is blocked once a purchase order exists
- SCAN-P8-01 [Medium] Equipment: the calibration status is typed separately from the dates, the dates are hidden, and nothing marks an instrument as overdue (decision)
- SCAN-P9-01 [Medium] There is no place for quality events: deviations, out-of-specification results, change control, CAPA, complaints and self-inspection (decision)
- SCAN-P9-02 [Medium] Supplier approval and the goods-received record are thin: vendors carry contact details only, and a receipt does not capture the supplier's own batch, manufacturer, manuf (decision)
- SCAN-P9-03 [Medium] Batch release rests on QC approval alone: there is no signed batch record to review (weighed quantities, who weighed and checked, equipment used, start and end times) and (decision)
- SCAN-P2-05 [Low] Editing a vendor's name or address changes how old purchase orders and labels print; contact details have no format checks (decision)
- SCAN-P2-11 [Low] The opening stock page does not show who loaded each file, and the uploaded file is not kept (decision)
- SCAN-P7-05 [Low] The Purchase Register has no price, GST or value, so there is no way to report what was bought or what stock is worth (decision)
- SCAN-P7-06 [Low] Reports covers four registers only: no packaging or packed stock, no packaging issues, wastage, rejected or expiry registers (decision)
- SCAN-P9-05 [Low] The Retained Samples tab shows which samples should exist but not where they are, when they may be discarded, or what happened to them (decision)
- SCAN-P9-06 [Low] Printing and downloading labels, certificates and batch records is not logged, and there is no label issue and reconciliation record (decision)
- SCAN-P9-07 [Low] Alerts exist only as Dashboard cards; nobody is told by e-mail or phone when a retest, expiry, calibration or QC decision is due (decision)
- SCAN-P9-08 [Low] No training records: nothing shows that staff have read the SOPs they work to (decision)
- SCAN-P9-09 [Low] Stability is a sample quantity, not a programme: there is no study, pull schedule or result record (decision)

#### 17. Bundle P: Accessibility, phone and sorting

Accessibility, phone layout and sorting.

- SCAN-P7-18 [Low] No list can be sorted, although the user guide says every report can be
- SCAN-P7-22 [Low] Every dropdown in the app is unnamed for a screen reader, and clicking its label does not focus it
- SCAN-P7-23 [Low] Smaller keyboard and screen-reader gaps: the phone menu does not trap or return focus, the search box has no label, no "current page" mark, no skip link
- SCAN-P7-24 [Low] On a phone, tap targets are 28 to 32 px and wide lists scroll sideways with no sign that there is more (decision)

### Questions only Ravi can answer (all "Yes" decisions, by bundle rank)

The full wording is in each finding. Short list for planning:

**A. Trustworthy QC records**

- SCAN-P1-09: Should System Admin remain exempt from the "different person" rule? (GMP practice is no: the admin should not approve their own check.)
- SCAN-P3-01: After QC has approved a batch, may the purchase order ever be reopened to correct it? If yes, the approval must be cancelled and QC repeated; if no, refuse.
- SCAN-P4-01: Should a Round 1 rejection be confirmed by the Reviewer, and may a System Admin void a rejection?
- SCAN-P4-03: Confirm that a retest never extends the manufacturer's expiry date, and that expired material is not retested.

**D. Wrong numbers on reports, the dashboard and alerts**

- SCAN-P6-06: Should a finished product batch that is fully packed still appear on Ageing (the packs it made still age in the Store)?
- SCAN-P3-10: Should the threshold mean "usable now" or "everything on the shelf"? (Recommended: usable now.)
- SCAN-P3-11: Is a true "as on" past date needed (for audit or valuation), or only today's figure?
- SCAN-P7-03: Is "received" the PO submission date, or should a separate goods-received date be entered (see opening stock `receipt_date`)?
- SCAN-P7-04: Should a download match the screen exactly, or always be the full date range?
- SCAN-P7-09: What should this chart tell the plant: purchases received per day, material used, or something else?
- SCAN-P7-11: (same question as SCAN-P7-03: is "received" the submission day?).
- SCAN-P7-12: (see finding)
- SCAN-P3-14: : which date is the sampling date for each type?

**G. Correct a mistake without a database script**

- SCAN-P5-04: Who may send a completed batch back, and should a failed batch be closed with zero yield or recorded as a loss of material?
- SCAN-P6-01: Who may void, within how many days, and do returns need a separate action?
- SCAN-P4-07: Is a gap-free AR series required, or is an explained gap acceptable?
- SCAN-P8-09: Is an "entered in error" path wanted, or is a new correcting entry enough?

**F. Yield, quantity and write-off sanity**

- SCAN-P5-05: Warn only, reason required, or hard block; and the ceiling.
- SCAN-P5-10: Warn or block?
- SCAN-P2-10: Should the Unit column be mandatory with conversion (recommended), or only shown on the Reference sheet?
- SCAN-P3-04: Keep first-in-first-out (by arrival), or switch to first-expiry-first-out?
- SCAN-P3-07: Which stock types must be written off (finished product, packed product, in-house raw material), who approves, and whether a physical count sheet is wanted before go-live.
- SCAN-P3-09: Is single-person write-off acceptable, or should large ones need approval?
- SCAN-P9-04: Is reprocessing of finished product done at the plant?
- SCAN-P10-06: Round each line, or the total only, to match the accounts staff's invoice rule?

**B. The database stamps who and when**

- SCAN-P2-12: Should users be able to edit their own display name at all?

**E. Rules the screen enforces and the database does not**

- SCAN-P2-07: Confirm that the 15 Sept rule applies to Excel uploads too, and what to do with existing lines that have no price (leave, or fill by hand).
- SCAN-P2-02: Should an item with stock be allowed to be deactivated at all, or only when stock is zero?
- SCAN-P8-02: Keep balance typed by hand, or fill it in? Should depreciation run with age?
- SCAN-P10-05: Which ceilings, and warn or block?

**L. Safety net: tests, concurrency, time zone**

- SCAN-P10-08: Is the GitHub workflow wanted (it uses GitHub's free minutes), and may the fixes be delivered together with their suites?

**H. Test results, certificates and finished-product control**

- SCAN-P4-04: Does finished product bulk get retested, or only carry an expiry date?
- SCAN-P4-09: Who may void a certificate (QC Reviewer, System Admin)?
- SCAN-P4-11: Should results be captured in the app before approval, and compared automatically?
- SCAN-P4-12: Who owns the specification?
- SCAN-P6-04: Does a Production batch need its own sample and QC, or inherit the source batch's approval and expiry as a ceiling?

**I. Second-person approval and document control**

- SCAN-P5-01: Same question as the QC two-person rule (SCAN-P1-09): is the System Admin exempt, and are there enough MFR Managers for a second person?
- SCAN-P5-03: Only the "last revised" line, or full procedure revisions?
- SCAN-P8-04: The menu calls this screen "Line Clearance- Deprecated" (22 Sept, "unlikely to be used"). Retire it, or make it a real control (warn or block when a batch starts without a Clear check; checklist; second signature)? If it stays unu
- SCAN-P8-06: Is the SOP screen going to be used before the B13 workflow is built?
- SCAN-P8-14: Remove the module now, or keep it read-only until a date?

**J. Dates and layout on labels and printouts**

- SCAN-P4-13: Exact date, or month with the "round down" convention?
- SCAN-P4-14: Is the submit date the receipt date, or should receipt be typed?
- SCAN-P5-12: Print from In progress, and append the procedure page or not?
- SCAN-P2-13: Warning only, or keep a copy of the company block on issued COAs?
- SCAN-P7-14: Will product names ever carry Devanagari or diacritics?

**M. Sign-in and account comfort**

- SCAN-P1-02: What idle period (15 / 30 / 60 minutes), and should it apply to every role?
- SCAN-P1-06: Custom SMTP, or admin-reset only?
- SCAN-P1-11: Exclude the auditor, and who may load pre-approved rows?

**O. Guides, notes and wording up to date**

- SCAN-P7-16: Remove it, or keep it as a quick on-screen view?

**Q. Records the plant does not yet keep**

- SCAN-P9-01: Are these kept on paper by design, or should the app hold them? If on paper, the finding closes as "accepted".
- SCAN-P9-02: Which fields are wanted, and should a non-approved vendor be blocked or only warned?
- SCAN-P9-03: Paper or electronic batch records?
- SCAN-P9-05: Retention period rule?
- SCAN-P9-06: Is a print log wanted?
- SCAN-P9-07: E-mail digest, WhatsApp, or dashboard only?
- SCAN-P9-08: Keep training on paper, or add the acknowledgement button?
- SCAN-P9-09: Is the stability programme run from this app or from QC's own files?
- SCAN-P8-01: Should the status be computed from the dates?
- SCAN-P7-05: Should prices be visible to every role, or only some? (Today the purchase screens already show them.)
- SCAN-P7-06: Which registers does the plant or an auditor actually ask for?
- SCAN-P2-05: Warning note only, or snapshot the vendor details on the submitted purchase order?
- SCAN-P2-11: Keep a copy of every uploaded opening stock file (needs a storage bucket), or only show who/when?

**P. Accessibility, phone and sorting**

- SCAN-P7-24: Is the app meant to be used on phones for entry (e.g. QC on the shop floor), or only viewing? That decides how much to spend.

## P11.2 Final report

### The scan in numbers

| Phase | High | Medium | Low | Total |
|---|---|---|---|---|
| P1 Security, access and audit | 3 | 8 | 7 | 18 |
| P2 Master data | 0 | 6 | 7 | 13 |
| P3 Purchase and inventory ledger | 1 | 5 | 8 | 14 |
| P4 Quality control, COA and labels | 0 | 9 | 7 | 16 |
| P5 Production (MFR and finished product) | 0 | 4 | 10 | 14 |
| P6 Packaging and production-issued raw material | 0 | 4 | 2 | 6 |
| P7 Reports, dashboard, exports and shared screens | 0 | 6 | 21 | 27 |
| P8 Supporting modules | 0 | 1 | 13 | 14 |
| P9 Missing functionality for a regulated plant | 0 | 3 | 6 | 9 |
| P10 Cross-cutting integrity and concurrency | 0 | 1 | 8 | 9 |
| **All** | **4** | **47** | **89** | **140** |

The scan read about 35,600 lines of app code (85 server actions, 69 screens), 108 migrations and the 26 database suites (895 checks, all passing). Most findings were reproduced on local scratch copies of the database, not argued from reading. Nothing in the app, the live database or the repository was changed by the scan; the only live-database work left is read-only queries for you to run (below).

### What held up

The core of the stock arithmetic is sound. Two people drawing the last of a batch at the same moment: the second is refused. Compose, packaging, role changes and the number generators behaved correctly under test. The audit trail never stores password hashes. Ninety-seven of 119 database functions are exercised by the suites, and nineteen of the other twenty-two are one-line functions the database inlines. The findings are mostly about **who can change a record after the fact**, **mistakes that cannot be corrected**, and **numbers on reports that look right but are not**, rather than about the stock engine itself.

### The four High findings

All four are in the QC and purchase workflow and all four are in bundle A: a QC approval can be inserted directly (P1-07), a decided record can be edited later (P1-08), the name on a decision is typed by the browser so the two-person rule can be bypassed (P1-09), and a purchase order reopened after approval keeps the approval while the quantity changes (P3-01). The first three need a deliberate call to the database API by a signed-in user holding a role. The fourth can happen from the normal screens once a System Admin has reopened the order. The data today is test data, so none is urgent now; all four matter before real data, because the audit trail records the user but not that the screen was bypassed.

### What I did not cover

- The live database was never queried. Everything about live data is in `claude/scan-data-checks.sql` (97 read-only blocks, each with a plain-language note) for you to run and paste back.
- No real browsers, phones, printers or screen readers were used. Layout, accessibility and PDF findings come from code reading plus reproductions with the same PDF library the app uses.
- Supabase platform settings (backups, e-mail sender, auth limits, network rules) were read from the repository and migrations only. They need a look in the Supabase and Vercel dashboards.
- Items you decided earlier (SEC-02, SEC-05/08/11/13, ACC-11, C14 to C18 on hold, sales/staff/dispatch out of scope) were not re-raised, except where a new fact changes them (noted in Part 1F).

### Where everything is saved

- Findings: `claude/scan-findings-p1.md` to `p10.md` (P0 baseline in `p0`), this file for the ranking.
- Evidence: `claude/scan-evidence-p1.sql` to `p10.sql` (reproductions: scratch databases only).
- Invariant checks: `claude/scan-invariants-stock.sql`, `-qc.sql`, `-production.sql`, `-packaging.sql`, and all combined with the live checks in `claude/scan-data-checks.sql`.
- Master list: Part 1F of `claude/open-items-master-list.md` has all 140 rows, with notes added to B7, B10, B13, B40 and others.

### Recommended next build (one)

**Bundle A, part 1: make a QC decision unchangeable and unforgeable.** One database migration (number 0109) plus one new test suite, with small message changes on the QC screens and no new screen:

1. A new QC record can only be created in the first state; only the existing internal functions may create any other state (SCAN-P1-07).
2. A decided record (approved or rejected) cannot be edited, except the few fields that legitimately change later (retest started, rejected-stock flag), and the AR number, item, batch and sample quantity are fixed after insert (SCAN-P1-08). The decision save also checks the record is still in the state it was opened in, which closes the race in SCAN-P10-02.
3. The names and times on Round 1, Round 2 and the certificate are stamped from the signed-in user by the database, and the 'different person' test is applied to the stamped value (SCAN-P1-09).
4. The QC rules now only on the screen move into the database: expiry date required to approve, the 180-day retest cap, the AR number from the series only, retest date not after expiry, retests counted inside start_retest() (SCAN-P4-02).

**Why this one:** it removes all three QC High findings plus the Medium that sits on the same trigger, it is a single migration with a single test suite so it can be delivered the usual way (SQL first, then the patch), and everything downstream (Compose, Labels, COA, Ageing) trusts the QC status.

**One question for you before I start:** may System Admin remain exempt from the 'different person' rule? My recommendation is no: nobody, including the administrator, approves a check they made themselves. (If the administrator must be able to complete a record when staff are away, the cleaner way is a second person with both QC roles, or a written override with a reason.)

The other decisions in bundle A (reopening an approved batch's purchase order, rejection reasons and who can undo one, expired-batch retest) are not needed for part 1 and can wait for part 2.
