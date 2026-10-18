---
title: Scan findings — Phase 10 (cross-cutting integrity and concurrency)
---

# Phase 10 — Cross-cutting data integrity and concurrency

Steps done: P10.1, P10.2, P10.3. Next: P10.4. (Rewritten whole after every step.)

## Findings

### SCAN-P10-01 — A line added at the moment an order is submitted lands on a submitted order but never enters stock
- Severity: Low
- Kind: Race (reproduced with two live sessions)
- Where: `trg_fn_guard_purchase_line_workflow` (0070), `submit_purchase_order`
- Finding: Submitting an order locks the order row and pushes its lines into stock. The guard that refuses new lines on a submitted order reads the order status without taking a lock, so a line saved by another person while the submit is still uncommitted sees "draft" and is accepted. Result seen in the test: order submitted, line 1 pushed (stock 99), line 2 saved with `pushed_at` empty, `live_remaining_qty` 49 and no ledger rows. The order total includes goods that are not in stock and nobody gets an error. The time window is a few milliseconds in normal use (the test held the submit open for 4 seconds), so this is rare, but the outcome is silent.
- Evidence: `claude/scan-evidence-p10.sql` R1 (reproduction) and live check 12 (lists any such line today).
- Suggested fix: In the guard, read the order with `for share` (a submit then waits for the line save, or the line save waits for the submit and then sees "submitted" and is refused); also make `submit_purchase_order` refuse an order whose lines include one with `pushed_at` already empty after the push loop. Size S with a test suite case.
- Needs decision from Ravi: No.
- Confidence: Confirmed (reproduced)
- Status: New

### SCAN-P10-02 — Two people deciding the same QC record at once both succeed; the later one silently wins and the record can end up mixed
- Severity: Low
- Kind: Race (reproduced with two live sessions); root cause SCAN-P1-08
- Where: `lib/actions/qc.ts` (round 1 and round 2 decisions read the status, then update by id only), `trg_fn_qc_enforce_review_stages` (0054)
- Finding: With a record waiting for the final decision, a QC Reviewer approved (retest 90 days, expiry set) while a System Admin rejected at the same time. Both saves were accepted; the final record was "rejected" with the approval's expiry date and retest days still on it, and the reviewer who approved was told "approved". The stock ledger ends correct because the rejection trigger moves the batch out and an approval after a rejection moves it back. The cause is a check-then-act gap in the action (no status condition in the update) plus the stage trigger not guarding a change from a decided state (SCAN-P1-08). Two real people deciding one record in the same second is unlikely in a small team; a double-click or two open tabs by the same person is not blocked either, but stays within one decision.
- Evidence: `claude/scan-evidence-p10.sql` R2 and live check 13.
- Suggested fix: Add `.eq("status", <expected status>)` to each decision update and treat "0 rows updated" as "someone else has already decided this record"; clear expiry and retest when a record becomes rejected; close the root cause with the P1-08 trigger (a decided record cannot change). Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (reproduced)
- Status: New (root cause is SCAN-P1-08)

### SCAN-P10-03 — No screen checks that a record is unchanged since it was opened: the last save overwrites the other person's edit
- Severity: Low
- Kind: Gap (lost update)
- Where: the update actions of items, vendors, item types, equipment, dead stock, MFR header, purchase line edit, FP batch edit and QC (12 files; none send or compare `updated_at` or a version)
- Finding: An edit form loads the record, shows every field and, on save, writes every field back with `update ... where id = ...`. If two people edit the same record, the second save puts back the first person's old values for fields the second person never touched (for example one changes a vendor's phone, the other fixes the address from a page opened earlier; the phone returns to the old number). Nothing says "this record changed since you opened it". The audit trail keeps both writes, so nothing is lost for good, but nobody is told. Heavily shared records are the item master, vendors, MFR headers and purchase lines in a draft order.
- Evidence: Code read of the update actions (e.g. `lib/actions/vendors.ts` lines 112 to 121: all five fields written, condition `id` only).
- Suggested fix: Carry the loaded `updated_at` in a hidden field and add it to the update condition; if no row is changed, answer "Someone else changed this record while you were editing it. Reload to see their change." One shared helper, then add it to each action. Size M for all, S for the first three (items, vendors, MFR).
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P10-04 — Item and vendor name checks exist only in the app: the database accepts two items or vendors with the same name, so two saves at once or an upload plus a form can create a pair
- Severity: Low
- Kind: Integrity (rule in the app only)
- Where: `items`, `vendors` (unique rules exist only for the code, barcode, packaged / production links), `lib/actions/items.ts`, `lib/actions/vendors.ts`, bulk upload
- Finding: Two items named "Same Name" and two vendors named "Same Vendor" / "same vendor" were saved directly (ALLOWED). The screens check for a duplicate before saving, but a check followed by an insert is not safe when two saves overlap (two people, a double upload of the same file, or an upload and a form). SCAN-P2-03 already notes the check is narrow (spaces, punctuation); this adds that there is no database backstop at all. Equipment Asset ID and dead stock article name are app-only by Ravi's decision of 14 Sept and are not part of this finding. MFR names, documents (title and revision, SCAN-P8-06) and COA records have the same shape.
- Evidence: `claude/scan-evidence-p10.sql` R4; live check 14 lists any pair that already exists.
- Suggested fix: Run live check 14 first and merge or rename any pair; then add a unique index on the cleaned name (`lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`) for active items and vendors, and make the action show the same friendly message when the index refuses. Size S plus the cleanup.
- Needs decision from Ravi: No (the cleanup of existing pairs, if any, needs his eye).
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P10-05 — No ceiling on any quantity, price or text: a purchase of 1e30 kg at a price of 1e20 was accepted and pushed into stock
- Severity: Low
- Kind: Gap (plausibility / limits)
- Where: all 56 numeric columns are unconstrained `numeric`; all 134 text columns except company details have no length limit; zod schemas check "greater than zero" and not negative only (`lib/actions/purchase.ts` lines 161 to 166)
- Finding: On a draft order a line with quantity 1,000,000,000,000,000,000,000,000,000,000 kg and unit price 1e20 was saved, the order was submitted and the item's stock on hand became 1e30. A vendor name of 5 million characters was saved. These are extremes, but they show there is no ceiling to catch the ordinary slip (an extra zero: 10,000 for 1,000) that the screen would otherwise show without a word. A purchase can be reopened and corrected by a System Admin, so the damage is recoverable; stock, the Dashboard and reports are wrong until someone notices. The batch-yield case is SCAN-P5-05 and GST over 100 % is SCAN-P2-09; this covers purchase quantity and price, wastage, packaging and the free-text fields.
- Evidence: `claude/scan-evidence-p10.sql` R5; live check 16 lists the largest values stored today.
- Suggested fix: (1) Table checks with generous ceilings (for example quantity under 10,000,000, price under 10,000,000, GST up to 100, text 200 characters for names and 2,000 for comments); (2) a yellow "this is 10 times the last purchase of this item, continue?" prompt on the purchase line and the batch-yield forms, comparing with the previous line of the same item. Size S for the checks, S to M for the prompt.
- Needs decision from Ravi: Yes (small). Which ceilings, and warn or block?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P10-06 — Money has no rounding rule: screen totals can differ from the sum of the lines shown by a paisa, and screen and Excel/PDF can differ too
- Severity: Low
- Kind: Bug (small) / Gap
- Where: `purchase/[id]/line-financials.ts`, `purchase/page.tsx` (`lineTotal`), `purchase-order-view.tsx`, `inventory/(tabs)/rm-report` (screen uses `formatNumber`, the download uses `toFixed`), `lib/utils.ts`
- Finding: Line amounts are worked out in floating point and never rounded to the paisa; only the display rounds. Three lines of 52.4947, 87.4912 and 10.3740 show as 52.49, 87.49 and 10.37 (sum 150.35) while the order total shows 150.36. Separately the screen formats with the browser's number formatter and the downloads use `toFixed(2)`; on half-paisa values they disagree (a line of 0.045 shows 0.05 on screen and 0.04 in the Excel/PDF; 1 × 1.7 × 1.05 = 1.785 shows 1.79 on screen and 1.78 with `toFixed`). A vendor invoice rounds each line (or the total) by its own rule, so the order screen may differ from the invoice by a few paise. No total is stored; nothing posts to accounts.
- Evidence: Computed with the app's own formulas (`claude/scan-evidence-p10.sql` R6).
- Suggested fix: One money helper that rounds each line amount to two decimals (half up, done on whole paise to avoid binary error), used by the screen, the totals and every download; state the rule on the order page ("each line rounded to the paisa"). Size S.
- Needs decision from Ravi: Yes (small). Round each line, or the total only, to match the accounts staff's invoice rule?
- Confidence: Confirmed (computed)
- Status: New

### SCAN-P10-07 — Seven database functions and two views take "today" or the year from the session time zone, while the AR number names India time explicitly
- Severity: Low
- Kind: Robustness
- Where: year in `get_next_batch_number`, `get_next_fp_batch_number`, `get_next_production_batch_number`, `get_next_coa_number`; "today" (`current_date`) in `check_batch_qc_approved`, `start_retest`, `trg_fn_fp_component_fifo` and the views `current_qc_approvals`, `item_stock_status`
- Finding: Migration 0081 sets the time zone of the database and of the API role to Asia/Kolkata, and the retest date and AR number name the zone explicitly. The functions listed take the year or the date as the session gives it, so they are right only while that setting is in force. If it is lost (a restored backup into a new project, a new connection role, the second environment of B40) batch-number years and the expiry / retest comparisons shift by 5 hours 30 minutes: the year in a batch number changes late on 31 December instead of at midnight India time, and a batch expiring "today" is judged by the wrong calendar day for part of the day. The setting is applied by the fresh-install file, so a rebuilt environment is safe; the risk is a restore or a change by hand. Functions that only stamp `now()` into a timestamp column (submit, reopen, approve, the 30-minute draft clock) are not affected.
- Evidence: Function and view search (`claude/scan-evidence-p10.sql` section P10.2-A); live check 15 shows the setting the API role actually gets.
- Suggested fix: Run live check 15 once (it should say Asia/Kolkata). Then, in the next migration that touches each function, use `(now() at time zone 'Asia/Kolkata')::date` for dates and the same expression for the year. Size S, done opportunistically.
- Needs decision from Ravi: No.
- Confidence: Confirmed (function text); live setting to be confirmed by check 15
- Status: New

### SCAN-P10-08 — Application code has no automatic tests and nothing runs on a push: the 26 database suites are the only safety net, and they are run by hand
- Severity: Medium
- Kind: Gap (safety net)
- Where: `package.json` (scripts: dev, build, start, lint; no test script), no `.github` folder (no automated checks on push), `supabase/tests`, `scripts/dev/run-tests.sh`
- Finding: Application code is 35,600 lines: 85 server actions, 69 screens and about 15 modules of pure rules (money, dates, ageing, units, retest and expiry state, export builders, label and PDF layout). None has an automated test. The database side is well covered: 26 suites with 895 checks all passed on 11 Oct 2026 (one expected failure in `sec07` is a test-stub difference, not an app problem). Nothing runs them on a push; the type check, lint and build are run by hand before each delivery. The scan found 131 things to change; each fix will rely on those hand-run checks and on Ravi's live checks (the E-series has reached E44). The scan's own finding list also shows the kind of fault such tests catch: rules held only on a screen (P4-02, P5-06), a count query that changed after a view change (P6-06), silent read failures (P7-17).
- Evidence: Directory search for test and workflow files finds only `supabase/tests/*.sql`; `claude/scan-evidence-p10.sql` section P10.3 shows the coverage run.
- Suggested fix: Three small steps, in this order. (1) A GitHub workflow that runs type check, lint, build and the database suites (a Postgres service is available there) on every push to `main` and `staging`, so a broken push is seen within minutes. (2) Turn each scan repro into a database suite as its fix is built: the repro scripts already exist (`claude/scan-evidence-p1.sql` to `p10.sql`) and each currently prints "ALLOWED" for a hole, so the suite is the same script with the expectation reversed. (3) Add a unit-test runner (Vitest) for the pure helpers first (money, dates, ageing, units, retest state, paging, export builders), then one browser smoke test per main screen against the second environment (B40). Size M for step 1 plus the first suites; steps 2 and 3 grow with the fixes.
- Needs decision from Ravi: Yes. Is the GitHub workflow wanted (it uses GitHub's free minutes), and may the fixes be delivered together with their suites?
- Confidence: Confirmed (files and the run)
- Status: New

### SCAN-P10-09 — Three database functions are never run by any suite, including the bulk purchase upload, the MFR recipe edit and the audit-log protection
- Severity: Low
- Kind: Gap (test coverage)
- Where: `bulk_create_purchase_orders` (Purchase bulk upload), `update_mfr_recipe` (MFR recipe edit), `trg_fn_audit_log_immutable` (blocks changes to the audit log); also no suite touches the deprecated BMR tables (`bmr_records`, `bmr_weighment_lines`, `bmr_observations`) or the views `current_qc_approvals` and `item_stock_status`
- Finding: With function tracking switched on, the 26 suites run 97 of the 119 functions in the database. Of the 22 not run, 19 are one-line SQL helpers that the database inlines (number previews, trace helpers, the signed-in test) and cannot be counted this way; three are real procedures: the purchase bulk upload, the MFR recipe update and the audit-log immutability trigger. The first two are used daily; the third is the proof that the audit trail cannot be edited (I checked it by hand in P1.6, but no suite repeats the check). The QC two-round review, FP compose / complete / QC, wastage, packaging, opening stock, reopen, retest, role change and the FIFO rule all have suites. Other uncovered points: no suite signs in through the real Supabase Auth (a stub is used), and the sole expected failure in `sec07` (cascade delete of the last admin) hides behind the stub.
- Evidence: `claude/scan-evidence-p10.sql` section P10.3 (method and the uncovered list).
- Suggested fix: Add one small suite each for the bulk purchase upload (a good file, a duplicate invoice, a bad unit), the MFR recipe update (change a line, a locked MFR), and the audit log (update, delete and truncate are refused for every role, including the owner). Size S for the three.
- Needs decision from Ravi: No.
- Confidence: Confirmed (measured)
- Status: New

## Carried to later steps

- Time-of-check windows on the bulk upload and opening-stock close/load (a load while the close is being saved): small and not tested; listed here for the next review.
- Raw-material item codes have three digits (RM-001); from RM-1000 a plain text sort puts RM-1000 before RM-200. Not an issue until the code count passes 999 (the 1,967 old codes are prefixed LEG-); check the highest RM code before then.

## P10.1 — Concurrency and races

Method: read every function that changes stock or workflow for its locks (15 take row locks, 6 take advisory locks), then reproduced the suspicious ones with two live database sessions on a scratch copy, one holding its transaction open for four seconds while the other acted.

- Tested: PO submit versus add line (SCAN-P10-01); QC approve versus reject (SCAN-P10-02); two stock draws of 60 against 108 on hand (sound); duplicate names (SCAN-P10-04).
- Read, not run: compose from one batch twice, packaging material draw, wastage, role change, MFR approval, draft cancel against batch confirmation, batch-number allocation.

## Checked and found sound (P10.1)

- **Stock sufficiency:** `check_sufficient_stock` locks the item row first and reads the balance afterwards. In the two-session test the second draw waited for the first, saw 48 left and was refused with the normal message ("48 kg available, 60 kg needed"). Packaging materials, write-offs and sample pulls all pass through it.
- **Compose from the same batch:** the batch's remaining quantity is reduced under a row lock and a table rule refuses a negative result, so two compositions cannot take the same kilogram (the second is told "One of the values isn't allowed — check that quantities aren't negative or above what's available"). The FIFO check takes a per-item advisory lock, so two people composing one item queue up.
- **Packaging:** each issue locks the finished-product batch (ACC-19) and draws batch by batch in a fixed order, so two issues cannot overdraw a batch or deadlock on the order of locks.
- **Purchase order:** submit, reopen and the other order functions lock the order row and re-read its status afterwards, so a second submit is told "This purchase order has already been submitted."
- **Batch numbers and codes:** the previewed batch number can be the same for two people working on the same item at the same moment, but unique indexes on purchase batches, production batches, finished-product batches, AR numbers, PO numbers, packaging codes and item/vendor codes make the second save fail with a readable message instead of creating a duplicate. QC has a partial unique rule (one pending record per batch) and a lock when a retest starts.
- **Roles and last administrator:** changing roles and removing the last System Admin take an advisory lock, so two administrators cannot remove each other.
- **FP draft expiry versus confirmation:** a draft cancelled by the 30-minute rule cannot be confirmed afterwards (the workflow guard re-reads the status and refuses a move from cancelled).
- **Database error text:** deadlock, lock-timeout, statement-timeout and serialisation errors are mapped to plain messages (`lib/db-errors.ts`).

## Areas read (P10.1)

All functions with their lock use (15 row-lock, 6 advisory), `check_sufficient_stock`, FP component triggers (live-remaining pull, FIFO, QC gate), packaging triggers, `record_wastage`, `submit_purchase_order`, `trg_fn_guard_purchase_line_workflow`, `trg_fn_guard_fp_batch_workflow`, `expire_stale_fp_drafts`, `trg_fn_qc_enforce_review_stages`, `trg_fn_qc_rejected_stock`, the list of all unique indexes, the update actions in `lib/actions/*.ts`, `lib/db-errors.ts`; four two-session reproductions on `scanconc` (a copy of the seeded test database), scripts `conc_*.sql`.

## P10.2 — Time, numbers, text

Method: read every date helper and the places that bypass them, every number generator, the arithmetic on quantities and money in the screens and downloads, and the column types; tested limits and rounding with the app's own formulas.

## Checked and found sound (P10.2)

- **India time on screen:** all dates and times pass through `toIstDateString`, `formatDate`, `formatDateTime` and `todayIst`, which pin the zone to Asia/Kolkata; date-only values are never re-parsed as UTC; day filters use `T00:00:00+05:30` to `T23:59:59.999+05:30`; the 30-day charts use pure calendar arithmetic. The only direct `toLocaleString` calls (Ledger, labels) also name the zone or a month only.
- **Number generators:** padding never truncates (`_pad_seq_code` and the packaging code use the larger of the width and the length), so PO-10000 and PKG-12345 are fine; AR numbers use the India year and create the yearly sequence when the year turns (race-safe); all numbers come from sequences, so two people never get the same one. The yearly restart of batch and AR numbers is by design; COA numbers continue across years with the four-digit year at the end.
- **Search text:** `%` and `_` typed by a user are escaped before every duplicate check and search (`escapeLike`); the one place that builds a filter string by hand (Batch Trace) cleans commas and brackets first; no value is placed in a query text by concatenation.
- **Spreadsheet and PDF text:** a cell beginning with "=" is stored as text by the Excel writer (tested in P7); quantities show up to three decimals with trailing zeros removed and thousands grouped the Indian way.

## Areas read (P10.2)

`lib/utils.ts`, `lib/dashboard-series.ts`, `lib/ageing.ts`, the search for date and rounding code in `app`, `lib`, `components`; number generator functions; the column list of numeric and text types; migration 0081; `line-financials.ts`; the purchase page; `rm-report` page and export; own tests on `scanconc` (large values) and with the app's formulas in Node.

## P10.3 — Test coverage gaps

Method: ran the whole database test run with function tracking on (a copy of `scripts/dev/run-tests.sh` that sets `track_functions = all` per database and reads `pg_stat_user_functions` before each database is dropped), then compared the functions that were called with the 119 functions in the database; counted tables, views and policies against the suites; searched the repository for test files, test scripts and workflows.

- **Database suites:** 26 suites, 895 checks, all passing on 11 Oct 2026 (about 20 seconds). Covered areas, by suite: batch numbers and retests (b), packaging (p), PO reopen (r), single unit per item (u), workflow guards (sec04), audit trail (des02), India time (tz), last administrator (sec07), security reads (sb), the Part A form and hardening fixes (a0085 to a0088), FIFO (b16), RM code format (fb45), COA template per item (c96), expiry (fb58), AR number format (fb59), opening stock raw / finished (os100, os101), company settings (cs102), rejected materials (rj104), stock status (ss105), batch trace (bt106), stock statement (st107), expiry and retest ageing with retained samples (ag108).
- **Not covered by name of flow:** the screens' server actions (85), the 69 screens, the label / COA / intimation / batch-record PDFs, Excel exports, bulk upload parsing (workbook reading), user sign-in and password flows.
- **Coverage by function:** 97 of 119 database functions run; 19 of the 22 left are inlined one-line SQL functions; 3 are real gaps (SCAN-P10-09). All 34 tables and 12 views are mentioned in at least one suite except the three deprecated BMR tables and the `current_qc_approvals` view.
- **Policies:** 93 row-level policies; the security suites (sb, a0086, sec04) exercise the read and write paths role by role, but there is no table of "role by table by action" checked against the policy list, so a policy added later is not compared with the screens' `MODULE_WRITE_ROLES`.

## Checked and found sound (P10.3)

- The database suites are fast (about 20 seconds), self-contained (a fresh Postgres built from `fresh-install.sql`, one copy per suite) and compared with an expected count per suite, so a changed result shows as DIFF.
- `fresh-install.sql` builds cleanly from all 108 migrations on the test server, so the second environment (B40) can start from it.
- The test runner restores the production time zone per suite (a trap migration 0081 created) and its documentation says so.
- Most recent migrations (0085 onward) shipped with a suite and an expected line; the few without their own (0089, 0092 to 0095, 0097, 0098, 0103) are small and are exercised by the packaging, last-admin, expiry and company-settings suites.

## Areas read (P10.3)

`package.json`, `supabase/tests/*.sql` and `expected.txt`, `scripts/dev/run-tests.sh`, the function and table lists of the database, `.github` (absent); a tracked run of all 26 suites (copies of the runner in the working folder: `run-tests-cov.sh`).
