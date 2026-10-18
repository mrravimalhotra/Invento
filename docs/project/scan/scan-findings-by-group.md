# Scan findings grouped by kind, for discussion one by one

Every one of the 140 scan findings is in exactly one group below (grouped by its main nature; a few could fit two groups). Detail, evidence and the suggested fix for each are in `claude/scan-findings-pN.md` under the same ID. The fix bundles and ranking are in `claude/scan-findings-p11.md`; the bundle letter is shown so the two views can be matched.

| # | Group | Findings | High | Medium | Low |
|---|---|---|---|---|---|
| 1 | Bugs in the app | 19 | 1 | 7 | 11 |
| 2 | Arithmetic, quantities and figures | 11 | 0 | 6 | 5 |
| 3 | Formatting, labels and printouts | 10 | 0 | 2 | 8 |
| 4 | Missing functionality | 23 | 0 | 11 | 12 |
| 5 | User convenience and accessibility | 12 | 0 | 1 | 11 |
| 6 | Unclear requirement: needs your rule first | 20 | 0 | 6 | 14 |
| 7 | Rules only on the screen (data integrity) | 22 | 3 | 6 | 13 |
| 8 | Security and access | 6 | 0 | 4 | 2 |
| 9 | Reliability, speed and silent failures | 10 | 0 | 1 | 9 |
| 10 | Documentation, clean-up and tests | 7 | 0 | 3 | 4 |
| | **All** | **140** | **4** | **47** | **89** |

## 1. Bugs in the app (19)

The app does something wrong or inconsistent in normal use. Discuss: fix now, or leave?

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P3-01 | High | A purchase order reopened after QC approval keeps the approval; quantity, batch number and even the item can then be changed | A | Yes |
| SCAN-P1-01 | Medium | Forgot-password link cannot sign the user in, so the reset cannot be completed | M | No |
| SCAN-P2-06 | Medium | An Excel file with a stray cell far down the sheet can freeze or crash a bulk upload (and the opening-stock upload) | K | No |
| SCAN-P2-07 | Medium | Bulk Purchase upload accepts lines with no Unit Price or GST %, although the one-at-a-time form requires both | E | Yes |
| SCAN-P3-06 | Medium | The reason entered for a wastage is saved but is not shown anywhere, and the screen still tells the user it is not stored | F | No |
| SCAN-P4-03 | Medium | Expired raw material can be retested, and the only way to approve it is to give it a new, later expiry date | A | Yes |
| SCAN-P4-13 | Medium | The "Best Before" on a finished product label shows only the month, which rounds the expiry up to the end of the month | J | Yes |
| SCAN-P7-01 | Medium | The QC Register shows no batch number for raw material made by Production | D | No |
| SCAN-P2-08 | Low | A file over 1 MB gives a server error rather than a message; there is no check for decompressed size | K | No |
| SCAN-P2-13 | Low | Re-downloaded old documents print today's company name, address and licence number | J | Yes |
| SCAN-P3-03 | Low | A purchase order with no lines can be submitted; submit does not check price and GST, and a line saved at the same moment can be missed | E | No |
| SCAN-P4-05 | Low | A batch drops off the dashboard's retest and expiry alerts the day after its date passes | D | No |
| SCAN-P4-14 | Low | The raw material label's "Date of Receipt" is the vendor's invoice date, not the date the goods were received | J | Yes |
| SCAN-P5-11 | Low | The Batch Manufacturing Record leaves out the AR number of raw material that came from Production, and calls the quantity taken from a batch "as per ... | J | No |
| SCAN-P6-05 | Low | "Issued to Production on" and the Production RM Intimation slip show the day the record was saved, not the issue date typed on the packaging issue | J | No |
| SCAN-P7-08 | Low | The "+ N more" lines under the Dashboard retest and expiry cards open the QC page, which does not list those batches | D | No |
| SCAN-P8-11 | Low | Feedback: every save by the administrator re-stamps the "resolved" time, and the widget and admin list say "nothing here" when the read failed | B | No |
| SCAN-P10-01 | Low | A line added at the moment an order is submitted lands on a submitted order but never enters stock | L | No |
| SCAN-P10-02 | Low | Two people deciding the same QC record at once both succeed; the later one silently wins and the record can end up mixed | A | No |

## 2. Arithmetic, quantities and figures (11)

A number, total, unit, date calculation or plausibility check is wrong or missing. Discuss: fix now, or leave?

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P2-10 | Medium | The opening stock template lists item codes only (no names, no units), and a quantity typed in a different unit loads silently wrong | F | Yes |
| SCAN-P3-10 | Medium | The low-stock warning counts expired, awaiting-QC and retest-due material as stock you have | D | Yes |
| SCAN-P3-11 | Medium | The RM Report "As on date" shows today's quantities for any past date, and its grand total value is not reliable | D | Yes |
| SCAN-P5-05 | Medium | A batch yield of any size is accepted, so one extra zero adds stock that does not exist | F | Yes |
| SCAN-P6-06 | Medium | Expiry & Retest Ageing shows the wrong "In stock" quantity for finished product, because it subtracts the number of packs from kilograms | D | Yes |
| SCAN-P7-09 | Medium | The "Inventory movement" chart adds kilograms, litres and counts together, and counts internal moves as stock in and out | D | Yes |
| SCAN-P5-08 | Low | Quantities are stored with up to 15 decimals, so a batch can be left with a speck of material that blocks the next batch | F | No |
| SCAN-P7-11 | Low | "POs (30d)" counts draft orders, and the Purchase value chart plots each line on the day it was typed, not the day the order was submitted | D | Yes |
| SCAN-P8-02 | Low | Dead Stock Register: rejected, balance and value figures are typed by hand and need not agree, and the date rules are on the screen only | E | Yes |
| SCAN-P10-05 | Low | No ceiling on any quantity, price or text: a purchase of 1e30 kg at a price of 1e20 was accepted and pushed into stock | E | Yes |
| SCAN-P10-06 | Low | Money has no rounding rule: screen totals can differ from the sum of the lines shown by a paisa, and screen and Excel/PDF can differ too | F | Yes |

## 3. Formatting, labels and printouts (10)

Layout, wording, cut-off text or garbled characters on screen, PDF or labels. No stock effect.

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P4-10 | Medium | On the certificate PDF, long header values print over the next column and the remarks and signature lines can fall off the bottom of the page | J | No |
| SCAN-P7-13 | Medium | Wide PDF exports are printed in portrait, so item codes, quantities and headings split in the middle of a word | J | No |
| SCAN-P1-05 | Low | Forced password change shows Supabase's raw error text | M | No |
| SCAN-P3-12 | Low | Stock Statement labels opening loads as "Purchased" and hand-backs as "Other in", and does not cover the same items as Stock Position | D | No |
| SCAN-P4-15 | Low | A product or vendor name of about 50 characters or more is cut off with "…" on the label, with no warning | J | No |
| SCAN-P5-13 | Low | Downloaded file names are built from batch numbers that contain a slash | J | No |
| SCAN-P7-07 | Low | The Reports and Dashboard page subtitles are developer wording | O | No |
| SCAN-P7-14 | Low | Any character outside the basic Western set prints wrong in a PDF: ₹, arrows, Hindi, and macron letters in product names | J | Yes |
| SCAN-P7-20 | Low | Lists say "No purchase orders yet" when a search matched nothing, and hide the row count when there is only one page | O | No |
| SCAN-P7-21 | Low | Very small quantities show as "0" and tiny negatives as "-0" | D | No |

## 4. Missing functionality (23)

Something the app does not do at all today (a correction path, a register, a record). Discuss: wanted, and how soon?

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P1-16 | Medium | Sign-ins, failed sign-ins and password changes by the user are not recorded in the app | M | No |
| SCAN-P2-04 | Medium | A vendor can never be made inactive; the only way out of the list is delete, which is blocked once a purchase order exists | Q | No |
| SCAN-P3-02 | Medium | The invoice details of a purchase order (vendor, invoice number, invoice date) can never be corrected in the app | G | No |
| SCAN-P3-07 | Medium | Nothing can be written off except a purchased batch: finished product, packed product and in-house raw material have no write-off, and no stock can ... | F | Yes |
| SCAN-P4-09 | Medium | An issued certificate can never be corrected, voided or replaced, and a second certificate can be issued for the same QC record | H | Yes |
| SCAN-P5-04 | Medium | Once a batch is confirmed there is no way to correct a typing mistake or to close a batch that failed | G | Yes |
| SCAN-P6-01 | Medium | A packaging issue made by mistake can never be corrected, reversed or voided | G | Yes |
| SCAN-P8-01 | Medium | Equipment: the calibration status is typed separately from the dates, the dates are hidden, and nothing marks an instrument as overdue | Q | Yes |
| SCAN-P9-01 | Medium | There is no place for quality events: deviations, out-of-specification results, change control, CAPA, complaints and self-inspection | Q | Yes |
| SCAN-P9-02 | Medium | Supplier approval and the goods-received record are thin: vendors carry contact details only, and a receipt does not capture the supplier's own ... | Q | Yes |
| SCAN-P9-03 | Medium | Batch release rests on QC approval alone: there is no signed batch record to review (weighed quantities, who weighed and checked, equipment used, ... | Q | Yes |
| SCAN-P1-17 | Low | The Audit screen cannot tell a normal screen action from a direct call to the database API | N | No |
| SCAN-P2-11 | Low | The opening stock page does not show who loaded each file, and the uploaded file is not kept | Q | Yes |
| SCAN-P7-05 | Low | The Purchase Register has no price, GST or value, so there is no way to report what was bought or what stock is worth | Q | Yes |
| SCAN-P7-06 | Low | Reports covers four registers only: no packaging or packed stock, no packaging issues, wastage, rejected or expiry registers | Q | Yes |
| SCAN-P8-04 | Low | Line Clearance is a note, not a control: the batch is free text, nothing checks it, and starting a batch does not need a "Clear" check | I | Yes |
| SCAN-P8-06 | Low | SOP / STP Documents: an old revision cannot be retired, the same title and revision can be added twice, and a link can be swapped in place under the ... | I | Yes |
| SCAN-P9-04 | Low | Returns and rework are not recorded: a rejected material has no return-to-vendor or destruction record, and a finished-product batch has no ... | F | Yes |
| SCAN-P9-05 | Low | The Retained Samples tab shows which samples should exist but not where they are, when they may be discarded, or what happened to them | Q | Yes |
| SCAN-P9-06 | Low | Printing and downloading labels, certificates and batch records is not logged, and there is no label issue and reconciliation record | Q | Yes |
| SCAN-P9-07 | Low | Alerts exist only as Dashboard cards; nobody is told by e-mail or phone when a retest, expiry, calibration or QC decision is due | Q | Yes |
| SCAN-P9-08 | Low | No training records: nothing shows that staff have read the SOPs they work to | Q | Yes |
| SCAN-P9-09 | Low | Stability is a sample quantity, not a programme: there is no study, pull schedule or result record | Q | Yes |

## 5. User convenience and accessibility (12)

Works, but harder than it should be, or hard for some users. Discuss: worth the effort?

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P1-15 | Medium | The Audit screen cannot answer "who changed this record?" once the day is busy | N | No |
| SCAN-P1-03 | Low | Sign-in return link drops the page's query string | M | No |
| SCAN-P5-14 | Low | The batch page does not show the samples taken or how much of the bulk is packed or left | D | No |
| SCAN-P7-10 | Low | The Low stock card shows six arbitrary items with no count and no way to see the rest | D | No |
| SCAN-P7-18 | Low | No list can be sorted, although the user guide says every report can be | P | No |
| SCAN-P7-19 | Low | There is no error page and no "not found" page: a failure or a wrong address shows the framework's bare default | K | No |
| SCAN-P7-22 | Low | Every dropdown in the app is unnamed for a screen reader, and clicking its label does not focus it | P | No |
| SCAN-P7-23 | Low | Smaller keyboard and screen-reader gaps: the phone menu does not trap or return focus, the search box has no label, no "current page" mark, no skip ... | P | No |
| SCAN-P7-24 | Low | On a phone, tap targets are 28 to 32 px and wide lists scroll sideways with no sign that there is more | P | Yes |
| SCAN-P8-03 | Low | An equipment or dead stock record that has been made inactive disappears from the screen and cannot be found again | G | No |
| SCAN-P8-09 | Low | Line Clearance and Environmental lists leave out who recorded the entry, cannot be downloaded, and a wrong entry has no correction path | G | Yes |
| SCAN-P8-12 | Low | Audit Log is hard to read: the list says "3 fields changed" without naming them, and the detail page shows column names and long ids instead of words | N | No |

## 6. Unclear requirement: needs your rule first (20)

The right behaviour depends on a rule only you can set. Nothing can be built until you answer. The question is shown for each.

| ID | Sev | Finding | Question for you |
|---|---|---|---|
| SCAN-P1-06 | Medium | Password-reset and invitation e-mails depend on Supabase's built-in mail sender | Custom SMTP, or admin-reset only? |
| SCAN-P4-01 | Medium | A rejection needs no reason, no confirmation and no second person, and can never be undone | Should a Round 1 rejection be confirmed by the Reviewer, and may a System Admin void a rejection? |
| SCAN-P4-04 | Medium | Finished product has no retest and no expiry control: the retest date set at approval does nothing, and packaging only ... | Does finished product bulk get retested, or only carry an expiry date? |
| SCAN-P4-11 | Medium | QC approves a batch before any test result is recorded; results are first typed on the certificate and nothing compares ... | Should results be captured in the app before approval, and compared automatically? |
| SCAN-P5-01 | Medium | The person who creates an MFR can approve it, so a Master Formula Record needs no second person | Same question as the QC two-person rule (SCAN-P1-09): is the System Admin exempt, and are there enough MFR Managers for a second person? |
| SCAN-P6-04 | Medium | Raw material made from Production can be approved by QC with no sample taken and an expiry date unrelated to the ... | Does a Production batch need its own sample and QC, or inherit the source batch's approval and expiry as a ceiling? |
| SCAN-P1-11 | Low | Super Auditor (a read-only role) can load opening stock, including pre-approved batches | Exclude the auditor, and who may load pre-approved rows? |
| SCAN-P2-05 | Low | Editing a vendor's name or address changes how old purchase orders and labels print; contact details have no format ... | Warning note only, or snapshot the vendor details on the submitted purchase order? |
| SCAN-P3-04 | Low | The first-in-first-out guard orders batches by when the line was typed, not when the goods arrived, and does not look ... | Keep first-in-first-out (by arrival), or switch to first-expiry-first-out? |
| SCAN-P3-09 | Low | A write-off needs no second person, whatever the quantity | Is single-person write-off acceptable, or should large ones need approval? |
| SCAN-P3-14 | Low | "Taken on" in Retained Samples is the date the record was typed, not the date the sample was taken or received | which date is the sampling date for each type? |
| SCAN-P4-07 | Low | AR numbers are used up by failed saves and rolled-back actions, and nothing records the gaps | Is a gap-free AR series required, or is an explained gap acceptable? |
| SCAN-P4-12 | Low | Specifications on a COA template can be changed by Inventory and MFR Managers, with no review | Who owns the specification? |
| SCAN-P5-03 | Low | An approved MFR's procedure and yield limits can change later with nothing on the printout to show it | Only the "last revised" line, or full procedure revisions? |
| SCAN-P5-10 | Low | A raw material that was deactivated after the MFR was approved is still offered and still consumed | Warn or block? |
| SCAN-P5-12 | Low | The Batch Manufacturing Record does not name the master formula or carry its procedure, and can only be printed once ... | Print from In progress, and append the procedure page or not? |
| SCAN-P7-03 | Low | Two reports filter by a date they never show, and the Purchase Register's "Received" date is the day the line was ... | Is "received" the PO submission date, or should a separate goods-received date be entered (see opening stock `receipt_date`)? |
| SCAN-P7-04 | Low | Downloads ignore the search box and the "Hide legacy" switch, so the file can have more rows than the table on screen | Should a download match the screen exactly, or always be the full date range? |
| SCAN-P7-12 | Low | Finished product alerts: retest dates on products that have no retest workflow, and expiry alerts for batches with ... | What should a finished product alert mean: bulk or packed stock still in the plant, or shelf life of goods already released? (And remove the retest card entry for finished product?) |
| SCAN-P8-14 | Low | Deprecated Batch Mfg. Record: nothing locks a record after approval, one administrator can do all three sign-offs, and ... | Remove the module now, or keep it read-only until a date? |

## 7. Rules only on the screen (data integrity) (22)

The screen enforces the rule, but a direct call, an upload or a future screen can get around it because the database does not. Discuss: which rules must be tamper-proof?

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P1-07 | High | Anyone with an inventory or production role can release a batch by inserting an already-approved QC record | A | No |
| SCAN-P1-08 | High | A decided QC record can be changed afterwards (status, AR number, quantities, reviewer) | A | No |
| SCAN-P1-09 | High | The person named on a QC decision, COA, line clearance or environmental reading is typed in by the browser, not stamped by the database; the ... | A | Yes |
| SCAN-P2-01 | Medium | An item's category can be switched after it has stock, purchases, QC or recipes; the code prefix and the product pairing do not follow | E | No |
| SCAN-P2-12 | Medium | Any user, including a read-only one, can change their own display name to anything, including another person's name; history shows the new name ... | B | Yes |
| SCAN-P4-02 | Medium | Several QC rules are enforced only on the screen: expiry date on approval, the 180-day retest cap, sample quantity and unit, the retest limit, and ... | A | No |
| SCAN-P4-08 | Medium | A certificate is saved exactly as sent: the batch number, product, test list, specifications and results are not compared with the batch or the ... | H | No |
| SCAN-P5-06 | Medium | Batch rules are on the screen only: an unapproved or inactive MFR, a future finish date and an expiry before the finish date are all accepted by the ... | E | No |
| SCAN-P6-02 | Medium | Packaging issue rules are on the screen only: an unapproved batch, no material, a raw material as packaging, and a wrong unit count are accepted by ... | E | No |
| SCAN-P1-14 | Low | Several server checks are missing or run before the permission check (unbounded line counts, negative thresholds) | C | No |
| SCAN-P2-02 | Low | Some item rules are enforced only on the screen: raw material without an item type, deactivating an item that still has stock | E | Yes |
| SCAN-P2-03 | Low | Duplicate checks are narrower than they look | E | No |
| SCAN-P2-09 | Low | Small rule differences between the forms and the Excel uploads | E | No |
| SCAN-P3-08 | Low | The database accepts a wastage with a blank reason and from QC roles; the screen rules differ from the database rules | E | No |
| SCAN-P5-02 | Low | Recipe rules are only on the screen: packaging, inactive and repeated items are accepted by the database, and MFR names that differ by spacing count ... | E | No |
| SCAN-P5-09 | Low | A batch component can name a different item from the stock it draws, which takes stock from one item and records it against another | E | No |
| SCAN-P8-05 | Low | Environmental readings: an empty reading can be saved, and impossible values (9999 °C, -50 %RH, Infinity) are accepted | E | No |
| SCAN-P8-07 | Low | Document revision, link and date checks are on the screen only; a revision of 1.5 silently becomes 2 | E | No |
| SCAN-P8-08 | Low | Time stamps on Line Clearance, Environmental readings and Documents can be set by the person saving them | B | No |
| SCAN-P8-10 | Low | Feedback tickets: a tester can write the admin's "Response", category, dates and name on their own ticket, and the ticket number and text size are ... | B | No |
| SCAN-P10-03 | Low | No screen checks that a record is unchanged since it was opened: the last save overwrites the other person's edit | L | No |
| SCAN-P10-04 | Low | Item and vendor name checks exist only in the app: the database accepts two items or vendors with the same name, so two saves at once or an upload ... | E | No |

## 8. Security and access (6)

Who can reach or change what; sign-in and platform hygiene.

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P1-02 | Medium | Sessions never time out; no automatic sign-out after inactivity | M | Yes |
| SCAN-P1-10 | Medium | Anyone on the internet with the public key can use up document numbers | C | No |
| SCAN-P1-13 | Medium | Three helper functions run with full database rights and can be called by anyone, signed in or not, including one that changes data | C | No |
| SCAN-P1-18 | Medium | Next.js is pinned to a version with published security advisories; a patched release exists | C | No |
| SCAN-P1-04 | Low | Changing the password does not ask for the current password | M | No |
| SCAN-P1-12 | Low | The anonymous role still holds privileges on every table, and signed-in users can write through one view | C | No |

## 9. Reliability, speed and silent failures (10)

Fine at today's size or when nothing goes wrong; fails quietly or slowly at scale or on error.

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P7-17 | Medium | A failed or cut-short database read leaves a list partly filled or empty with no message, on about 40 screens | K | No |
| SCAN-P3-05 | Low | Stock is kept in two places that nothing compares; a drift would go unnoticed | L | No |
| SCAN-P3-13 | Low | Batch Trace stops quietly at six levels or 1,000 lines, and the search shows only 25 matches per type | K | No |
| SCAN-P4-06 | Low | The QC list shows only the newest 1,000 records and does not say so; search and Excel export cover only those | K | No |
| SCAN-P4-16 | Low | The Labels page loads every batch ever received into the browser and offers them in one dropdown | K | No |
| SCAN-P5-07 | Low | Reserved raw material from a stale draft stays locked until someone opens the batch list or a batch page | K | No |
| SCAN-P6-03 | Low | The New packaging issue page reads every batch, every QC record and every packaging issue ever made | K | No |
| SCAN-P7-15 | Low | A PDF export has no row limit: a long register can freeze the browser tab | J | No |
| SCAN-P7-25 | Low | Scale watch-list: the full stock statement scans the whole ledger and could reach the database time limit at about 10 million rows | K | No |
| SCAN-P10-07 | Low | Seven database functions and two views take "today" or the year from the session time zone, while the AR number names India time explicitly | L | No |

## 10. Documentation, clean-up and tests (7)

Stale guides and notes, dead code, and the missing automatic tests.

| ID | Sev | Finding | Bundle | Decision needed |
|---|---|---|---|---|
| SCAN-P7-26 | Medium | The User Guide PDF that people download in the app is the 22 September edition: it is missing everything added since | O | No |
| SCAN-P7-27 | Medium | Several procedures in the User Guide text no longer match the app | O | No |
| SCAN-P10-08 | Medium | Application code has no automatic tests and nothing runs on a push: the 26 database suites are the only safety net, and they are run by hand | L | Yes |
| SCAN-P7-16 | Low | The old MFR PDF page is still reachable by address, is no longer linked, and can print off the page | O | Yes |
| SCAN-P7-28 | Low | The module notes keep old statements that later changes made untrue, with the correction pages away from the top | O | No |
| SCAN-P8-13 | Low | Setup notes are out of date (README, SUPABASE_SETUP, seed script) and a few leftovers remain; anyone building a second environment by following them ... | O | No |
| SCAN-P10-09 | Low | Three database functions are never run by any suite, including the bulk purchase upload, the MFR recipe edit and the audit-log protection | L | No |
