---
title: Scan findings — Phase 3 (purchase and inventory ledger)
---

# Phase 3 — Purchase and inventory ledger

Steps done: P3.1 to P3.5 (Phase 3 complete). Next: P4.1. (Rewritten whole after every step.)

## Findings

### SCAN-P3-01 — A purchase order reopened after QC approval keeps the approval; quantity, batch number and even the item can then be changed
- Severity: High
- Kind: Bug (quality control integrity)
- Where: `reopen_purchase_order` (System Admin), `trg_fn_guard_purchase_line_workflow`, purchase line edit (`updatePurchaseLine`), table `purchase_lines`, `quality_checks`
- Finding: Reopening a submitted purchase order is refused if a batch on it was rejected or has already been used, but not if QC has approved it. The existing test suite even asserts that "QC status still approved on the reopened batch". Once the order is back in draft, the line is freely editable by anyone with purchase rights, and nothing looks at the QC record attached to it. In the test, after reopen an Inventory Manager changed the approved batch's quantity from 100 kg to 40 kg (the reverse, 100 to 500, would put 400 kg of never-tested material under the same approval), changed its batch number, and changed which item the line is for (a raw material line became a finished product line); on re-submit the batch still showed as QC approved, with the QC record's sample quantity and item unchanged. The AR number, printed COA and any label already refer to the old batch number and quantity. The screen only offers quantity and sample fields for edit (not item or batch number); item and batch number are reachable through the API. A System Admin reopen is needed first, which limits who can start this, but nothing records why it was done and the approval silently survives.
- Evidence: Local database, script `claude/scan-evidence-p3.sql`: steps A to I (all ALLOWED): empty-PO submit, submit, QC round 1 and 2, admin reopen of an approved batch, then `update purchase_lines set quantity=40, qc_qty=2`, `batch_number='S1-B1-CHANGED'`, `item_id=<finished product>`, re-submit. Result line: `qty=40 batch=S1-B1-CHANGED item=FP-T0001 qc=approved sample_in_qc=1`. Suite `r_po_reopen.sql` line 64 asserts the approval is kept.
- Suggested fix: Two layers. (1) In `reopen_purchase_order`, refuse when any line has a QC record that is not rejected ("QC has started on batch X; void the QC record first") or, if reopening an approved batch is really needed, void the approval (set the QC record back to a voided state with a reason) so the batch must be re-tested. (2) In the purchase line guard, once a line has any QC record, refuse changes to item, batch number, unit and quantity; allow price and GST only. Size M (one migration, tests, no screen change beyond the message).
- Needs decision from Ravi: Yes. After QC has approved a batch, may the purchase order ever be reopened to correct it? If yes, the approval must be cancelled and QC repeated; if no, refuse.
- Confidence: Confirmed (local database)
- Status: New (ACC-06 and ACC-27 cover reopening of used or unusable batches, not approved-but-unused ones)

### SCAN-P3-02 — The invoice details of a purchase order (vendor, invoice number, invoice date) can never be corrected in the app
- Severity: Medium
- Kind: Missing function
- Where: `lib/actions/purchase.ts` (no update action for the order header), purchase order page
- Finding: A purchase order is created with vendor, invoice number and invoice date, and there is no action or screen to change any of them afterwards, even while the order is still a draft. A typo in the invoice number or date, or the wrong vendor, can only be fixed by deleting the order (System Admin only, and refused once a line has QC, production or inventory records) and entering it again, which also hands out new batch numbers. After submit and QC there is no way at all to correct the invoice number or date through the app, although the database would allow it while the order is a draft. The duplicate-invoice check and the Reports that group by invoice then carry the typo for good.
- Evidence: `grep -rn updatePurchaseOrder` finds nothing; `purchase-order-form.tsx` offers only delete, submit and reopen; the order guard trigger allows header edits when the order is a draft and the call is a direct API one.
- Suggested fix: Add "Edit invoice details" on a draft (including a reopened) order: invoice number and date editable always, vendor editable only while the order has no lines. Run the same duplicate and future-date checks. Audit trail already records it. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed (code)
- Status: New

### SCAN-P3-03 — A purchase order with no lines can be submitted; submit does not check price and GST, and a line saved at the same moment can be missed
- Severity: Low
- Kind: Bug (validation)
- Where: `submit_purchase_order`
- Finding: Submitting an order with no lines is accepted and leaves a submitted, empty order that blocks adding lines until a System Admin reopens it (tested, step A). The function also does not check that every line has a unit price and GST %, which the line form requires but the Excel upload and the database do not (SCAN-P2-07). Last, the line guard reads the order's status without locking it while submit locks the order only for itself; a line saved in the same instant as a submit could in theory be written after submit has chosen its lines, leaving a line that was never pushed to stock on a submitted order. The window is milliseconds and was not reproduced.
- Evidence: Local database, step A ALLOWED, resulting status `submitted` with zero lines. Function body has no `exists (select 1 from purchase_lines …)` test.
- Suggested fix: Refuse a submit with no lines; refuse a submit when any line has no price or GST (after the P2-07 decision); take a shared lock on the order in the line guard. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed (empty submit); Possible (race)
- Status: New

### SCAN-P3-04 — The first-in-first-out guard orders batches by when the line was typed, not when the goods arrived, and does not look at expiry dates
- Severity: Low
- Kind: Inventory tightening
- Where: `trg_fn_fp_component_fifo` (0090) and the same ordering in `trg_fn_packaging_item_pull`
- Finding: "Oldest stock must be used first" compares `purchase_lines.created_at`, the moment the line was entered on the purchase order. For a goods receipt that is entered on the day it arrives this is the same thing. It differs when an order is drafted early and submitted later: a line typed on the 1st of the month on an order submitted on the 20th is "older" than a batch received and entered on the 10th, so the guard would make production use the 20th-of-month delivery before the one that really arrived first. Opening stock is the deliberate exception (its `created_at` is set to the old receipt date). The guard also does not consider expiry: a newer batch that expires sooner can be passed over for an older batch that expires much later (first-expired-first-out is the usual pharmaceutical rule; the app enforces first-in-first-out, as decided). Whether Compose's default pick follows the same order is checked in P5.
- Evidence: Function body (`order by x.created_at, x.batch_number`, `pl.created_at < v_created`); `submit_purchase_order` sets `pushed_at` at submit time, which is the actual receipt moment in the system and is not used.
- Suggested fix: Order by the receipt moment: `coalesce(pushed_at, created_at)` for purchased batches, with legacy and opening-stock lines keeping their receipt-based `created_at`. Optionally add an expiry-first rule (earlier expiry first, then oldest) if the plant prefers FEFO. Size S (one migration, update the FIFO suite).
- Needs decision from Ravi: Yes. Keep first-in-first-out (by arrival), or switch to first-expiry-first-out?
- Confidence: Confirmed (code); consequence depends on how often orders are drafted days before they are submitted
- Status: New (the guard of migration 0090 does what it was built to do; this is about the basis it uses)

### SCAN-P3-05 — Stock is kept in two places that nothing compares; a drift would go unnoticed
- Severity: Low
- Kind: Enhancement (inventory tightening)
- Where: `inventory_ledger` (item level) and `purchase_lines.live_remaining_qty` / `production_issue_batches.live_remaining_qty` (batch level), changed in about fifteen separate database functions and triggers
- Finding: Every receipt, sample, issue, write-off, rejection, reopen, cancel and undo has to change both the ledger and the batch remaining figure in the same transaction. I checked this on the data left by six regression suites (reopen, packaging, first-in-first-out, rejected materials, retained samples, batch numbers) with seven invariants (saved as `claude/scan-invariants-stock.sql`): item on-hand equals the sum of its classified parts; each submitted batch's remaining quantity equals what the ledger shows; production-issued batches reconcile; nothing is negative; unsubmitted lines carry no purchase quantity; units and items agree; every write-off has a reason. All held, apart from fixtures where the suite itself overwrote the remaining figure by hand. So today the two agree. But there is no check in the app, and the next change to any of those functions could break the agreement quietly; the first sign would be a physical count that does not match, or an FP draft refused with "insufficient stock" while the item page shows stock.
- Evidence: Invariant results per suite database in `claude/scan-evidence-p3.sql` (part 2 lists the six suites) and the pack in `claude/scan-invariants-stock.sql`.
- Suggested fix: Add the invariant pack as a database function that a System Admin can run from a "Stock integrity check" page (and optionally a weekly scheduled run that e-mails or flags when any block returns rows); add a test to the regression suite that runs the pack at the end of the larger suites. Size S to M.
- Needs decision from Ravi: No
- Confidence: Confirmed (on suite data); live data to be checked with the pack (live check P3-E)
- Status: New

### SCAN-P3-06 — The reason entered for a wastage is saved but is not shown anywhere, and the screen still tells the user it is not stored
- Severity: Medium
- Kind: Gap (traceability) and formatting
- Where: Ledger page (`app/(dashboard)/inventory/(tabs)/page.tsx` select list, `inventory-ledger-table.tsx`), batch trace, Stock Statement, Excel export; `wastage-form.tsx` hint; comment in `lib/actions/inventory.ts`
- Finding: Since migration 0036 the ledger has a `reason` column and `record_wastage` writes the typed reason into it. No screen reads it: the ledger query does not select `reason`, the table and its Excel/PDF export have no Reason column, and neither the batch trace nor the Stock Statement shows it. A user (or an auditor) looking at a write-off sees only "Wastage / Purchase" with a quantity, not why it was written off. The form hint still reads "Recorded with this request; see docs/modules/inventory.md for a schema note on persistence", and the comment in `inventory.ts` still says the ledger has no reason column, so people are told the reason is not kept. The only way to see it is the database.
- Evidence: Code read: the ledger `.select(...)` string lists id, event_at, event_type, quantity, unit, department, reference_type, reference_id, event_by, running_balance, items, purchase_lines, production_issue_batches and no `reason`; no `.reason` read anywhere in `app/` or `lib/` for ledger rows. Local database: reason is stored (suite and script `p32_wastage.sql`).
- Suggested fix: Add `reason` to the ledger query, show it in a Reason/Remarks column on the Ledger and in the batch trace, include it in the exports, and correct the form hint and the code comment. Size S (no migration if the view already exposes the column; otherwise one view change).
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P3-07 — Nothing can be written off except a purchased batch: finished product, packed product and in-house raw material have no write-off, and no stock can be corrected after a mistake or a physical count
- Severity: Medium
- Kind: Missing feature (inventory tightening)
- Where: `record_wastage`, Wastage screen, Inventory module
- Finding: Wastage works only against a received purchase line, so it covers purchased raw material and purchased packaging. There is no way to record expiry, breakage or loss of a finished product batch, of packed finished product (packaged item), of production raw material made in-house, or of a lot loaded as opening stock without a batch. Such stock stays on hand until it is used, which makes the on-hand figure, the Stock Statement and the ageing report overstate what exists. The ledger is append-only, so a wastage typed wrongly (for example 500 instead of 5) cannot be reversed either; and there is no stock adjustment or physical-count entry in any module (the dead stock register only lists items, and states it does not change quantities). A count difference can therefore only be fixed in the database.
- Evidence: Code read: the Wastage form lists batches from `purchase_lines` only; `record_wastage` requires a purchase line; no other function inserts event type `wastage`; no adjustment or stock-count feature found in `docs/modules/` or `lib/actions/`. Not yet confirmed on the live data (would show as finished product batches past their expiry still counted on hand: data check P3-G below).
- Suggested fix: One generic "Write off / adjust" entry that works on any batch type (purchase batch, finished product batch, packaged lot) with reason mandatory, and a controlled reversal (a counter-entry linked to the original, with its own reason) instead of editing. Optionally a physical-count sheet (counted vs system, difference posted as adjustment after approval). Size L (migration, ledger event types, screens, tests).
- Needs decision from Ravi: Yes. Which stock types must be written off (finished product, packed product, in-house raw material), who approves, and whether a physical count sheet is wanted before go-live.
- Confidence: Medium (code read; live data check will confirm whether this matters now)
- Status: New (nearest: dead stock register, which is a list, not a stock change)

### SCAN-P3-08 — The database accepts a wastage with a blank reason and from QC roles; the screen rules differ from the database rules
- Severity: Low
- Kind: Hardening (validation only on screen)
- Where: `record_wastage`; `recordWastage` action; role gate `inventory` in `lib/constants/roles.ts`
- Finding: The screen requires a reason and trims it; the function does not check it, so an empty, NULL or one-space reason is stored (tested as QC Reviewer and QC Checker: three of three ALLOWED, wastage rows with blank reason). The function and the screen gate both allow four roles: System Admin, Inventory Manager, Quality Checker and QC Reviewer, which agrees between screen and database, but a QC Checker or QC Reviewer can write off any received batch whatever its QC state, with no second person. The function does not look at QC status at all (written off stock may be unapproved or not yet tested), which may be intended (destroying quarantined material) but is not stated.
- Evidence: Local database, `claude/scan-evidence-p3.sql` (script p32_wastage / p33_wastage2): empty reason, NULL reason and a single space all ALLOWED; invariant S7 returns the rows.
- Suggested fix: In `record_wastage` refuse a reason that is blank after trimming (minimum length 3, maximum 500). Size S (one migration, test). Role and QC-state rules follow the decision in SCAN-P3-09.
- Needs decision from Ravi: No for the reason check.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P3-09 — A write-off needs no second person, whatever the quantity
- Severity: Low
- Kind: Control (enhancement)
- Where: Wastage flow
- Finding: Any one of four roles can remove any quantity from stock in a single step with no review. Elsewhere in the app a second person is needed for QC (checker then reviewer). For an item such as a costly raw material, a single person can reduce stock to zero and the ledger shows only the name and a reason that cannot be seen (SCAN-P3-06).
- Evidence: Code read (no pending state exists for wastage; one RPC call writes the ledger row and reduces the batch).
- Suggested fix: Options: (a) keep as is and show the reason and user clearly (SCAN-P3-06); (b) a write-off above a set quantity or share of the batch goes "pending approval" and a second user (System Admin or Inventory Manager, not the requester) approves. Size M for (b).
- Needs decision from Ravi: Yes. Is single-person write-off acceptable, or should large ones need approval?
- Confidence: Confirmed (code); the need is a judgement
- Status: New

### SCAN-P3-10 — The low-stock warning counts expired, awaiting-QC and retest-due material as stock you have
- Severity: Medium
- Kind: Bug (inventory tightening)
- Where: Dashboard low-stock banner (`app/(dashboard)/page.tsx`), Stock Position, Items list, item page (`isLow`), view `item_stock_status`
- Finding: Every low-stock test compares the item's threshold with On hand. On hand includes batches that production cannot use: not yet QC approved, due for retest, past expiry. Stock Position already splits raw material into Usable, Awaiting QC, Retest due and Expired (migration 0105), but the "Low" mark and the banner ignore the split. Example: threshold 50 kg, On hand 120 kg of which 100 kg is expired and 20 kg waiting for QC: Usable is 0, yet no low-stock warning appears anywhere. The warning is the only reorder prompt in the app, so a purchase can be missed until production hits the QC gate.
- Evidence: Code read: `balanceMap.get(it.id) < low_stock_threshold` with `stock_balance.on_hand` (dashboard); `onHand < threshold` (Stock Position); `r.on_hand < low_stock_threshold` (Items list); `onHand < low_stock_threshold` (item page). `item_stock_status` header comment: the four figures add up to On hand for raw material.
- Suggested fix: For raw material compare the threshold with Usable (plus optionally Awaiting QC shown separately: "low unless QC passes"); keep On hand for packaging and finished product. Show both figures in the banner. Size S to M (one shared helper, one view read on the dashboard).
- Needs decision from Ravi: Yes. Should the threshold mean "usable now" or "everything on the shelf"? (Recommended: usable now.)
- Confidence: Confirmed (code)
- Status: New

### SCAN-P3-11 — The RM Report "As on date" shows today's quantities for any past date, and its grand total value is not reliable
- Severity: Medium
- Kind: Bug (report accuracy)
- Where: `app/(dashboard)/inventory/(tabs)/rm-report/page.tsx` and its PDF/Excel export
- Finding: The report lists purchase batches whose line was created on or before the chosen date, but the quantity column is `live_remaining_qty`, the quantity left today. Choosing 30 September on 10 October therefore shows batches with their October usage already taken off, under a title "RM Report As On Date 30 Sep" in the PDF. The Stock Statement is the report that gives true past figures. Further, the value (quantity × unit price) and its Grand total: (a) includes batches QC has rejected, which are out of On hand; (b) leaves out raw material made through production issues (they are stock of raw items, shown on Stock Position); (c) counts a missing price as 0 with no mark; (d) filters on the date the line was typed (for opening stock, the receipt date), so a batch received on the chosen day but typed later is left out and one typed early is included. The result is a figure that matches neither Stock Position nor the ledger.
- Evidence: Code read (select list, `.lte("created_at", istDayEnd(asOf))`, `qty = Number(r.live_remaining_qty)`, `total: qty * unitPrice`, no QC-status filter).
- Suggested fix: Build the as-on quantity from the ledger per batch (push minus pulls and wastage up to end of that day, the same arithmetic as the Stock Statement); drop rejected batches; add production RM batches; show "No price" instead of a silent 0; use the receipt date. Or, if only today is needed, remove the date picker and title it "Current". Size M.
- Needs decision from Ravi: Yes. Is a true "as on" past date needed (for audit or valuation), or only today's figure?
- Confidence: Confirmed (code)
- Status: New (ACC-08 fixed the 1,000-row cap on this report, not its meaning)

### SCAN-P3-12 — Stock Statement labels opening loads as "Purchased" and hand-backs as "Other in", and does not cover the same items as Stock Position
- Severity: Low
- Kind: Formatting / reporting accuracy
- Where: `stock_statement()` (migration 0107), Stock Statement screen
- Finding: Opening-stock rows are written to the ledger as `push` with reason `purchase`, at the time of the load. In the statement they show under Purchased for the month they were loaded (reproduced: a 10 kg opening load adds 10 kg to Purchased), and the receipt date typed on the file is ignored. When a rejected batch is written off, the function hands the quantity back with a `push` (reason `qc_rejected`) and then records the wastage, so the statement shows the same quantity in both Other in and Wastage; a reversed rejection also shows as Other in. Closing is still right, but the In and Out columns are inflated by internal moves. The statement also lists inactive items (no active filter) while Stock Position and the low-stock banner list only active ones, so totals do not line up for an item that was deactivated with stock.
- Evidence: Local database, `claude/scan-evidence-p3.sql` (p34_statement): opening load of 10 kg, statement shows Purchased increased by 10; function source (`other_in` takes every push not in the four named reasons, including `qc_rejected`).
- Suggested fix: Treat pushes with `reference_type = 'qc_rejected'` as net-zero moves (show them against Rejected, not Other in), add an "Opening load" column (via `purchase_orders.opening_load_id`), and add an Active-only toggle or a note. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database and code)
- Status: New

### SCAN-P3-13 — Batch Trace stops quietly at six levels or 1,000 lines, and the search shows only 25 matches per type
- Severity: Low
- Kind: Hardening (recall report completeness)
- Where: `trace_batch()` and helper functions (migration 0106), `batch-trace/page.tsx`
- Finding: The trace stops at six levels (`p_depth > 6`) and, because it is read through PostgREST, stops at 1,000 returned lines, in both cases without any mark on the screen. For a recall the user must know the list is complete. The batch search shows the 25 newest matches per type and does not say that more exist, so a short search text such as "B1" can hide the batch wanted. The forward trace ends at the packaging issue (Store, R&D, Production); the app has no dispatch or customer record, so "where did it go" cannot reach a customer (→ P9.1).
- Evidence: Code read: `if p_depth > 6 or p_id = any(p_seen) then return;` with no marker row; `.limit(25)` on each of three searches; trace read with no paging.
- Suggested fix: Add a final row "Trace cut at level 6 / more than 1,000 lines" when it happens, page the trace with `fetchAllRows`, and show "25 of many shown, narrow the search". Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P3-14 — "Taken on" in Retained Samples is the date the record was typed, not the date the sample was taken or received
- Severity: Low
- Kind: Gap (GMP record accuracy)
- Where: view `retained_samples` (migration 0108), Retained Samples screen
- Finding: For raw material the date shown is the purchase line's creation time, for finished product the batch creation time, and, for opening-stock loads, the receipt date from the file (which is the better date). A line typed on Monday and received on Thursday shows Monday; a finished product batch shows the day it was started rather than the day the sample was drawn. If the sample retention period is calculated from this date, it will be wrong.
- Evidence: Code read: `pl.created_at as taken_at`, `pb.created_at`, `fpb.created_at`.
- Suggested fix: Use the PO submit time (received) for raw material and the QC sampling time or finish date for finished product; or label the column "Recorded on". Size S.
- Needs decision from Ravi: Yes (small): which date is the sampling date for each type?
- Confidence: Confirmed (code)
- Status: New

## Carried to later steps

(Earlier carry-overs are in `claude/scan-findings-p1.md` and `-p2.md`.)

- QC attached to a line whose quantity or item no longer matches (data check P3-A below; → P4.1 for the QC side).
- Wastage (done in P3.3, see SCAN-P3-06 to 09).
- Stock Statement and ageing reports use ledger time for opening-stock rows (done in P3.4: SCAN-P3-12, 14).

## P3.1 — Purchase order life cycle

- Create: vendor, invoice number and date required; invoice date not in the future; duplicate invoice per vendor refused (case-insensitive, app level only, D26); PO number from `get_next_po_number` (public-key use: SCAN-P1-10).
- Lines: unit price and GST required in the form; samples converted to the line unit and checked against the quantity (database CHECK repeats it); item unit conversion at insert (`trg_00_unit_purchase_line`) stores quantity in the item's own unit and moves the price the other way; unit of an existing line cannot change; batch number from `get_next_batch_number` with up to three retries on a clash and a unique index behind it.
- Submit: one transaction, row lock on the order, writes the stock push and the QC, stability and R&D sample pulls, then flags lines and order; a second submit is refused.
- Reopen: System Admin only; refused for a rejected batch or a batch already used; reverses the stock and the sample pulls exactly; sets the order back to draft. See SCAN-P3-01 for the gap.
- Delete: System Admin only; refused when any line has downstream records.
- Time: the database time zone is Asia/Kolkata (migration 0081), so batch, AR, COA and FP numbers take the Indian year.
- Problems: SCAN-P3-01 to 03.

## P3.2 — Ledger writes and stock views

- Ledger table: insert only through database functions (policy `false` for direct inserts, no update or delete policy); quantity cannot be negative; event types and reference types are fixed lists; a unit trigger keeps the ledger unit equal to the item's unit; every row has a database timestamp and a sequence number for ordering. Nobody can back-date a row.
- Writers: receipt and reopen, QC rejected move and its reversal, FP draft consumption and cancel reversal, packaging issue pulls and yields, production-issued RM, retest sample, opening loads and their undo, wastage. Each also changes the batch remaining figure where the stock belongs to a batch.
- Views: `stock_balance` (item on-hand) and `item_position` (on-hand split into received, yielded, held for QC / stability / R&D, consumed, packaging, wastage, rejected). Decomposition identity holds on every test database (invariant S1).
- Batch reconciliation (S2, S3): holds after submit, reopen, FP consumption, packaging, wastage, rejection, retests, opening load and undo.
- Packaging pulls take the oldest batches first, ignore QC (packaging has no QC in this app, by design) and fall back to an item-level pull when stock is not held in a batch (opening balances).
- Problems: SCAN-P3-04 (FIFO basis), SCAN-P3-05 (no automatic reconciliation). Wastage questions are in P3.3.

## P3.3 — Wastage and adjustments

- Screen: item, then batch (only received batches with stock left), quantity, unit limited to units that convert to the batch unit, reason required (trimmed). Role gate matches the database.
- Function: one transaction, row lock on the purchase line, converts units, refuses an unreceived batch or an item/batch mismatch, hands the written-off part back from Rejected first so On hand does not change twice, writes the ledger row with the reason, lowers the batch remaining figure; the batch cannot go below zero (constraint `live_remaining_not_negative`).
- Problems: SCAN-P3-06 (reason invisible), P3-07 (no write-off for other stock types, no adjustment or correction), P3-08 (blank reason accepted), P3-09 (no second person).

## P3.4 — Stock reports built this month

- Stock Position (`item_position`, `item_stock_status`): decomposition identity holds; paged reads (ACC-07/08); QC split matches the Compose rule. Problems: SCAN-P3-10 (low-stock test).
- Stock Statement: opening, in, out, closing from one pass over the ledger, India-time day boundaries, future To date refused; closing for today equals On hand. Problems: SCAN-P3-12.
- RM Report as on date: SCAN-P3-11.
- Rejected Materials: rejected raw lists agree with the ledger move; rejected finished product never entered the ledger (yield is pushed at QC approval), so nothing to take out; the listed quantity can never go down because there is no write-off for it (SCAN-P3-07).
- Batch Trace: SCAN-P3-13. Ageing: approved batches only, earlier of retest and expiry, India-time today, paged read; no problem found beyond SCAN-P3-07 (expired finished product stays listed with no way to dispose). Retained Samples: SCAN-P3-14.
- Reconciliation of finished product: batch bulk remaining against ledger On hand was compared on the six suite databases. **Corrected in P6.3 (11 Oct 2026):** the first comparison subtracted `packaged_qty` from the yield, but `packaged_qty` counts packs, not kilograms, so it was the wrong measure and the two disagreements were put down to test data wrongly. The same mistake is in the Expiry & Retest Ageing view (0108) and is now reported as SCAN-P6-06. INV-S8 has been rewritten to use the bulk quantity on the packaging issues and to count approved batches only.

## P3.5 — Data invariants, stock side

The pack `claude/scan-invariants-stock.sql` has ten read-only checks (INV-S1 to S10): item on hand equals the sum of its parts; batch remaining equals the ledger for that batch; production batch remaining; negative stock; unsubmitted lines carrying a purchase quantity; unit and item mismatches; wastage with no reason; finished product batch bulk against the ledger; duplicate batch numbers; orphans (submitted line with no receipt push, receipt push on a line that is not submitted, QC record pointing at nothing). Each should return no rows.

Run on the eight local databases (clean install, the scan database, six suite databases): S1, S3 to S6, S9 and S10 return nothing everywhere. S2 returns two rows on the FIFO suite database; in that case the suite had set the stored remaining quantity by hand or seeded finished product batches straight into the table to stage a scenario (the app cannot produce either), so these are test artefacts, not findings. S7 returns the wastage rows written with a blank reason by this scan's own tests.

Direct edits of the stored remaining quantity are refused for a draft line and for a submitted line ("Stock fields on a purchase line are maintained automatically"); a draft line set to 500 and then submitted ended at 99 with a ledger of 99 (script p35_liveqty2).

The pack is for Ravi to run on the live database when he is ready; the first run is the one that matters (he pastes the results back for review). Expected on live: S7 may return old rows; anything else is worth a look.

## Checked and found sound (P3.1 to P3.5)

- Duplicate invoice per vendor is checked before create; invoice date in the future refused.
- Direct-API inserts of an already-submitted order, or edits of a submitted order's lines, are refused by the workflow guards.
- Sample quantity can never exceed the received quantity (CHECK `remaining_not_negative`).
- Batch number generator copes with concurrent saves (unique index and retry).
- Submit locks the order row; a double click or two users submitting cannot push stock twice.
- Reopen reverses exactly what submit pushed and refuses when stock has been used.
- The stock ledger cannot be written, changed or back-dated by any signed-in user; stock arithmetic reconciles item-level against batch-level on all six suite databases.
- Stored remaining quantity on a purchase line cannot be set by hand, and submit gives the right figure; stock and batch invariants S1, S3 to S6, S9 and S10 are clean on every local database.
- Wastage cannot exceed what the batch holds; unit conversion is exact and refused for incompatible units; wastage of an unreceived (draft) batch is refused; item and batch must agree.
- Rejected batches leave On hand but keep their physical remaining quantity; write-off of a rejected batch hands the written-off part back first, so On hand is unchanged by disposal.

## Areas read (P3.1 to P3.5)

`lib/actions/purchase.ts` (all), `app/(dashboard)/purchase/*` (order form, line form, view), `submit_purchase_order`, `reopen_purchase_order`, `trg_fn_purchase_line_item_unit`, `trg_fn_guard_purchase_line_workflow`, `trg_fn_guard_purchase_order_workflow`, `get_next_batch_number`, number generators using `to_char(now(), …)`, database time zone setting and migration 0081, suite `r_po_reopen.sql`; own local-database test (`claude/scan-evidence-p3.sql`).

`wastage-form.tsx`, `wastage/new/page.tsx`, `recordWastage`, `lib/ledger-reasons.ts`, ledger page and table, role gate `inventory`, docs `dead-stock.md`; own tests p32_wastage and p33_wastage2.

`balance/page.tsx`, `item_stock_status` (0105), `stock_statement` (0107), `rm-report/page.tsx`, `rejected/page.tsx`, `batch-trace/page.tsx` and `trace_batch` (0106), `ageing/page.tsx` and views `batch_ageing`, `retained_samples` (0108), dashboard low-stock block; own tests p34_statement and p34_fp.

`inventory_ledger` table, constraints, policies and triggers; `stock_balance`, `item_position` views; `trg_fn_purchase_line_live_remaining`, `trg_fn_fp_component_fifo`, `trg_fn_fp_component_pull`, `trg_fn_fp_component_live_remaining_pull`, `trg_fn_packaging_item_pull`, `trg_fn_qc_rejected_stock`, `record_wastage`; list of all functions that insert into the ledger; suites `r_po_reopen`, `p_packaging`, `part_b16_fifo`, `rejected_materials_0104`, `ageing_samples_0108`, `b_batch_numbers_retests` run on scratch databases followed by the invariant pack (`claude/scan-invariants-stock.sql`).
