# Live walk: read-only look at the live app for screen mistakes (started 12 Oct 2026)

Why: the full-app scan (10 to 11 Oct) read code and used scratch databases; it never looked at the live screens, so it missed display mistakes such as the Legacy tag shown on app-made rows (fixed, `9ca548a`). This walk opens every screen on https://invento-atharva.vercel.app in a browser, read-only (no clicks that save, no forms submitted), and records anything wrong.

How it resumes: Ravi says "resume live walk". Read this file, continue at the first slice marked Not started. Findings are saved after every slice.

What each screen is checked for (by script on the page text): words that should never show (undefined, null, NaN, Invalid Date, [object, Infinity), raw ids (uuid), red could-not-be-loaded banners, "Something went wrong", tags that should not be there (Legacy while Opening Stock has no loads), empty columns, wrong or mixed date formats (dd-mm-yyyy expected), quantities without a unit, a number that looks wrong (0 where a value is expected), headings that do not match the data.

## Slices

| # | Screens | Status |
|---|---|---|
| 1 | Dashboard, Quality Control list and its cards | Done 12 Oct 2026: 1 finding |
| 2 | Purchase list, an order page, Items, Vendors, Item Types | Done 12 Oct 2026: no new findings |
| 3 | Inventory tabs: Ledger, Stock Position, RM Report, Rejected, Ageing, Retained Samples, Stock Statement, Batch Trace | Done 12 Oct 2026: 3 findings (Batch Trace is a search box, not read with data) |
| 4 | Finished Product, Packaging, Labels, COA list and templates, MFR | Done 12 Oct 2026: 1 finding |
| 5 | Reports tabs, Audit Log, Documents, Equipment, Dead Stock, Environmental Control, Line Clearance, Feedback | Done 12 Oct 2026 |
| 6 | Admin: Opening Stock, Company Details, User Roles, Stock Integrity Check, User Guide; sign-in page | Done 12 Oct 2026: 2 findings |

## Findings (newest slice last; ID, screen, what is wrong, how sure)

Slice 1 (Dashboard, Quality Control): the Legacy tag fix is live (0 tags on both); no stray words, ids or empty columns.
- LW-01 (Low, decision): QC list, ARRM-0009/26 shows Retest date 10-04-2027 after Expiry date 30-10-2026. The retest period (180 days) is counted from approval without a check against the expiry the Reviewer sets, so a retest date can fall after the batch has expired. Ageing already uses the earlier of the two, so stock status is right; the printed date is what looks wrong. Suggested: show the retest date only when it is before the expiry date (otherwise a dash or "before expiry: none"), or refuse a retest period that runs past expiry. Confirmed on screen.

Slice 2 (Purchase list, Items, Vendors, Item Types): no stray words, ids, Legacy tags or empty columns. Seen but already known: vendor contact boxes accept anything (SCAN-P2-05 area, V-0004 has an address in the Mobile box); test item types with product names (D-500, Gc-250).

Slice 3 (Inventory tabs: Ledger, Stock Position, Stock Statement, RM Report, Rejected, Ageing, Retained Samples): no stray words, ids, Legacy tags or empty columns. Stock Statement rows add up (opening + in - out = closing on the three finished product rows checked).
- LW-02 (Low): Expiry & Retest Ageing intro line prints dates as 2026-10-12 and 2027-01-10; every other screen uses dd-mm-yyyy. Confirmed on screen. Fix: format with the app date function.
- LW-03 (Low, to confirm): Rejected Materials, Kulith RM-00009-02/26 (AR-016-03102026) shows a dash in the Rejected on column. A rejected batch should carry the date QC rejected it. Likely an old test record rejected before the date was stored; check the record and, if a new rejection also shows a dash, fix the view.
- LW-04 (Low): RM Report headings PQTY and SQTY are not explained anywhere on the screen (purchased quantity and sample quantity). Fix: full words or a note line.

Slice 4 (Finished Product, Packaging, COA list, COA Template Register, MFR, Labels): no stray words, ids, Legacy tags or empty columns; yields, pack sizes and counts read sensibly.
- LW-05 (Low): COA list, COA-0005-2026 (a finished product certificate) shows a dash in the Item column; raw material rows show code and name. Search and the Excel Item column are blank for finished product too. Confirmed on screen and in code (coa-table.tsx reads only the raw material item). Fix: show the product name from the batch's MFR, as the QC list does.

Slice 5 so far (Reports, Audit Log, Documents, Equipment, Dead Stock):
- LW-06 (Low): Reports, Finished Product batches register shows Target Qty with no unit (30, 12,000), unlike the Finished Product screen (30 ltr). Confirmed on screen.
- LW-07 (Medium, from the 0119 build): Audit Log shows the new QC history table as raw text: Table column reads qc_decision_history and the Record column shows an id (f0ab5841-424c-...) instead of a name; the Table filter has no entry for it either. Confirmed on screen. Fix: friendly table name (QC Decision History), show the AR number as the record, add to the filter list.
- LW-08 (Low): Equipment page intro says the list is seeded from the December 2023 room-wise register while the list says No equipment yet. Confirmed on screen. Fix: remove or reword the sentence.

Slice 5 rest (Feedback, Environmental Control, Line Clearance): both old registers are empty and marked Deprecated (left alone by rule).
- LW-09 (Low): Tester Feedback shows each ticket's page as a raw address with an id (/finished-product/e2d66e87-...). Cosmetic; a link labelled with the page name would read better.

Slice 6 (User Roles, Company Details, Stock Integrity Check, Opening Stock, User Guide):
- LW-10 (Low): User Roles & Access intro carries developer wording ("database-enforced", "Row Level Security policy", "the old baseline's unrestricted version"). Not for end users. Fix: one plain sentence.
- LW-11 (Medium to confirm): Stock Integrity Check shows 1 difference in check S9: "The ledger has a receipt for a line that is not submitted", RM-00004 / RM-00004-02/26, while S5 (the net quantity of a not-submitted line) passes. Most likely a purchase order that was submitted and then reopened: the receipt row is still there but the reopen wrote a reversal, so the stock is right and the check is a false alarm. In the migration (0118, S9) the test counts any receipt row and ignores the reversal. To confirm: open the Inventory Ledger for that batch and see if a reversal row follows the receipt. If so, fix S9 to compare the net.

## Summary after the last slice
11 findings: 1 Medium (LW-07, from my 0119 build), 1 Medium to confirm (LW-11), 9 Low. Nothing wrong with stock or QC decisions was found by looking; the Legacy tag fix is live (0 tags on every list). The walk did not open: Batch Trace results, record detail pages other than one QC record and PO-0033, forms, PDFs and Excel downloads, sign-in and Profile.

## Build (12 Oct 2026, live as b9edc35, no SQL)
Built: LW-02, LW-04 (note under the RM Report title; the headings stay because they match the old paper report), LW-05, LW-06, LW-07 (table name and row names; the record still shows the QC history event, not the AR number), LW-08, LW-09, LW-10. tsc, eslint, next build clean.
No change: LW-03 (the Kulith record was rejected under the old one-round rule, so it has no Round 2 date; new rejections carry one).
Waiting: LW-01 (needs Ravi's choice) and LW-11 (needs a database change: migration 0120 to make check S9 compare the net).
