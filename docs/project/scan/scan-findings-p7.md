---
title: Scan findings — Phase 7 (reports, dashboard, exports and shared screens)
---

# Phase 7 — Reports, dashboard, exports and shared screens

Steps done: P7.1 to P7.7 (Phase 7 complete; findings added to the master list Part 1F). Next: P8.1. (Rewritten whole after every step.)

## Findings

### SCAN-P7-01 — The QC Register shows no batch number for raw material made by Production
- Severity: Medium
- Kind: Bug (report omits data it holds)
- Where: `reports/page.tsx` (QC query), `report-tables.tsx` (QcRegisterReport, Batch column)
- Finding: The register's Batch column shows the purchase batch number, or the short finished product batch number, and "—" otherwise. Quality checks on raw material made by Production (migration 0068, `production_batch_id`) have neither, and the query does not select `production_issue_batches`, so those rows show "—" in the screen, the PDF and the Excel file. The QC detail page does show that batch number, so the data exists. For an inspector, a register line with an AR number and no batch is not traceable.
- Evidence: Code read: the select list is `purchase_line:purchase_lines(batch_number)` and `fp_batch:finished_product_batches(...)` only; `qc/[id]/page.tsx` selects `production_issue_batches(batch_number)`.
- Suggested fix: Add `production_batch:production_issue_batches(batch_number)` to the select and fall back to it in the Batch column. Size S. Also add a "Type" column (Purchased RM, Production RM, Finished product) so the three kinds can be told apart.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-02 — (Duplicate of the master-list item C17, on hold) Every report loads its whole table into the browser on each visit
- Severity: Already listed (C17, "will take decision later", Ravi 29 Sept 2026); not counted again
- Kind: Performance
- Where: `reports/page.tsx` (five paged reads plus a chunked QC lookup)
- Finding: Same item as C17. New evidence only: on the scale test database (92,000 purchase lines, 92,000 QC checks, 1.1 million ledger rows) the Reports page makes about 190 requests of 70 to 100 ms each before it can draw, and it sends all of those rows to the browser; the other three registers are paid for even when only one is wanted. See SCAN-P7-25 for the measured table.
- Suggested fix: As C17. If the decision stays "later", the cheapest step is to read each register only when its section is opened.
- Needs decision from Ravi: Already open (C17).
- Confidence: Measured (local scale test)
- Status: Duplicate of C17

### SCAN-P7-03 — Two reports filter by a date they never show, and the Purchase Register's "Received" date is the day the line was typed, not the day stock arrived
- Severity: Low
- Kind: Bug (misleading filter)
- Where: `report-tables.tsx` (RM Stock "Item added", Purchase Register "Received"), `report-section.tsx` (date filter)
- Finding: The RM Stock report filters on the day the item was created, but has no column showing that date; filtering stock by when an item was added is rarely what anyone wants. The Purchase Register filters on `purchase_lines.created_at`, labelled "Received", and also has no date column. `created_at` is when the line was first saved as a draft; the day the stock actually came in is `pushed_at` (set when the purchase order is submitted). A PO drafted in August and submitted in October is listed as received in August. Separately, once any date is typed, rows with no date (QC checks not yet reviewed, finished product batches not finished) disappear without a note, so a register filtered by date looks complete when pending work is missing.
- Evidence: Code read: `dateOf={(r) => r.created_at}` on both; the Purchase Register selects `created_at` but not `pushed_at`; `dateOf` returning null makes the filter drop the row.
- Suggested fix: Filter the Purchase Register on the submission date and show it as a column (Received on); show the date used for each filter as a column; drop the date filter from RM Stock (or move it to a "Stock as on" date later, which needs the ledger). Say "rows with no date are hidden" beside the filter, or add an "Include pending" tick. Size S.
- Needs decision from Ravi: Yes. Is "received" the PO submission date, or should a separate goods-received date be entered (see opening stock `receipt_date`)?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-04 — Downloads ignore the search box and the "Hide legacy" switch, so the file can have more rows than the table on screen
- Severity: Low
- Kind: Bug (screen and download disagree)
- Where: `report-section.tsx` (`handleExcel`, `handleDownload`, which export `filtered` by date only); `components/ui/data-table.tsx` (search and hide-legacy are inside the table)
- Finding: The report's heading count and both downloads use the date-filtered rows. The search box and Hide legacy data switch sit inside the table and are not passed up. Type "Mannitol" in the search and the table shows 3 rows, but Download Excel and Download PDF contain all of them, and the PDF subtitle (the filters line) says nothing about the search. The Purchase Register's Category filter does flow through (it filters before the section), so the behaviour differs between the filters on one page. Someone printing for an inspector can hand over a file that does not match what they were looking at. Also, the Reports PDF is saved as `rm-stock-report.pdf` with no date while the Excel is `rm-stock-report-2026-10-11.xlsx`, so two printouts on different days overwrite or become "(1)" copies, and the file name does not show which day it is for.
- Evidence: Code read. Not run in a browser.
- Suggested fix: Either lift the search text and hide-legacy state into ReportSection so the downloads use the same rows, or say under the heading "Downloads include all rows in the date range". Add the category and search to the PDF subtitle. Size S.
- Needs decision from Ravi: Yes. Should a download match the screen exactly, or always be the full date range?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-05 — The Purchase Register has no price, GST or value, so there is no way to report what was bought or what stock is worth
- Severity: Low
- Kind: Enhancement
- Where: `report-tables.tsx` (PurchaseRegisterReport columns), `reports/page.tsx` (select list)
- Finding: Purchase lines carry unit price and GST (mandatory since 15 Sept), but the register shows only PO, vendor, item, batch, quantity, unit and remaining. (Expiry is no longer typed on the purchase line; the QC Reviewer sets it at approval, so an expiry column would have to come from the batch's QC status.) There is no purchase value, no GST total, and no stock value report anywhere (remaining quantity times price, by item or total). The accounts side of a purchase review, and "what is the closing stock worth", cannot be answered from the app.
- Evidence: Code read; `purchase_lines` has `unit_price` and `gst_pct` (fresh-install); the purchase line form has no expiry field.
- Suggested fix: Add Unit price, GST % and Line value columns to the register (and the QC-approved Expiry, taken from the batch status) (Excel with numbers), and a separate Stock Value report (remaining times unit price, by item). Size M. Pairs with the "stock value report" idea already noted as not started.
- Needs decision from Ravi: Yes. Should prices be visible to every role, or only some? (Today the purchase screens already show them.)
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-06 — Reports covers four registers only: no packaging or packed stock, no packaging issues, wastage, rejected or expiry registers
- Severity: Low
- Kind: Enhancement
- Where: `reports/page.tsx`, `report-tables.tsx`
- Finding: The RM Stock report lists active raw material items only, so packaging materials have no stock report here (they are only on Inventory screens). There is no register of packaging issues (the Packaging screen has its own PDF), wastage, rejected or dead stock, expiring batches (the Ageing screen has one), or batch consumption. The FP Register lacks the actual yield quantity, MFR version and packed quantity, only a percentage. A plant usually wants one place to print the lot.
- Evidence: Code read.
- Suggested fix: Add the registers one at a time as they are asked for, starting with Packaging Material Stock (same shape as RM Stock) and Wastage; link to Ageing for expiry. Size M each. Do not build until Ravi picks which.
- Needs decision from Ravi: Yes. Which registers does the plant or an auditor actually ask for?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-07 — The Reports and Dashboard page subtitles are developer wording
- Severity: Low
- Kind: Formatting (wording)
- Where: `reports/page.tsx` and `app/(dashboard)/dashboard-view.tsx` (PageHeader descriptions)
- Finding: The Reports subtitle reads "Filterable registers with a printable PDF export — replaces the old baseline's permanent 'Coming soon' placeholder." The Dashboard subtitle reads "Live from the same tables every other module writes to — no separate reporting layer." Both are change notes for the builder, not help for the person using the page, and the Reports one leaves out Excel.
- Evidence: Code read.
- Suggested fix: Reports: "Registers for stock, quality checks, finished product batches and purchases. Filter by date, then download Excel or PDF." Dashboard: "What needs attention today, and the last 30 days at a glance." Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-08 — The "+ N more" lines under the Dashboard retest and expiry cards open the QC page, which does not list those batches
- Severity: Low
- Kind: Bug (dead-end link)
- Where: `dashboard-view.tsx` (`AlertLine` links and the "+ N more on the QC page" lines), `dashboard-alerts.ts`
- Finding: Each alert card shows eight rows and then "+ N more on the QC page", and every row links to `/qc`. The QC page lists retests that are already due and has no list of expiries or of retests still ahead, so the batches beyond the eighth, and every expiring batch, cannot be seen from that link. Since 0108 the Expiry and Retest Ageing screen holds the full list (it even says the Dashboard shows only the next 90 days), but nothing on the Dashboard points to it. (That a batch drops off the cards once its date has passed is already SCAN-P4-05; not repeated. A fix for it can use the Ageing screen: put what has passed first, in red, and link the cards to it.)
- Evidence: Code read: `href="/qc"` on every alert line; `ageing/page.tsx` header comment.
- Suggested fix: Point the cards' rows and the "more" lines at `/inventory/ageing` (filtered to the same bucket); on the QC link keep only the "Due for retest" count. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-09 — The "Inventory movement" chart adds kilograms, litres and counts together, and counts internal moves as stock in and out
- Severity: Medium
- Kind: Bug (misleading figure)
- Where: `charts.tsx` (`push` and `pull` series), `app/(dashboard)/page.tsx` (ledger query)
- Finding: The chart sums `inventory_ledger.quantity` for every item and every unit, per day. A day with 100 kg of herb received and 130 bottles received plots as 230. "Stock In" is every push (purchases, but also finished product yield, Production raw material yield and packed-goods yield) and "Stock Out" is every other event (the 'pull' and 'wastage' events: QC and stability samples, production consumption, packaging, and the issue of packed goods). Packing is the clearest case: the packed item is pushed and issued in the same step (Task F), so one packing run of 1,060 packs adds 1,060 to both lines. On the local test data the ledger holds 1,060 nos of pack yield and 1,060 nos of pack issue next to 100 kg of purchases; plotted by the dashboard's rule that is a spike in both lines. The chart cannot be read as stock coming in or going out of the plant.
- Evidence: Local database, `claude/scan-evidence-p7.sql` block 4 (the ledger grouped by unit, event and reason, which is what the chart adds up).
- Suggested fix: Pick one meaning and one unit: for example "Received (purchases)" and "Issued to production and packing" in kilograms only (convert g and kg), leaving counts and litres out, or one chart per unit. Exclude pack yield and pack issue pairs. Or replace the chart with the number of receipts and issues per day. Size S to M.
- Needs decision from Ravi: Yes. What should this chart tell the plant: purchases received per day, material used, or something else?
- Confidence: Confirmed (code and local data)
- Status: New

### SCAN-P7-10 — The Low stock card shows six arbitrary items with no count and no way to see the rest
- Severity: Low
- Kind: Bug (completeness)
- Where: `app/(dashboard)/page.tsx` (items ordered by id), `dashboard-view.tsx` (`lowStock.slice(0, 6)`)
- Finding: Items with a threshold are read in id order (a random UUID), and the card shows the first six that are below it, with no total, no "+ N more" link and no ordering by how short they are. If 20 items are low, the six shown are whichever ids sort first, and the card gives no hint there are more. Each line links to the general Items list, not the item. The threshold and on-hand quantity are shown without a unit ("12 on hand, threshold 50"), and the threshold is printed raw while on-hand is formatted. The card also takes on-hand from the item-level balance with the P3-10 definition.
- Evidence: Code read.
- Suggested fix: Sort by shortfall (threshold minus on hand, largest first), show "N items below threshold", show the unit, link each line to the item and add "+ N more" linking to the RM Stock report or the Items list filtered to low stock. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-11 — "POs (30d)" counts draft orders, and the Purchase value chart plots each line on the day it was typed, not the day the order was submitted
- Severity: Low
- Kind: Bug (date basis)
- Where: `app/(dashboard)/page.tsx` (purchase_orders count and purchase_lines query use `created_at`); `charts.tsx`
- Finding: The POs card counts every active purchase order created in the last 30 days, including drafts that have not moved any stock. The Purchase value chart correctly keeps only submitted lines, but places each on the day the line was first saved (`created_at`); an order drafted on 2 Oct and submitted on 9 Oct puts its whole value on 2 Oct. Same root as SCAN-P7-03.
- Evidence: Code read.
- Suggested fix: Count submitted orders only, or label the card "Orders created"; plot purchase value on the submission day (`pushed_at`). Size S.
- Needs decision from Ravi: Yes (same question as SCAN-P7-03: is "received" the submission day?).
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-12 — Finished product alerts: retest dates on products that have no retest workflow, and expiry alerts for batches with nothing left
- Severity: Low
- Kind: Gap (alert relevance)
- Where: `dashboard-alerts.ts` (`getFpRetests`, `getFpExpiries`), migration 0082 comment ("finished products have no retest workflow")
- Finding: Raw material alerts are limited to batches that still have stock. Finished product alerts have no such test: every approved batch with a retest or expiry date in the window is listed, whether the bulk was fully packed, packed goods have been issued, or nothing is left. The retest card also lists finished products although the app has no way to retest one, so those lines link to the QC page and lead nowhere. How many such alerts there are depends on whether the plant wants the shelf life of packed goods on the Dashboard (it can matter for goods in the market, which the app does not track).
- Evidence: Code read.
- Suggested fix: Decide what the FP alert means. If it is about bulk or packed stock in the plant, filter on bulk left (the same quantity as Ageing after SCAN-P6-06); if it is about shelf life of released goods, label it so. Remove FP retest from the card unless a retest workflow is added. Size S.
- Needs decision from Ravi: Yes.
- Confidence: Probable (code; live data would show how many such alerts exist)
- Status: New

### SCAN-P7-13 — Wide PDF exports are printed in portrait, so item codes, quantities and headings split in the middle of a word
- Severity: Medium
- Kind: Bug (printout unreadable)
- Where: `lib/pdf.ts` (`downloadPdfTable`: `new jsPDF()` is always portrait A4, 8 pt, no column widths); every list with a PDF export: Stock Statement (15 columns), Batch Trace (15), Samples (14), Rejected Materials (13), Expiry and Retest Ageing (12), QC list (10), COA register (10)
- Finding: The shared table PDF has about 180 mm of width. With 12 to 15 columns each gets 12 to 15 mm, so text wraps letter by letter. Reproduced with the Stock Statement columns: the item code "RM-00031" prints as "RM-000" over "31", the quantity "1,250.5" as "1,250." over "5" (which reads as two numbers), "Purchased" as "Purchas" over "ed" and the item name over seven lines. The same table in Excel is fine. A regulator or auditor who is given the PDF has a document that cannot be read quickly, and a split quantity can be misread. A typed filter text longer than about 110 characters also runs off the right edge because the subtitle is not wrapped.
- Evidence: Local reproduction with the app's own jsPDF and autoTable (see `claude/scan-evidence-p7.sql`, last block), page image viewed.
- Suggested fix: Choose the page from the column count: landscape (A4, 277 mm) above 7 columns, A3 or smaller type above 12; never break numbers or item codes (`cellWidth: "nowrap"` for number and code columns, wrap only the name columns); wrap the subtitle. Size S to M, one shared change in `lib/pdf.ts`.
- Needs decision from Ravi: No.
- Confidence: Confirmed (local reproduction)
- Status: New

### SCAN-P7-14 — Any character outside the basic Western set prints wrong in a PDF: ₹, arrows, Hindi, and macron letters in product names
- Severity: Low
- Kind: Hardening (latent bug)
- Where: `lib/pdf.ts`, `lib/coa-pdf.ts`, `rm-intimation-pdf.ts`, `fp-intimation-pdf.ts`, `mfr-pdf-button.tsx` (all draw with the built-in Helvetica); the label PDFs embed their own fonts and are less exposed
- Finding: The built-in PDF font covers only the Western European set. A name or heading with any other character prints as other symbols. Tested: "Total value (₹)" prints as "Total value ( ¹)"; "Brahmī Ghṛta" prints as "Brahm+ Gh[ta"; Hindi prints as random letters; "→" and "≥" print as "!'" and an unrelated sign. Today no PDF heading holds a ₹ (the Purchase list exports Excel only), and the item, vendor and MFR names on the test database are all plain Latin, so nothing is wrong yet. For an Ayurvedic plant a product name with a macron or a Hindi alias is likely sooner or later (the item master has a "botanical alias" field), and nothing stops it being typed.
- Evidence: Local reproduction with the same jsPDF 4.x the app installs and `pdftotext`; a read-only query on the live database is in `claude/scan-evidence-p7.sql` (block "SCAN-P7-14") to see whether any name already holds such a character.
- Suggested fix: Embed one Unicode font (for example Noto Sans, regular and bold) once in `lib/pdf.ts` and use it in all table and document PDFs; or refuse characters outside the set when saving names. Do the first; the second blocks real product names. Size M (a font adds about 500 KB, loaded on click like the PDF library).
- Needs decision from Ravi: Yes. Will product names ever carry Devanagari or diacritics?
- Confidence: Confirmed (local reproduction); impact unknown until the live query is run
- Status: New

### SCAN-P7-15 — A PDF export has no row limit: a long register can freeze the browser tab
- Severity: Low
- Kind: Performance (heavy export)
- Where: `report-section.tsx` and `lib/table-export.ts` (every row of the filtered list goes into one jsPDF document in the browser)
- Finding: Excel and PDF are built in the browser from every row, with no cap, no warning and no progress. Measured with the app's own PDF library: 10,000 rows = 278 pages, 4 s, 252 MB; 30,000 rows = 834 pages, 11 s, 507 MB. The Purchase Register can hold about 92,000 legacy lines (C17, SCAN-P7-02); pressing Download PDF on it with no date filter would mean roughly 2,500 pages and 1.5 GB, which a normal office laptop's browser will not finish. Excel handles large sheets better but also builds everything in memory.
- Evidence: Local timing (see `claude/scan-evidence-p7.sql`); the 92,000 figure is from the code comment in `reports/page.tsx`.
- Suggested fix: Ask for a date range before a PDF of more than about 3,000 rows ("This PDF would be 800 pages. Choose a date range or download Excel instead"); keep Excel available. Size S.
- Needs decision from Ravi: No.
- Confidence: Probable (timing measured; the live row count not yet known)
- Status: New

### SCAN-P7-16 — The old MFR PDF page is still reachable by address, is no longer linked, and can print off the page
- Severity: Low
- Kind: Dead code (with layout defects)
- Where: `mfr/[id]/report/` (page and `mfr-pdf-button.tsx`), `lib/actions/mfr.ts` (still revalidates it); `print-mfr-button.tsx` header comment
- Finding: Since 16 Sept "Print MFR" gives the Word file and nothing links to the older preview page, but the page and its PDF still exist at `/mfr/<id>/report`. It shows a differently formatted MFR (the register-style letterhead and its own three signature lines, not the layout Ravi approved from the sample Word document) so anyone who finds it holds a second, unapproved format of the same controlled document. In the PDF code the sign-off block is placed 20 mm under the last table with no check for the page end, so a long recipe or procedure draws the signature lines off the page; the yield line and the intro line are not wrapped to the page width; quantities are printed as stored text; and `jspdf` is imported at the top of the file, against the rule that heavy libraries load on click.
- Evidence: Code read; search shows no link to `/report`.
- Suggested fix: Remove the page and the PDF button, or fix and link it again; do not keep two MFR formats. Size S.
- Needs decision from Ravi: Yes. Remove it, or keep it as a quick on-screen view?
- Confidence: Confirmed (code); layout defects not rendered
- Status: New

### SCAN-P7-17 — A failed or cut-short database read leaves a list partly filled or empty with no message, on about 40 screens
- Severity: Medium
- Kind: Hardening (silent failure)
- Where: `lib/supabase/fetch-all.ts` (returns the rows read so far plus the error); the pages that call it: Reports (10 reads), Dashboard (6, plus 7 in the alerts), QC list (8), Packaging new (10), Labels (6), Item page (7), Items, Purchase, Vendors, Finished Product, MFR, COA, Equipment, Documents and others; about 40 of the pages that read the database never look at an error at all
- Finding: When one page of a paged read fails (a timeout on a big view, a dropped connection, a policy error), `fetchAllRows` stops and returns what it had with the error filled in. Almost every caller uses only `.data ?? []` and drops the error, so the screen draws the first N rows as if they were all of them, or an empty table that says "No purchase orders yet." or "Nothing here yet." On Reports, the Dashboard counts, Low stock and Stock Position this means a figure or a list that is silently short, which is exactly what ACC-07 and ACC-08 set out to stop. A single-row read that fails shows an empty form in the same way. There is also no error screen to catch a thrown error (SCAN-P7-19).
- Evidence: Code read: `fetchAllRows` and `fetchByIdChunks` return `{ data, error }`; per-file count of error handling shown in this step (40 pages with no mention of `error`). A failure cannot be made to happen on the test database, so it has not been run.
- Suggested fix: One shared helper `readOrFail()` that throws on any error (so the page shows the error screen) or, for pages that should still draw, returns a flag that puts a red "Some rows could not be loaded. Reload, or tell the administrator" banner above the table; use it in the paged reads first (Reports, Dashboard, Stock Position, QC, Items, Purchase). Size M.
- Needs decision from Ravi: No.
- Confidence: Probable (code; failure not reproduced)
- Status: New

### SCAN-P7-18 — No list can be sorted, although the user guide says every report can be
- Severity: Low
- Kind: Gap (documented feature missing)
- Where: `components/ui/data-table.tsx` (`sortValue` is declared on a column and never used); 24 columns across the app define `sortValue`; `docs/user-guide/USER_GUIDE.md` line 711 and 717 ("searchable, sortable table", "built-in search and column sorting")
- Finding: Column headings are plain text. Every list keeps the order the server gave it (mostly newest first), and the only tools are the search box, paging and, on a few screens, a date range. Finding "the batch that expires first" or "the largest stock" in the Stock Statement, Ageing, Items or Purchase list means exporting to Excel. The code was started (24 columns carry a sort value) but the table never reads it, and the user guide describes sorting that does not exist.
- Evidence: Code read: only occurrence of `sortValue` in `data-table.tsx` is its type.
- Suggested fix: Click-to-sort on the heading with an arrow, using `sortValue` where given (and text otherwise); ascending, descending, back to the original order. Sort before paging. Size S to M. Or remove the sentence from the guide.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-19 — There is no error page and no "not found" page: a failure or a wrong address shows the framework's bare default
- Severity: Low
- Kind: Gap (error state)
- Where: `app/` (no `error.tsx`, `global-error.tsx` or `not-found.tsx` anywhere); `notFound()` is called from 15 pages
- Finding: A page that throws shows the framework's white "Application error: a server-side exception has occurred" with a code and no way back; a missing record (a deleted or mistyped batch address, which the pages answer with `notFound()`) shows a plain "404" outside the Invento layout, with no menu, no logo, no link to the list. Staff on the shop floor who hit either one see something that looks like the app has crashed and cannot tell what to do. Loading is covered (a spinner page exists).
- Evidence: Code read: file search finds only `loading.tsx` files.
- Suggested fix: Add `app/(dashboard)/error.tsx` (message, "Try again", "Go to Dashboard", the error code to quote), `app/global-error.tsx`, and `app/not-found.tsx` inside the dashboard layout ("This record was not found. It may have been deleted. Back to <list>"). Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-20 — Lists say "No purchase orders yet" when a search matched nothing, and hide the row count when there is only one page
- Severity: Low
- Kind: Formatting (wording and feedback)
- Where: `components/ui/data-table.tsx` (`emptyLabel`, the footer shown only when `pageCount > 1`), 29 call sites with their own empty text
- Finding: The empty-state text is fixed per list ("No purchase orders yet.", "Nothing here yet."). It appears both when the list really is empty and when the search, the Source filter or "Hide legacy data" has removed every row, so someone who types a wrong word is told the plant has no purchase orders. The "Page 1 of 2 · 20 rows" footer, the only place that tells how many rows match, is hidden when everything fits on one page. The Hide legacy tick and the row count are therefore the only clue that a filter is active; there is no "Clear filters" button.
- Evidence: Code read.
- Suggested fix: When the unfiltered list has rows but the filtered list is empty, say "No rows match. Clear search or filters" with a button; always show "N rows" (and "N of M" when filtered). Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-21 — Very small quantities show as "0" and tiny negatives as "-0"
- Severity: Low
- Kind: Formatting
- Where: `lib/utils.ts` (`formatNumber`, `formatQty`: at most 3 decimals through `toLocaleString`)
- Finding: Quantities are shown to 3 decimals (ACC-28). A stock of 0.0004 kg shows as "0", although it is not zero (and is what blocks the oldest-first rule in SCAN-P5-08), and a leftover of -0.0001 shows as "-0". Both look like a clean zero or an odd sign while the database holds something else, so a person cannot see why the system says a batch still has stock or a pull is refused. Grams entered in kilogram items (0.5 g = 0.0005 kg) show as "0.001".
- Evidence: Local test of the same function (see `claude/scan-evidence-p7.sql`, last line).
- Suggested fix: Show "< 0.001" for a positive amount below the display step, and print negatives as they are; where a balance is within rounding of zero say so on the Stock Position and the Inventory ledger. Pairs with the dust clean-up in SCAN-P5-08. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (local test)
- Status: New

### SCAN-P7-22 — Every dropdown in the app is unnamed for a screen reader, and clicking its label does not focus it
- Severity: Low
- Kind: Gap (accessibility)
- Where: `components/ui/combobox.tsx` (the `id` goes on the hidden native select; the visible text box has no `id`, no `aria-label` and no `aria-activedescendant`), `components/ui/form.tsx` (`Field` label points at `htmlFor`)
- Finding: Every `<Select>` in the app (about 40 screens) is built as a hidden `<select aria-hidden tabIndex=-1>` carrying the `id`, with a visible text box on top. The form label is tied to the hidden select, so the visible box that people use has no accessible name: a screen reader announces "combo box, edit" with no field name, and clicking the label text does nothing (it would normally put the cursor in the field). The highlighted option is not announced either (no `aria-activedescendant`; the list items have no ids). Keyboard use itself works (arrows, Enter, Escape, Tab).
- Evidence: Code read; no browser run.
- Suggested fix: Give the visible input the `id` (and the hidden select a derived one), set `aria-labelledby` to the label, give each option an id and set `aria-activedescendant`. Size S, one file.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-23 — Smaller keyboard and screen-reader gaps: the phone menu does not trap or return focus, the search box has no label, no "current page" mark, no skip link
- Severity: Low
- Kind: Gap (accessibility)
- Where: `components/shell/mobile-nav.tsx`, `nav-list.tsx`, `components/ui/data-table.tsx` (search box, pagination), `charts.tsx`
- Finding: (1) The phone menu is declared a modal dialog and moves focus in, but Tab can leave it into the page behind, and closing it does not return focus to the menu button. (2) The table search box has only a placeholder, no label; Prev and Next buttons carry no hint of which table they belong to when several are on a page. (3) The current menu item is shown by colour only (`aria-current="page"` is not set), the menu `nav` has no name, and there is no "skip to main content" link, so a keyboard user passes the whole menu on each page. (4) Table headings have no `scope`. (5) The finished-batches bar chart uses a grey (#94a3a0) that is 2.6:1 against white, below the 3:1 for graphics, and the charts have no text alternative or table. Text colours were computed and pass (smallest 4.6:1 for amber on its pale background).
- Evidence: Code read; contrast computed from the colours in `globals.css`.
- Suggested fix: Focus trap and return in the phone menu; `aria-label` on the search box and Prev/Next; `aria-current`; a skip link in the layout; `scope="col"`; a darker bar colour and a short text summary under each chart. Size S to M.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P7-24 — On a phone, tap targets are 28 to 32 px and wide lists scroll sideways with no sign that there is more
- Severity: Low
- Kind: Enhancement (phone use)
- Where: `components/ui/button.tsx` (small button about 32 px high), `data-table.tsx` (Prev/Next about 28 px, row action links), `nav-list.tsx` (about 32 px per menu line); wide tables inside `overflow-x-auto`
- Finding: The phone menu, sizes of the buttons and the paging buttons are 28 to 32 px high, under the 44 px usually advised for a thumb and close to the 24 px minimum of the accessibility standard; on a shop floor with gloves or in a hurry, mistaps on Approve, Reject or Next are likely. Lists wider than the screen (Stock Position, Stock Statement and Ageing are the widest) scroll sideways inside their card with no shadow or arrow, no frozen first column (item name) and the page does not tell the person to scroll, so the numbers cannot be matched to the item they belong to once scrolled. The viewport setting is right (width = device, zoom allowed), the two-column forms stay at two columns on a phone (about 160 px per field) and nothing overflows the page.
- Evidence: Code read (Tailwind sizes). Not tried on a phone; a live look needs Ravi's say-so.
- Suggested fix: Minimum 40 px height for buttons and menu lines under 768 px; freeze the first column and show a scroll hint for wide tables; stack the two-column forms on narrow screens. Size M.
- Needs decision from Ravi: Yes. Is the app meant to be used on phones for entry (e.g. QC on the shop floor), or only viewing? That decides how much to spend.
- Confidence: Probable (code only)
- Status: New

### SCAN-P7-25 — Scale watch-list: the full stock statement scans the whole ledger and could reach the database time limit at about 10 million rows
- Severity: Low
- Kind: Performance (future risk)
- Where: `stock_statement()` (0107); `batch_ageing` (0108); `stock_balance` and `item_position` views; `inventory_ledger_with_balance`; the top-bar low-stock banner; Dashboard ledger read
- Finding: Measured on a local test database holding 2,700 items, 92,000 purchase lines and QC checks and 1.09 million ledger rows, as a signed-in user with the row rules on (times from one run on a small machine; hosted times will differ): Stock Statement 0.8 to 1.0 s for any period (the opening balance needs the whole ledger, so a 30-day statement costs the same as a 3-year one); Stock Position view 0.3 s; stock balances 0.13 to 0.18 s; Expiry and Retest Ageing 1.4 s for all 75,000 rows, or 0.3 to 0.4 s per 1,000-row page (75 pages); QC batch status view 0.3 to 0.4 s per page (92 pages); Inventory Ledger page without a filter 0.4 s; one item 10 to 15 ms; batch trace 21 ms. All grow in proportion to the ledger. At the 5 million ledger rows named in the plan the Stock Statement would take about 5 s and, if growth is linear, about 9 s at 10 million, which is past the 8-second limit a standard hosted database puts on signed-in requests (to be confirmed in the project's settings), so the page would fail with a timeout at that size. Two smaller points: the Dashboard reads every ledger row of the last 30 days to draw one chart (47,000 rows, 47 requests on the test data; the real number depends on daily activity); and the top bar runs two reads (items with a threshold, then their balances) on every page view.
- Evidence: Local scale test: generator and timings in `claude/scan-evidence-p7.sql` (end of file); local database only.
- Suggested fix: Nothing now. Keep an eye on the ledger row count (`select count(*) from inventory_ledger`, in the live checks) and act before it passes about 3 million: a daily or monthly closing-balance table so the statement reads only the period, and a day-by-day summary for the Dashboard chart (together with SCAN-P7-09). Size M when needed.
- Needs decision from Ravi: No (review when the ledger passes 3 million rows; the current count is not known to me).
- Confidence: Measured (local); the growth rate of the live ledger is unknown
- Status: New

### SCAN-P7-26 — The User Guide PDF that people download in the app is the 22 September edition: it is missing everything added since
- Severity: Medium
- Kind: Gap (stale document)
- Where: `public/user-guide.pdf` (37 pages, created 22 Sept 2026, one commit), `app/(dashboard)/user-guide/page.tsx`, the closing section of `docs/user-guide/USER_GUIDE.md`
- Finding: The in-app User Guide page serves a fixed PDF made from the Markdown on 22 Sept. The Markdown has been edited 16 times since (last on 10 Oct) but the PDF was never made again. The downloaded guide has no mention of Batch Trace, Stock Statement, Expiry and Retest Ageing, Retained Samples, Rejected Materials, Opening Stock or the Legacy tag (text search of the PDF finds none of them; the Markdown has each), and none of the corrections listed in SCAN-P7-27 were ever in it. The page says "always download the latest copy from this page" and the guide's last section says a new PDF is published to the same link whenever the app changes, which is not true: regenerating is a manual step (`docs/modules/user-guide.md`) that has not been run.
- Evidence: `pdftotext` of the PDF against `grep` of the Markdown (same eight headings: 0 against 3 each); `git log` of both files.
- Suggested fix: Make the PDF in the build (or show the guide as a page rendered from the Markdown, so there is nothing to regenerate); until then regenerate it once now, after SCAN-P7-27 is corrected, and add "regenerate the PDF" to the patch checklist for any change that touches the guide. Size S (regenerate) or M (render in the app).
- Needs decision from Ravi: No.
- Confidence: Confirmed
- Status: New

### SCAN-P7-27 — Several procedures in the User Guide text no longer match the app
- Severity: Medium
- Kind: Gap (documentation wrong)
- Where: `docs/user-guide/USER_GUIDE.md`: Dashboard, Purchase, Quality Control, Finished Product, Packaging and Reports sections
- Finding: Checked each against the code; the statements below are wrong or incomplete today.
  1. Dashboard: it says two warning cards (Low stock and "Retest due soon", retest in the next 30 days). The app shows up to four: Low stock, Finished product batches in progress, Retest due in the next 90 days, and Expiring in the next 90 days.
  2. Purchase, step 4: "Enter unit price, GST %, and expiry date". The purchase line form has no expiry field; the expiry date is set by the QC Reviewer at approval (FB-0058).
  3. Quality Control: "sample quantity, unit and expiry date are pre-filled from the purchase line" (expiry is not); round 2 asks for a retest period and also the Expiry date; a raw material can be retested at most three times, each period at most 180 days, and the third retest takes only the expiry date (0098). None of these rules is in the guide.
  4. Finished Product: it says the person can "confirm or adjust" the suggested raw material batches and substitute others. The app chooses oldest-first automatically with no per-batch choice (Ravi, 14 Sept). The guide also does not describe the Draft stage, Create Batch, that a draft cancels itself after 30 minutes and returns its stock, or Complete Batch (yield and the QC, stability and R&D samples) before the QC of the finished batch.
  5. Packaging: the numbered steps and field list describe an "issue type, item and batch, quantity" form. The real form asks for an approved finished product batch, the pack size, the number of packs, the packaging materials and the date, and gives each line a PKG code. The later paragraphs (several pack sizes, Production) are right.
  6. Reports: it promises "column sorting" (none exists, SCAN-P7-18), a PDF that is "exactly the rows currently shown" including the search (it is not, SCAN-P7-04), and "Download PDF" only (there is also Excel).
  7. Inventory: it describes the RM Report As On Date as a true snapshot for a past date; the app shows today's quantities (SCAN-P3-11).
- Evidence: Code read against each statement (purchase-line-form has no expiry, `qc-reviewer-form.tsx`, `qc-retests.ts`, dashboard-view and alerts, compose rules, packaging form, reports).
- Suggested fix: Correct the six sections and the matching module docs in one editing pass, then regenerate the PDF (SCAN-P7-26). Size M. Items 6 and 7 may instead be fixed by the app (sorting, snapshot) first.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code against guide text)
- Status: New

### SCAN-P7-28 — The module notes keep old statements that later changes made untrue, with the correction pages away from the top
- Severity: Low
- Kind: Gap (documentation structure)
- Where: `docs/modules/packaging.md` (lines 19 to 62 describe pack, repack and unpack as first-class; the removal is recorded near line 506), `docs/modules/reports.md` (says there is no Excel export yet and describes a sortable table), other module files written as a dated log
- Finding: Each module note is an ever-growing log: new dated sections are added at the bottom while the opening description still describes the first version. A new developer, or Claude in a new session, reading from the top gets the old design (for example "unpack and repack exist"; "no Excel export") and has to find the later correction. The CLAUDE.md quick map asks sessions not to read large files in full, which makes this more likely to mislead.
- Evidence: Code read and `grep` of the two files.
- Suggested fix: Put a short "Current behaviour" block at the top of each module note (6 to 10 lines, kept up to date, with "see below for history"), and mark superseded sections "Superseded by ...". Size M across 20 files; do the five busiest first (QC, Finished Product, Packaging, Inventory, Purchase).
- Needs decision from Ravi: No.
- Confidence: Confirmed (two files compared in detail)
- Status: New

## Carried to later steps

- RM Stock "On Hand" and the low-stock flag use the item-level balance with the P3-10 definition; no change here.

## P7.1 — Reports screen

- Four registers on one page: RM Stock, QC, FP and Purchase, each with a date filter (except none for stock), Excel and PDF download, and a Legacy switch where relevant.
- Sources: items, stock balance, quality checks, finished product batches, submitted purchase lines; all paged past the 1,000-row cap with a unique tiebreaker.
- Problems: SCAN-P7-01 to 07.

## Checked and found sound (P7.1)

- Date filtering compares India calendar days, not UTC, and refuses a From date after the To date; future dates are blocked.
- Paging is complete and stable (unique `id` tiebreaker on every query), so no row is skipped or repeated.
- The Purchase Register includes only active lines of submitted orders, and shows live remaining quantity, not the static column.
- The FP Register resolves the real status (approved or rejected) from the latest QC row, and the QC IDs are looked up in chunks.
- Excel exports numbers and dates as numbers and dates, not text; the on-screen "Analytical Report No." keeps "AR Number" in downloads.
- Heavy PDF and Excel libraries load only on click.

## Areas read (P7.1)

`reports/page.tsx`, `report-tables.tsx`, `report-section.tsx`, `reports/layout.tsx`, `components/ui/data-table.tsx` (search and legacy parts), `lib/utils.ts` date helpers, `purchase_lines` definition, `qc/[id]/page.tsx` select list.

## P7.2 — Dashboard

- Six count cards, up to four alert cards (Low stock, Finished product batches in progress, Retest due, Expiring), and four charts (stock movement, QC by status, purchase value, finished batches per day).
- Each count is fetched twice (all and not-legacy) so the Hide legacy switch works in the browser; alerts and charts carry a legacy flag.
- Alerts read the same views the QC and Ageing screens use. Problems: SCAN-P7-08 to 12 (and the subtitle in 07).

## Checked and found sound (P7.2)

- The 30-day charts use the same 30 India-time days, oldest first, with 0 on quiet days; days are IST throughout (ACC-26).
- Purchase value includes GST and uses only submitted, active lines of active orders.
- QC counts come from one database function with an all and non-legacy pair; the pie shows the four statuses with distinct colours.
- Low-stock balances are looked up in chunks for the items that have a threshold, so an item beyond the first 1,000 balance rows is not wrongly shown as zero.
- Retest and expiry for purchased raw material come from the latest QC of each batch and stop at stock left; the finished product retest uses the current-approval view.
- The in-progress card is capped at 50 rows with a true total and a "+ more" link.

## Areas read (P7.2)

`app/(dashboard)/page.tsx`, `dashboard-view.tsx`, `dashboard-alerts.ts`, `charts.tsx`, `lib/dashboard-series.ts`, `lib/fp-in-progress.ts`, migration 0082 (`current_qc_approvals`), `inventory/(tabs)/ageing/page.tsx` (header and bucket names), `qc/page.tsx` (retest queries); own query on `scanp6` (ledger grouped by unit and event).

## P7.3 — Exports and documents

- Shared table export (`table-export.ts`) feeds Excel (`excel-export.ts`, ExcelJS) and PDF (`pdf.ts`, jsPDF with autoTable) for 20 lists; each export has a company letterhead with logo, a filter line, and a "Generated by / on" footer with page numbers; the Excel has a data sheet and an "About this export" sheet.
- Other documents: MFR Word (`mfr-docx.ts`), MFR PDF (orphan), BMR Word, RM and FP intimation slips, COA, labels; the last four were read in P4 to P6.
- Problems: SCAN-P7-13 to 16 (and the PDF file name in 04).

## Checked and found sound (P7.3)

- Excel cells are real numbers and real dates (dd-mm-yyyy, India wall clock), with thousands separators, right-aligned numbers, a frozen header row, filter buttons and widths that fit.
- Text that starts with "=", "+", "-" or "@" is stored as text, never as a formula (tested with ExcelJS: no formula cell written), so a typed name cannot run a formula when the sheet is opened.
- Sheet names are cleaned of the characters Excel refuses and cut to 31 characters.
- Every PDF carries the letterhead, the filter line, the row count, "Generated <time> by <name>" and "Page X of Y"; company name, address and licence come from the saved company details.
- The heavy libraries (jsPDF, ExcelJS, docx) load on click, except in the old MFR PDF page (SCAN-P7-16).
- Excel and PDF export the same columns (an Excel-only "Source" column for opening stock is added to both in Reports).

## Areas read (P7.3)

`lib/table-export.ts`, `lib/pdf.ts`, `lib/excel-export.ts`, `lib/pdf-company-heading.ts`, `lib/pdf-user.ts`, `mfr/[id]/report/mfr-pdf-button.tsx`, `mfr/[id]/mfr-docx.ts` (header and data parts), `print-mfr-button.tsx`, the export settings of the 20 lists (column count and formats); own tests on the developer machine with jsPDF, jsPDF-autoTable and ExcelJS (`t2` to `t6`).

## P7.4 — Shared components and formatting

- Shared pieces read: `DataTable` (search, paging, Source and Hide legacy filters, Excel/PDF buttons), `Select` (the searchable dropdown over a hidden native select), `Field`, `Input`, `Checkbox`, `DecisionChoice` radios, `FlashHost` and `useFlashActionState`, `Badge`, `PageLoading`, the Hide legacy preference hook, and the date and number helpers in `lib/utils.ts`.
- Problems: SCAN-P7-17 to 21.

## Checked and found sound (P7.4)

- Dates are worked out in India time on the server and in the browser, shown as dd-mm-yyyy; date-only values are never shifted by the time zone.
- A failed save keeps what the person typed (FB-0045) and shows the result at the top of the screen whatever the scroll position; errors stay until closed, success fades after 8 s; every action has a visible result.
- The dropdown keeps a real hidden select, so required fields, form submission and change handlers work; the list opens outside scrolled tables and follows them; arrow, Enter, Escape and Tab keys work; a value not in the list does not silently submit the first option.
- The Hide legacy choice is one shared setting across the table filters, dropdowns and Dashboard, and a hidden legacy selection is still shown in the closed box.
- The page is clamped to a valid page when a filter shrinks the list (ACC-25); the radio choice for QC decisions is a real radio group.
- A loading spinner appears on every route change after a short delay (no flash on a fast load), and the menu stays usable.

## Areas read (P7.4)

`components/ui/data-table.tsx`, `combobox.tsx`, `form.tsx`, `badge.tsx`, `decision-choice.tsx`, `flash-host.tsx`, `page-loading.tsx`; `lib/utils.ts`, `lib/use-flash-action.ts`, `lib/flash.ts`, `lib/hooks/use-hide-legacy.ts`, `lib/supabase/fetch-all.ts`; file search for error, not-found and loading pages; count of pages that read an error; `docs/user-guide/USER_GUIDE.md` lines 705-720.

## P7.5 — Phone and small screens, accessibility

- Code review only (no live look). Read: the shared layout, top bar, desktop sidebar, phone menu, menu list, buttons, the dropdown and table components, colour tokens, the page set-up (language, viewport), and every two-column grid.
- Problems: SCAN-P7-22 to 24.

## Checked and found sound (P7.5)

- The page is set to device width with zoom allowed and `lang="en"`; the page body never scrolls sideways (content wrapper hides overflow; tables scroll inside their own box).
- Under 768 px the sidebar becomes a slide-in menu with the same links, which closes on a tap, on Escape and on tapping outside; the page behind does not scroll while it is open.
- Text colours pass the 4.5:1 test: muted grey 7.0:1 on white, brand green 6.1:1, red 6.5:1, amber on its background 4.6:1, button text 6.1:1; status is always shown as text as well as colour.
- Success and error notices are announced (`role="status"` and `role="alert"`); the QC decision is a real radio group; the password box has a show/hide button with a name; the loading screen is announced politely.
- Phone-width headers: the top bar shows a short "N low" banner and wraps without overflow; the Reports and Dashboard cards use wrap rules.
- The carried note on template Reference sheets: the lists are read with paging, so the 1,000-row cap does not cut them; the dropdowns point at ranges on the Reference sheet (no 255-character list limit).

## Areas read (P7.5)

`app/layout.tsx`, `app/(dashboard)/layout.tsx`, `components/shell/*` (all six files), `components/ui/button.tsx`, `form.tsx`, `combobox.tsx`, `data-table.tsx`, `decision-choice.tsx`, `app/globals.css`; search for two-column grids; `lib/bulk-upload/templates.ts` (reference sheets); contrast computed by script.

## P7.6 — Performance and scale

- Built a local scale database (copy of the seeded test database plus 2,700 items, 92,000 purchase lines with one QC check each, and 1.09 million ledger rows), then timed the views, functions and page-shaped queries as a signed-in user with the row rules on. Existing items already in the docs (Reports and Items sending every row, stock views recomputed on each read, the chart library bundled) were not repeated: C16 and C17 stand.
- Problems: SCAN-P7-25 (and SCAN-P7-02, a duplicate of C17 with new numbers).

## Checked and found sound (P7.6)

- Every paged read ends on a unique order, so no rows are skipped; each page of the large reads costs 70 to 400 ms and eight run at once.
- The audit log has three indexes and the screen reads at most 500 rows; ledger inserts are not audited (the ledger is its own record), so audit growth is by master data and documents only.
- One-item reads are cheap: ledger per item 10 ms, stock position per item 15 ms, batch trace 21 ms (up to 1.1 million ledger rows).
- The current-approval view and the dashboard QC counts run in 85 ms for 58,000 current approvals and 92,000 checks.
- The top-bar banner is read inside its own loading boundary, so it never delays a page.

## Areas read (P7.6)

`docs/modules/performance.md`, `lib/supabase/fetch-all.ts`, `components/shell/topbar.tsx`, `audit/page.tsx`, migrations 0056, 0058, 0072, 0087, 0104 to 0108 (names of views and functions); own timings in `claude/scan-evidence-p7.sql` on a scale copy `scanperf`.

## P7.7 — User guide and module docs accuracy

- Read the guide's Dashboard, Purchase, Inventory Ledger, Quality Control, Label Printing, Certificate of Analysis, MFR, Finished Product, Packaging, Reports and Roles sections against the code, and compared the downloadable PDF with the Markdown.
- Problems: SCAN-P7-26 to 28.

## Checked and found sound (P7.7)

- The Inventory Ledger section (eight tabs, Stock Position, Stock Statement, Rejected Materials, Ageing, Retained Samples, Batch Trace) matches the screens as of the last edit.
- Roles and who can do what: the Purchase, Finished Product, Packaging, MFR, COA and Quality Control "Who can use it" lines match `MODULE_WRITE_ROLES`; the two-round QC rule and the same-person rule are described correctly.
- The Label Printing section (four label types, 6 or 10 per page, PDF only, blanks that print as lines) and the COA section (template needed, editable header, remarks wording) match the code read in Phase 4.
- Purchase submit, reopen and Draft rules, sample quantities being mandatory, the unit price and GST rule, and the Draft/Packaging-line behaviour are described correctly.
- `docs/modules/qc.md` is current for the Dashboard alerts (90 days) and the in-progress card.

## Areas read (P7.7)

`docs/user-guide/USER_GUIDE.md` (Dashboard, Roles, Purchase, Inventory Ledger, Quality Control, Labels, COA, MFR, Finished Product, Packaging, Reports), `docs/modules/user-guide.md`, `reports.md`, `packaging.md`, `qc.md`, `shell.md` (searches), `public/user-guide.pdf` (text), `app/(dashboard)/user-guide/page.tsx`, `lib/constants/roles.ts`, `lib/constants/nav.ts`, `qc-reviewer-form.tsx`, `qc-assign-form.tsx`, `purchase-line-form.tsx`.
