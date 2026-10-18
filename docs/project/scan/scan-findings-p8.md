---
title: Scan findings — Phase 8 (supporting modules)
---

# Phase 8 — Supporting modules

Steps done: P8.1, P8.2, P8.3, P8.4 (phase complete). Next: P9.1. (Rewritten whole after every step.)

## Findings

### SCAN-P8-01 — Equipment: the calibration status is typed separately from the dates, the dates are hidden, and nothing marks an instrument as overdue
- Severity: Medium
- Kind: Gap (record can disagree with itself; screen-only rules)
- Where: `lib/actions/equipment.ts`, `equipment-table.tsx`, `equipment/[id]/page.tsx`, `equipment` table (0034, 0086)
- Finding: Each instrument has a status (Calibrated, Due for calibration, Not applicable) and two dates (last calibration, next due). The status is a free choice and nothing links it to the dates: an instrument can stay "Calibrated" with a due date two years ago. The list, its Excel file and the page that every non-editing user sees show only the status, never the dates (and the read-only page prints the raw code, "not_applicable"); the dates are visible only inside the edit form, to the roles that can edit. No row is marked overdue, nothing on the Dashboard warns, and only the latest dates are kept (each calibration overwrites the last). The rules from 3 Oct (no calibration in the future; next due after the last calibration) are in the save action only: saved directly, an instrument "Calibrated" on 10 Jan 2020 with next due 10 Jan 2021 (ALLOWED), a next due date earlier than the last calibration (ALLOWED), a calibration dated in 2031 (ALLOWED) and a quantity of 2.5 (ALLOWED) all went in. An auditor reading the register sees "Calibrated" for instruments that are overdue.
- Evidence: Local database, `claude/scan-evidence-p8.sql` (reproduction block); live read-only checks 1 and 2 in the same file count the overdue ones.
- Suggested fix: Show Last calibration, Next due and a computed status ("Overdue by N days" in red, "Due in N days" within 30) in the list, the Excel file and the read-only page; keep the typed status only for Not applicable, or compute it; repeat the date rules and a whole-number quantity in a table check; add an equipment-due card to the Dashboard (the larger calibration programme is P9.1). Size S to M.
- Needs decision from Ravi: Yes. Should the status be computed from the dates?
- Confidence: Confirmed (code and local database)
- Status: New

### SCAN-P8-02 — Dead Stock Register: rejected, balance and value figures are typed by hand and need not agree, and the date rules are on the screen only
- Severity: Low
- Kind: Gap (consistency rules)
- Where: `lib/actions/dead-stock.ts`, `dead-stock-table.tsx`, `dead_stock_items` (0035, 0086)
- Finding: Ravi chose on 13 Sept that balance quantity and value are plain typed fields, not worked out. Nothing checks them against each other, so a register can say quantity 4, rejected 10, balance 100 and balance value 5; saved directly that row went in (ALLOWED), and the screen action has no rule either (rejected quantity is only checked as not negative). The balance figures should reconcile with quantity less rejected, and balance value with balance quantity times the depreciated value. The 3 Oct date rules (no future date, resolution not before purchase) are also only in the action: a chair bought in 2030 and resolved in 2020 was saved directly (ALLOWED). The list and its Excel file show purchase, depreciation and balance but not rejected quantity, rejected value, resolution date or remark, so the reasons for a balance cannot be read from the register. Depreciation is a single percentage (25 by default) with no age in it: an asset bought in 2019 is worth the same as one bought last month. That follows the original spreadsheet, but is worth confirming.
- Evidence: Local database, `claude/scan-evidence-p8.sql`; live check 3 lists rows whose figures disagree.
- Suggested fix: Warn on the screen (not block) when rejected exceeds quantity or the balance does not equal quantity less rejected, or fill the balance in by default and let it be overtyped; add the date checks as table checks; add Rejected qty, Rejected value, Resolution date and Remark to the list and the Excel. Size S.
- Needs decision from Ravi: Yes (small). Keep balance typed by hand, or fill it in? Should depreciation run with age?
- Confidence: Confirmed (code and local database)
- Status: New

### SCAN-P8-03 — An equipment or dead stock record that has been made inactive disappears from the screen and cannot be found again
- Severity: Low
- Kind: Gap
- Where: `equipment/page.tsx` and `dead-stock/page.tsx` (both read `active = true` only), the edit forms (an "Active" tick)
- Finding: Unticking Active on an instrument (sold, scrapped) or an asset removes it from the list, from the search and from the Excel file; there is no "Show inactive" switch. The record still opens at its address, but nobody can reach that, so a mistaken deactivation cannot be undone from the screens, and the register cannot show the retired items for the year. The same pattern exists for vendors (SCAN-P2-04, the other way round).
- Evidence: Code read. Live check 4 counts inactive records.
- Suggested fix: A "Show inactive" tick on both lists (default off) with a grey "Inactive" tag, included in the Excel file as a Status column. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P8-04 — Line Clearance is a note, not a control: the batch is free text, nothing checks it, and starting a batch does not need a "Clear" check
- Severity: Low (first rated Medium; lowered in P8.4 because the menu has labelled this screen Deprecated since 22 Sept)
- Kind: Gap (GMP control)
- Where: `lib/actions/line-clearance.ts`, `line-clearance-form.tsx`, `line_clearance_checks` (0001), batch start in `lib/actions/finished-product.ts` and the production batch actions
- Finding: A check stores an area, an optional batch reference typed as free text (hint says "e.g. FP-0012"), Clear or Not clear, and who and when. The batch reference is not tied to any batch: saved directly, "NO-SUCH-BATCH" went in (ALLOWED). Nothing reads these records afterwards: creating a Draft FP batch, Create Batch, starting a Production RM batch or recording a packaging issue never looks for a Clear check, and a "Not clear" result does not stop anything. There is no second-person sign-off and no tick list of what was cleared (previous batch removed, labels, residues), so the record is a log entry rather than the clearance that GMP expects between batches.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-C); code search found no reader of `line_clearance_checks` outside its own list.
- Suggested fix: (1) Make the batch field a pick-list of open batches (FP, Production RM, packaging issue) and store its id; (2) show the latest clearance for the batch on the batch page and warn (not block, at first) when starting without a Clear check, or with the latest being Not clear; (3) later: a small checklist and a second signature. Size M for 1 and 2.
- Needs decision from Ravi: Yes. The menu calls this screen "Line Clearance- Deprecated" (22 Sept, "unlikely to be used"). Retire it, or make it a real control (warn or block when a batch starts without a Clear check; checklist; second signature)? If it stays unused, nothing here needs doing; the P9.1 row on batch release and line clearance is the real question.
- Confidence: Confirmed (code and local database)
- Status: New (carried into P9.1 as the batch release / line clearance row)

### SCAN-P8-05 — Environmental readings: an empty reading can be saved, and impossible values (9999 °C, -50 %RH, Infinity) are accepted
- Severity: Low
- Kind: Gap (input checks)
- Where: `lib/actions/environmental-control.ts`, `environmental-control-form.tsx`, `environmental_control_readings` (0001)
- Finding: Temperature and humidity are both optional, so a reading with an area and neither number saves (screen and database). Beyond that the only check is "is a number": 9999 °C, humidity -50 and "Infinity" all went in directly (ALLOWED). The acceptable-range and excursion flag is already parked as C9 and needs area ranges first; this finding is the smaller step that does not need ranges: at least one value required, and plausible limits so a typing slip (250 for 25.0) is stopped.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-B).
- Suggested fix: Require at least one of the two; humidity 0 to 100; temperature within a wide sanity band (for example -40 to 80); repeat as table checks. Size S.
- Needs decision from Ravi: No (the band is a typing guard, not an acceptance limit).
- Confidence: Confirmed (code and local database)
- Status: New (related to C9, which is the acceptance-range work)

### SCAN-P8-06 — SOP / STP Documents: an old revision cannot be retired, the same title and revision can be added twice, and a link can be swapped in place under the same revision
- Severity: Low
- Kind: Gap (document control; overlaps B13)
- Where: `lib/actions/documents.ts`, `documents-table.tsx`, `documents` (0001, 0086), `docs/modules/documents.md`
- Finding: The module note says a revision is a new row at a higher number. In practice the list shows every active row, so SOP-X rev 0 and rev 1 both sit on the list with no "current" marker, and the screens have no way to untick Active, edit or delete a row (the database allows Quality Checker and QC Reviewer to update any row, and System Admin to delete). Two rows with the same title and revision are accepted (ALLOWED). A direct update changes the file link under the same title and revision (ALLOWED), so "rev 2" can point to different content tomorrow; only the audit trail shows it. The full workflow (approval, effective date control, obsolete) is B13; this is the small part that is wrong even for a plain register.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-A).
- Suggested fix: Unique (title, doc type, revision); an "Obsolete" action that sets Active off and a Superseded-by note; show only the highest active revision by default with a "Show all revisions" switch; block changing the link or revision after creation except by System Admin (or make the row read-only). Size S to M.
- Needs decision from Ravi: Yes (small). Is the SOP screen going to be used before the B13 workflow is built?
- Confidence: Confirmed (code and local database)
- Status: New (overlaps B13; D4 says the export needs no action, which is not repeated here)

### SCAN-P8-07 — Document revision, link and date checks are on the screen only; a revision of 1.5 silently becomes 2
- Severity: Low
- Kind: Integrity (screen-only rules)
- Where: `lib/actions/documents.ts` (revision read with `Number()`, NaN check only), `documents` table
- Finding: The form asks for a whole number of 0 or more, but the action only rejects "not a number" and the table has no check. Saved directly, revision -3 went in (ALLOWED), revision 1.5 was stored as 2 (the integer column rounds it without error), a link of "javascript:alert(1)" or just "x" was accepted, and an effective date of 1900-01-01 was accepted. A displayed link of that kind is blocked by the browser, so this is not a security hole (SEC-05 is accepted); the point is that the register can hold a wrong revision without telling anyone.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-A).
- Suggested fix: In the action, require a whole number of 0 or more and a link that starts with http:// or https://; add `check (revision_number >= 0)` and a `file_url ~* '^https?://'` check as a not-valid constraint. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code and local database)
- Status: New (SEC-05 / C5 stay parked; this covers the revision and date part)

### SCAN-P8-08 — Time stamps on Line Clearance, Environmental readings and Documents can be set by the person saving them
- Severity: Low
- Kind: Integrity
- Where: `line_clearance_checks.checked_at`, `environmental_control_readings.recorded_at`, `documents.effective_date` (columns have a default but accept a typed value)
- Finding: The screens never send a time, but a direct call can: a clearance dated 2020-01-01 and readings dated 2020-01-01 and 2031-01-01 were all accepted (ALLOWED). The name on these records being client-settable is already SCAN-P1-09 (High); this adds the time. The audit trail records the true database time, so a back-dated entry would show up there, but the register itself and its list would show the typed time.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-B and C).
- Suggested fix: Stamp `checked_at` and `recorded_at` with now() in the same before-insert trigger that will stamp the user for SCAN-P1-09 (one change covers both). The wider question of which other tables allow a typed system time is checked in P10.2. Size S (with P1-09).
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P8-09 — Line Clearance and Environmental lists leave out who recorded the entry, cannot be downloaded, and a wrong entry has no correction path
- Severity: Low
- Kind: Enhancement / gap
- Where: `line-clearance-table.tsx`, `environmental-control-table.tsx`, `line-clearance/page.tsx`, `environmental-control/page.tsx`, policies lc_/ec_ (insert and select only)
- Finding: Both lists omit the person (`checked_by`, `recorded_by` are stored but not read by the page). Line Clearance shows the date only, not the time, although many checks fall on the same day. Neither list has an Excel or PDF button (Documents was decided in D4; these two were not). The tables have no update or delete rule, so a wrong entry (wrong area, a decimal slip) can never be edited or marked wrong: update and delete both affected 0 rows in the test. For a GMP log that is correct in principle (no silent edits), but there is no "entered in error" path with a reason, so mistakes stay in the log as true.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.2-D); `exportConfig` is not passed by either table.
- Suggested fix: Add "Recorded by" (name) and the time to both lists; add Excel and PDF; add a "Mark as entered in error" action (reason required, record kept and struck through, original not changed). Size M together.
- Needs decision from Ravi: Yes (small). Is an "entered in error" path wanted, or is a new correcting entry enough?
- Confidence: Confirmed (code and local database)
- Status: New

### SCAN-P8-10 — Feedback tickets: a tester can write the admin's "Response", category, dates and name on their own ticket, and the ticket number and text size are not controlled
- Severity: Low
- Kind: Integrity (rules in the app only)
- Where: `page_feedback` policies (0004, 0017: `page_feedback_owner_update`, `page_feedback_insert`), trigger `trg_00_feedback_submitter_name` (0086, insert only), `lib/actions/feedback.ts`
- Finding: The owner rule limits which rows a tester can change (own, status "new") but not which columns. Directly, a tester set `category` = invalid, `claude_notes` = "Fixed in last release", `created_at` = 2020 and `submitted_by_name` = "The Managing Director" on their own new ticket (all ALLOWED); other testers then see that text on the page as "Response:", looking like the administrator's reply. The name is stamped correctly on insert (a typed name is replaced by the real one), but the stamp does not run on update. The tester can still not set the status (refused). On insert a typed ticket number (FB-9999) and a 2 MB text were accepted; the screen only checks a 5-character minimum and has no upper limit. The page path sent by the browser is passed to cache refresh unchecked. Use of ticket numbers by anyone with the public key is already SCAN-P1-10.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.3-A, user = Quality Checker).
- Suggested fix: A before-update trigger that, for anyone who is not System Admin, restores `category`, `claude_notes`, `status`, `resolved_at`, `created_at`, `ticket_number` and `submitted_by_name`; make the insert trigger also stamp the ticket number; a text limit (say 4,000 characters) in the form and as a table check. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P8-11 — Feedback: every save by the administrator re-stamps the "resolved" time, and the widget and admin list say "nothing here" when the read failed
- Severity: Low
- Kind: Bug (small) / Gap
- Where: `triageFeedback` (resolved time set to the current time whenever the status is Implemented or Rejected), `listPageFeedback`, `listAllFeedback` (return an empty list on any error), `feedback-admin-list.tsx`
- Finding: Saving a ticket that is already Implemented (for example to correct the reply text) writes a new resolved time, so the first resolution time is lost (the audit trail still holds it). Changing Rejected to Implemented does the same. Both list functions return `[]` when the read fails, so the widget says "No feedback recorded for this page yet." and the admin page says "No feedback in this category." although the real cause was a failed read (the same family as SCAN-P7-17). The administrator list has no search, no filter by page and no paging: every ticket is a full form, so it grows with the ticket count (51 live tickets on 3 Oct 2026, fine today).
- Evidence: Code read (`lib/actions/feedback.ts` triage update; `if (error) return []` twice).
- Suggested fix: Set the resolved time only when the status changes into Implemented/Rejected (keep it otherwise); return the error to the caller and show "Couldn't load feedback"; add a search box and a Page filter to the administrator list. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P8-12 — Audit Log is hard to read: the list says "3 fields changed" without naming them, and the detail page shows column names and long ids instead of words
- Severity: Low
- Kind: Enhancement
- Where: `app/(dashboard)/audit/audit-diff.ts` (`summarizeChange`, `displayValue`), `audit/[id]/page.tsx`, the Excel file from `audit-table.tsx`
- Finding: Except for a status change, the "What changed" column shows only a count. The detail page lists raw column names (`checker_by`, `item_id`, `purchase_line_id`) and the values are ids, so an auditor must look every person, item and batch up by hand; the Excel file carries the same one-line summary with no before and after values. This sits on top of SCAN-P1-15 (500-row cap and missing filters); fixing that and not this still leaves the log slow to read.
- Evidence: Code read; `summarizeChange` returns `"${n} fields changed"`; `displayValue` is `String(v)`.
- Suggested fix: Name up to three changed fields in the list ("quantity 10 → 12, unit"); on the detail page show friendly field names and resolve person, item, vendor and batch ids to names (one lookup per page); add Before and After columns to the Excel file. Size M.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P8-13 — Setup notes are out of date (README, SUPABASE_SETUP, seed script) and a few leftovers remain; anyone building a second environment by following them would fail
- Severity: Low
- Kind: Documentation / leftovers
- Where: `README.md`, `docs/SUPABASE_SETUP.md`, `scripts/seed-admin.ts` (message text), `supabase/README.md`, `public/*.svg`, `lib/actions/auth.ts`, `lib/pdf.ts`, `lib/company.ts`, `lib/auth/session.ts`, `lib/bulk-upload/parse.ts`, `lib/constants/units.ts`
- Finding: The README and `docs/SUPABASE_SETUP.md` still say to apply "the three migrations 0001 to 0003", to copy `.env.example` (the file is not in the repository) and to "register an account at /register" (closed since 28 Sept 2026). `supabase/README.md` is the correct one (single `fresh-install.sql`, sign-up switched off, minimum password length 10, the three Vercel variables) but still says migrations run "0001 … 0087" (now 0108) and has not been checked against the E-series environments plan (B40). The seed script's error text still says to "register the account first". Leftovers: five unused sample pictures from the project template (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`); six exported items used nowhere (`PDF_BRAND`, `companyNameAndAddress`, `requireColumns`, `ItemCategory`, `hasAnyRole`, and the `signUp` stub, which only returns "Self-registration is disabled"). The code is otherwise clean: the only TODO in the project is the BMR "remove later" marker.
- Evidence: Search of `app`, `lib`, `components` for exported names used once; file listing of the repository root; text of the three documents.
- Suggested fix: Replace the README setup section with a pointer to `supabase/README.md` and add `.env.example` with the three variable names (no values); update the migration range wording to "see the migrations folder"; fix the seed-script message; delete the five SVGs and the six unused exports. Size S. Do this before the second environment (B40) is built.
- Needs decision from Ravi: No.
- Confidence: Confirmed (files read)
- Status: New (B40 environments plan depends on correct setup notes)

### SCAN-P8-14 — Deprecated Batch Mfg. Record: nothing locks a record after approval, one administrator can do all three sign-offs, and four roles can still write to it directly
- Severity: Low
- Kind: Integrity (module marked for removal)
- Where: `lib/actions/bmr.ts` (`signOffStep`, admin-only), `bmr_records`, `bmr_weighment_lines`, `bmr_observations` (policies `bmr_write`, `bmr_wl_write`, `bmr_obs_write`, "for all" for Admin, MFR Manager, Quality Checker, QC Reviewer; 0001, left untouched in 0086)
- Finding: After a record is approved, a new observation could still be added, the approver and approval time were rewritten and the earlier "prepared" and "checked" marks were cleared, all by a Quality Checker calling the database directly (ALLOWED; deleting the approved record was refused). On the screen only System Admin can use the module, and the same administrator can press Prepared, Checked and Approved in turn: no different-person rule. The weighment-line check that the batch is QC Approved is the only guard (and is sound). Ravi moved the module to Admin on 16 Sept with "we will later remove this"; the live replacement is the stateless BMR Word download on the Finished Product page. If the module is removed soon none of this needs fixing; if any real BMR record exists, it is not tamper-proof.
- Evidence: Local database `claude/scan-evidence-p8.sql` (section P8.4-A); live check 9 counts existing records.
- Suggested fix: Decide on the removal date. Until then: do nothing if live check 9 shows no records; otherwise export them, then remove the three policies' write rights (read stays) so the records become read-only. Removal itself (screens, actions, nav entry, audit labels, purge list, three tables) is Size M and needs one migration plus a test suite change.
- Needs decision from Ravi: Yes. Remove the module now, or keep it read-only until a date?
- Confidence: Confirmed (code and local database)
- Status: New

## Carried to later steps

- Calibration programme (schedule, certificate numbers, who calibrated, history of calibrations, due alerts) (→ P9.1).
- Print / download / export events are not in the audit trail (by design, P1.6); decide in P9 whether a QC or batch printout needs a log. Access log for the Audit screen itself is SCAN-P1-16.
- Batch record content (weighed quantity, dispenser, verifier, equipment used, yield reconciliation) is not captured anywhere now that BMR is deprecated (→ P9.1, batch release / batch record row).
- Batch release, line clearance gate and checklist, environmental acceptance ranges, SOP approval / obsolete workflow, training on SOPs (→ P9.1).
- Dead stock disposal approval (who authorised a write-off) and the asset life cycle (→ P9.1).
- Two people saving a SOP with the same title and revision at the same moment (→ P10.1, goes away with a unique rule).
- Duplicate checks on Asset ID and article name are in the action only, by Ravi's decision (14 Sept); no change proposed (→ P10.1 for the race between two saves).

## P8.1 — Equipment and dead stock

- Equipment: code generated on create (EQ-nnnn), name, room, section, asset ID (unique when given, app check), quantity, calibration status and two dates, active tick; list with Excel; edit and admin-only delete.
- Dead stock: code DS-nnnn, article, purchase date and price per unit, depreciation percentage (one flat figure), resolution date, rejected and balance fields typed by hand, remark; list with Excel; edit and admin-only delete.
- Problems: SCAN-P8-01 to 03.

## Checked and found sound (P8.1)

- Roles: equipment can be changed by Admin, Inventory Manager, MFR Manager, Quality Checker and QC Reviewer; dead stock by its listed roles; delete is System Admin only, in the action and in the database rules.
- The depreciated value per unit is worked out by the database from price and percentage (price × (100 − %) ÷ 100, to two decimals), so the screen cannot differ from it.
- Negative amounts, a zero quantity, a depreciation over 100 and a negative balance are refused by table checks; codes come from a sequence and are unique.
- The Asset ID and article-name duplicate checks ignore case and treat % and _ literally; a record can be saved without changing its own name or ID.
- Lists are paged past the 1,000-row cap with a unique order and show a visible error line if the read fails.

## Areas read (P8.1)

`lib/actions/equipment.ts`, `lib/actions/dead-stock.ts`, `equipment/page.tsx`, `equipment-table.tsx`, `equipment/[id]/page.tsx`, `dead-stock/page.tsx`, `dead-stock-table.tsx`, migrations 0034, 0035, 0086 (A8 checks); own test on `scanp6` (`p81_equip_dead.sql`).

## P8.2 — Documents (SOP / STP), environmental control, line clearance

- Documents: type SOP or STP, title, revision number, a web link (no upload), optional effective date; list shows active rows by title; add only (no edit, no retire, no delete from the screen).
- Environmental Control: area, temperature, humidity; recorded by and at stamped by the action; list with search; add only.
- Line Clearance: area, free-text batch reference, Clear or Not clear; checked by and at; list with search; add only.
- Problems: SCAN-P8-04 to 09. Note (P8.4): the menu shows Line Clearance and Environmental Control as "- Deprecated" under Admin since 22 Sept 2026, so P8-04, P8-05, P8-08 and P8-09 matter only if Ravi keeps those screens.

## Checked and found sound (P8.2)

- Roles: Documents add/edit by Admin, Quality Checker and QC Reviewer, delete Admin only (0086); Line Clearance and Environmental by Admin, Quality Checker, QC Reviewer and MFR Manager; reading is open to every signed-in user.
- All three tables are in the audit trail (0072): every insert and update is kept with the old and new row.
- Entries cannot be edited or deleted through the API for the two log tables (update and delete returned 0 rows), so there is no silent change of a past reading or clearance.
- Success messages, the "?created=1" banner and paging past 1,000 rows are in place; the document link opens with `rel="noopener noreferrer"`, and React refuses a `javascript:` link, so the stored value cannot run.
- The screen refuses an empty area, a non-number temperature or humidity, an empty title or link, and an unknown type or status.

## Areas read (P8.2)

`lib/actions/documents.ts`, `environmental-control.ts`, `line-clearance.ts`, the three pages, forms and tables, `docs/modules/documents.md`, `environmental-control.md`, migrations 0001 (policies), 0072, 0086 (A7); own test on `scanx` (`p82_docs_env_lc.sql`, `p82_b.sql`, rolled back).

## P8.3 — Feedback widget and audit screen

- Feedback: a panel at the foot of every page lists the tickets for that page and takes a new one (5 characters minimum); a tester can edit or delete their own ticket while it is "new"; System Admin triages on `/feedback` (category, status, reply).
- Audit Log: System Admin and Super Auditor only; newest 500 entries, filters for table and dates, client search, Excel, a detail page with before and after.
- Problems: SCAN-P8-10 to 12. The 500-row cap, missing filters, missing four tables, sign-in log and the "via" marker were already recorded in P1 (SCAN-P1-15 to 17) and are not repeated.

## Checked and found sound (P8.3)

- A tester cannot change the status of their own ticket (refused by the owner rule), cannot edit or delete once it is triaged, and cannot touch other people's tickets; only System Admin can triage or delete (tested).
- Edits and deletes of feedback are in the audit trail, so a removed ticket still leaves its text there.
- The Audit Log page checks the role on the list and the detail page; the Table filter accepts only listed names and the dates only a strict pattern; a non-existent entry gives a not-found page; raw JSON is shown as text.
- The audit entry for a user account never stores the password hash (only a "password changed" flag), by design in 0072.
- Delete and truncate entries are shown with their own wording ("Record deleted", "Table emptied").

## Areas read (P8.3)

`lib/actions/feedback.ts`, `components/feedback/page-feedback.tsx`, `feedback/page.tsx`, `feedback-admin-list.tsx`, `feedback-row.tsx`, `audit/page.tsx`, `audit-table.tsx`, `audit-filters.tsx`, `audit-diff.ts`, `audit/[id]/page.tsx`, migrations 0004, 0005, 0017, 0072; own test on `scanx` (`p83_feedback.sql`, rolled back).

## P8.4 — Deprecated BMR and leftovers

- BMR (Admin, "Deprecated"): record per FP batch, weighment lines (only QC Approved batches), observations, Prepared / Checked / Approved marks; screen is System Admin only. The Word download on the Finished Product page is separate and stays.
- Leftovers: one TODO in the whole project (the BMR removal marker), six unused exports, five unused template pictures, stale set-up notes, 28 database test suites for 108 migrations (coverage is P10.3).
- Problems: SCAN-P8-13 and 14.

## Checked and found sound (P8.4)

- The weighment-line QC gate stands: a batch that is not QC Approved cannot be added (database trigger), and the screen translates the error.
- A second BMR for the same FP batch is refused (unique rule) with a readable message.
- The sign-off order (Prepared, then Checked, then Approved) is enforced in the action, and a step cannot be marked twice.
- The project is clean of dead code: six unused exports in about 35,600 lines; the only TODO is the planned BMR removal; no commented-out blocks of code were found in the files read; the `signUp` stub refuses and creates nothing.
- `scripts/seed-admin.ts` needs the service key from the environment and does not hold any secret.

## Areas read (P8.4)

`lib/actions/bmr.ts`, `admin/bmr-deprecated/page.tsx` (header comments), `nav.ts` (Admin group), `lib/constants/roles.ts`, `lib/actions/auth.ts`, `README.md`, `docs/SUPABASE_SETUP.md`, `supabase/README.md`, `scripts/seed-admin.ts`, `public/`, migrations 0001 (BMR policies), 0086; an export-usage search over `app`, `lib`, `components`; own test on `scanx` (`p84_bmr.sql`, rolled back).

## Phase 8 summary

14 findings: 0 High · 1 Medium (P8-01 equipment calibration) · 13 Low. Added to the master list Part 1F as rows SCAN-P8-01 to 14. Existing items touched: C9 (environmental ranges), B13 (SOP workflow), C5 (document links), D4 (documents export), B40 (environments).
