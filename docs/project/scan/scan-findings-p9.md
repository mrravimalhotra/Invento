---
title: Scan findings — Phase 9 (missing functionality for a regulated plant)
---

# Phase 9 — Missing functionality for a regulated plant

Steps done: P9.1, P9.2 (phase complete). Next: P10.1. (Rewritten whole after every step.)

How to read this phase: P9.1 compares the app with the records and controls a GMP-regulated Ayurvedic maker is normally expected to keep. It is the common GMP set, **not a legal opinion**: the rule book that applies to an Ayurvedic product maker (as I understand it, Schedule T of the Drugs and Cosmetics Rules, not Schedule M) and any licence conditions should be confirmed with Atharva's regulatory adviser. Items already on the master list are only referenced, never re-counted. Nothing in this phase is a defect in what exists; the entries are things that do not exist yet. Ravi's earlier scoping (the app is for inventory, QC and manufacturing; sales, payroll and staff are out of scope: B6, B7, D22) is respected, so some "Missing" rows are marked as a scope question.

## Findings

### SCAN-P9-01 — There is no place for quality events: deviations, out-of-specification results, change control, CAPA, complaints and self-inspection
- Severity: Medium
- Kind: Missing functionality (quality system)
- Where: nowhere in the app (no table, screen or action; a search for deviation, OOS, change control, CAPA and complaint finds no records, only the word in code comments)
- Finding: When something goes wrong in a batch (a step missed, a result outside the specification, a spillage), when a formula, specification or procedure is changed, when a customer complains, or when an inspection finds a problem, the app has no record to open, investigate, approve and close. What exists is indirect: a QC rejection (with no reason, SCAN-P4-01), the audit trail (what changed, not why), the MFR version number, and a log of tester feedback. Because QC results are not recorded before approval (SCAN-P4-11), an out-of-specification result cannot even be detected by the app. A regulator or customer auditor normally asks for these records first.
- Evidence: Code and migration search; `claude/scan-evidence-p9.sql` section P9-A lists every table, none of which holds such records.
- Suggested fix: One small "Quality event" register (type: deviation, OOS, change, complaint, audit finding; linked batch / item / document; description; impact; investigation; action; owner; due date; closed by, closed on; reviewer sign-off), with a reminder card on the Dashboard for open and overdue events and a link from the QC rejection screen. Build the register first, workflows later. Size L for the register with links; the different event types share the same table.
- Needs decision from Ravi: Yes. Are these kept on paper by design, or should the app hold them? If on paper, the finding closes as "accepted".
- Confidence: Confirmed (code and database)
- Status: New

### SCAN-P9-02 — Supplier approval and the goods-received record are thin: vendors carry contact details only, and a receipt does not capture the supplier's own batch, manufacturer, manufacture date or condition of goods
- Severity: Medium
- Kind: Missing functionality
- Where: `vendors` (code, name, address, phones, e-mail, active), `purchase_orders` (invoice number and date), `purchase_lines` (internal batch number is generated, quantity, unit, sample quantities, price, GST; the expiry date is not typed at receipt, the QC reviewer sets it), `app/(dashboard)/vendors`, `purchase`
- Finding: A vendor has no approval status, no licence or GST/FSSAI number, no date of qualification or last audit, and a purchase order can be raised to any active vendor. A receipt line stores an internally generated batch number but not the supplier's batch or lot number, the manufacturer (often different from the trader), the manufacturing date, number and condition of containers, damage or seal check, or the supplier's certificate reference. For herbal raw material, traceability back to the supplier's lot and the identity checks done on arrival are standard questions, and a recall to a supplier needs the supplier's lot number.
- Evidence: Column lists of `vendors`, `purchase_orders`, `purchase_lines` (`claude/scan-evidence-p9.sql` section P9-B).
- Suggested fix: Add to the vendor: approval status (Approved / On hold / Not approved), licence numbers, qualified-on and review-due dates; warn when a PO is raised to a vendor that is not Approved. Add to the receipt line: supplier batch/lot, manufacturer, manufacturing date, containers received and condition (OK / damaged), supplier certificate reference, all optional at first and printable on the Under Test label. Size M for both, with one migration.
- Needs decision from Ravi: Yes. Which fields are wanted, and should a non-approved vendor be blocked or only warned?
- Confidence: Confirmed (code and database)
- Status: New (related to B21 packaging control sample; SCAN-P4-14 receipt date on the label)

### SCAN-P9-03 — Batch release rests on QC approval alone: there is no signed batch record to review (weighed quantities, who weighed and checked, equipment used, start and end times) and no release checklist
- Severity: Medium
- Kind: Missing functionality (decision first)
- Where: `finished_product_batches` (statuses: draft, in_process, complete_awaiting_qc, submitted_to_qc, approved, rejected, cancelled), Batch Mfg. Record (deprecated), the Word batch record download on the Finished Product page (`bmr-docx.ts`), `quality_checks`
- Finding: A finished-product batch is released when QC Round 2 approves it. The app holds the quantities drawn from stock and the yield, but not what a batch record normally proves: the weighed quantity of each material against the standard, who weighed it and who verified, the equipment used, step times, in-process readings and the signed line clearance. The electronic BMR that held part of this was moved to Admin and marked for removal (16 Sept); the Word download prints the raw materials drawn from store with a "Checked By" column and a "Production Chemist - Date & Sign" line, to be completed by hand, and nothing in the app records that the paper was completed and reviewed. The reviewer approves without any prompt to confirm that the record is complete, that line clearance was done (SCAN-P8-04), or that no deviation is open (SCAN-P9-01). This is a decision rather than a defect: paper batch records are legitimate if that is how the plant works.
- Evidence: Status constraint on `finished_product_batches`; `bmr_*` screens are Admin only; no code reads `line_clearance_checks` (P8.2).
- Suggested fix: Decide paper or electronic. If paper stays: add a "Batch record reviewed" tick with reviewer and date on the Round 2 screen, and show open quality events and the latest line clearance on that screen. If electronic: a Batch Record on each FP batch with weighment lines (planned, actual, weighed by, checked by), equipment used, step times and signatures, locked on approval. Size S for the tick and links; L for the electronic record.
- Needs decision from Ravi: Yes. Paper or electronic batch records?
- Confidence: Confirmed (code); the "paper in use" part is an assumption to confirm
- Status: New (carries the P8.4 note on BMR content)

### SCAN-P9-04 — Returns and rework are not recorded: a rejected material has no return-to-vendor or destruction record, and a finished-product batch has no reprocessing path
- Severity: Low
- Kind: Missing functionality
- Where: Inventory → Rejected Materials (a read-only list of rejected batches, 0104), `finished_product_batches.status = 'rejected'`, `lib/actions/inventory.ts` (write-off of purchased batches only, SCAN-P3-07)
- Finding: Once QC rejects a raw-material batch it is listed, and the stock sits there. Nothing records what happened next (returned to the vendor with a debit note, destroyed with a witness, or kept in a rejected area). A rejected finished-product batch is final (SCAN-P5-04); there is no way to record reprocessing or blending and no link from a reworked batch back to the original. A search for return and rework finds nothing.
- Evidence: Code search; `claude/scan-evidence-p9.sql` section P9-A.
- Suggested fix: A disposition on a rejected batch (Returned to vendor, Destroyed, Held), with date, reference and who; for finished product, decide first whether reprocessing is allowed at all. Size S for the disposition; M for rework.
- Needs decision from Ravi: Yes (small). Is reprocessing of finished product done at the plant?
- Confidence: Confirmed (code)
- Status: New (overlaps SCAN-P3-07 and SCAN-P5-04 on the stock side)

### SCAN-P9-05 — The Retained Samples tab shows which samples should exist but not where they are, when they may be discarded, or what happened to them
- Severity: Low
- Kind: Missing functionality (small)
- Where: Inventory → Retained Samples (view `retained_samples`, 0108), `quality_checks.sample_qty`
- Finding: The tab lists each batch with a QC, Stability or R&D sample and the quantity. It has no storage location, no retention-until date (normally batch expiry plus a period), no "consumed in test / discarded on <date> by <person>" record, and no way to mark a sample as destroyed, so the list only grows. An auditor asking "show me the retained sample for batch X" gets a quantity, not a location.
- Evidence: View definition in `0108`; page `inventory/(tabs)/retained-samples`.
- Suggested fix: Add location (text), retain-until (default expiry + a setting), and a disposal record (date, person, reason); show a "can be discarded" filter. Size S.
- Needs decision from Ravi: Yes (small). Retention period rule?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P9-06 — Printing and downloading labels, certificates and batch records is not logged, and there is no label issue and reconciliation record
- Severity: Low
- Kind: Missing functionality
- Where: `app/(dashboard)/labels`, `coa`, `finished-product/[id]` (BMR download), `lib/pdf.ts`; audit trail design (P1.6: reads, exports and printing are not recorded by design)
- Finding: Any label, COA, intimation or batch record can be printed or downloaded any number of times; the app does not record who, when or how many. Re-downloaded old documents also reprint today's company name (SCAN-P2-13). There is no record of labels issued to a batch against labels used, spoiled and returned, which is a standard packaging reconciliation.
- Evidence: Code read; P1.6 note.
- Suggested fix: A small `document_prints` log (what, which record, who, when) written when a PDF is produced, and a printed-copy counter on the label screen; label reconciliation only if Ravi wants it. Size S for the log.
- Needs decision from Ravi: Yes (small). Is a print log wanted?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P9-07 — Alerts exist only as Dashboard cards; nobody is told by e-mail or phone when a retest, expiry, calibration or QC decision is due
- Severity: Low
- Kind: Missing functionality
- Where: `app/(dashboard)/dashboard-alerts.ts`, `dashboard-view.tsx`, `lib/actions/auth.ts` (the only e-mail the app causes is Supabase's reset mail, SCAN-P1-06)
- Finding: The Dashboard shows retest-due, expiry, QC-pending and low-stock cards, but the person must open the page, and a batch falls off the retest/expiry cards the day after the date passes (SCAN-P4-05). Ravi's FP stability reminder (B44, 3, 6, 9 and 12 months with 15 days' notice) and the calibration due dates (P8-01) have nowhere to be delivered. No e-mail or WhatsApp sending exists (no mail provider, no scheduled job).
- Evidence: Code search for mail and messaging libraries finds none; `package.json` has no mailer.
- Suggested fix: One scheduled job (Supabase scheduled function or Vercel cron) that builds a daily digest per role (retest due in 15 days, expired, calibration due, open quality events, QC waiting more than N days) and sends it by e-mail through a real SMTP provider (same provider as SCAN-P1-06). WhatsApp only if Ravi supplies a provider. Size M.
- Needs decision from Ravi: Yes. E-mail digest, WhatsApp, or dashboard only?
- Confidence: Confirmed (code)
- Status: New (carries B44 and SCAN-P1-06)

### SCAN-P9-08 — No training records: nothing shows that staff have read the SOPs they work to
- Severity: Low
- Kind: Missing functionality
- Where: no table or screen; `documents` register (SCAN-P8-06), staff information is out of scope (B7)
- Finding: GMP expects a record that each person was trained on the procedures that apply to their job, with the date, trainer and assessment, refreshed when a procedure is revised. The app has user accounts and roles but no link between a person and a document revision, and no "read and understood" acknowledgement. The SOP register has no list of who must read which SOP.
- Evidence: Code and database search.
- Suggested fix: Smallest useful version: on each SOP revision, a "Read and understood" button for each signed-in user (stored with user, revision and time), and a page listing who has not yet acknowledged the current revision. Wider training matrices stay on paper. Size S (depends on the SOP revision rules in SCAN-P8-06).
- Needs decision from Ravi: Yes. Keep training on paper, or add the acknowledgement button?
- Confidence: Confirmed (code and database)
- Status: New

### SCAN-P9-09 — Stability is a sample quantity, not a programme: there is no study, pull schedule or result record
- Severity: Low
- Kind: Missing functionality
- Where: `stability_qty` on purchase lines and FP batches, retest workflow using the stability sample (E-B1), B44
- Finding: The app reserves stability sample quantity and uses it for retests, but there is no stability study record: no protocol or storage condition, no planned pull points (3, 6, 9, 12 months), no recorded pulls or results, and no conclusion on shelf life. B44 asks only for reminders. Without the study record the reminders would have nothing to count from except the QC approval date.
- Evidence: Search of tables and code.
- Suggested fix: After B44's reminders, a Stability Study per FP batch (conditions, planned pull dates generated from the approval date, pull recorded with quantity taken and result text, closed with conclusion). Size M.
- Needs decision from Ravi: Yes. Is the stability programme run from this app or from QC's own files?
- Confidence: Confirmed (code and database)
- Status: New (builds on B44)

## Carried to later steps

- P9.2 ranks the Missing rows above by regulatory weight, size and dependency.
- P10.1 (concurrency): two people closing the same quality event or acknowledging at once is not yet relevant; revisit after P10.
- Items that need no new finding because the master list already holds them: physical stock count / adjustment (SCAN-P3-07), calibration programme (SCAN-P8-01, SCAN-P8-04 carried), document control (B13, SCAN-P8-06), e-signature (SCAN-P1-02, 04, 09, 16), batch trace distribution end point (SCAN-P3-13), backup and restore (B10, parked), staff master (B7), sales/dispatch (B6, D22), in-process test report (B17).

## P9.1 — Checklist against the app

Status key: **Present** = works as a plant would expect, **Partial** = something exists, a named part is missing, **Missing** = nothing exists.

| # | Checklist area | Status | What the app has | What is missing | Recorded as |
|---|---|---|---|---|---|
| 1 | Batch release by QA | Partial | Two-round QC approval (checker, reviewer) releases the batch; packaging needs "Approved" | No record review or release checklist; the approval can be bypassed by a direct call | SCAN-P9-03; P1-07, P1-08, P4-04 |
| 2 | Deviation handling | Missing | Nothing (QC rejection has no reason) | Register, investigation, approval | SCAN-P9-01; P4-01 |
| 3 | OOS investigation | Missing | Nothing; results are not recorded before approval | Results against specification; OOS flag; investigation | SCAN-P9-01; P4-11 |
| 4 | Change control | Missing | MFR version number; audit trail of edits | Change request, impact, approval, reason | SCAN-P9-01; P5-03 |
| 5 | CAPA | Missing | Nothing | Corrective and preventive action register | SCAN-P9-01 |
| 6 | Complaints | Missing | Nothing | Complaint register linked to a batch | SCAN-P9-01 |
| 7 | Recall | Partial | Batch Trace forward and back (E39) with a recall summary | No dispatch / customer end point (sales is out of scope); no recall record or reconciliation | P3-13; B6 |
| 8 | Supplier qualification, approved vendor list | Missing | Vendor contact details | Approval status, licences, audit date; PO warning | SCAN-P9-02 |
| 9 | Goods receipt inspection | Partial | Internal batch number, quantity, QC sample, unit price, GST; quarantine until QC approves | Supplier lot, manufacturer, manufacture date, containers and condition | SCAN-P9-02; B21 |
| 10 | Training and personnel records | Missing | Roles, accounts, last sign-in | Training record, SOP read-and-understood; staff master is out of scope | SCAN-P9-08; B7 |
| 11 | Physical stock count and adjustment | Missing | Write-off of purchased batches; opening stock load | Count sheet, variance, approved adjustment, finished-product and in-house write-off | P3-07 |
| 12 | Calibration schedule and due alerts | Partial | Last and next date, status on equipment | Computed status, overdue mark, certificate, history, alerts | P8-01; P9-07 |
| 13 | Stability programme | Partial | Stability sample quantity, retest via stability sample | Study record, pull schedule, results; reminders (B44) | SCAN-P9-09; B44 |
| 14 | Document control (version, approval) | Partial | SOP/STP register with revision number and link | Approval, retire, current marker, distribution | B13; P8-06, P8-07 |
| 15 | Master formula control | Present | MFR with versions, approval, procedure steps, yield limits | A second person approving (P5-01); change history on the printout (P5-03) | P5-01, P5-03 |
| 16 | Batch manufacturing and packaging record | Partial | FP batch with components and yield; packaging issue with materials; Word record | Weighed quantity, who weighed / checked, equipment, step times, signature; BMR deprecated | SCAN-P9-03; P8-14 |
| 17 | Line clearance, environmental monitoring | Partial | Simple logs (both labelled Deprecated) | Link to batch and a gate; ranges and excursion flag; correction path | P8-04, P8-05, P8-09; C9 |
| 18 | Electronic records and signatures | Partial | Individual accounts, roles, immutable audit trail without password hashes, named checker and reviewer | No session timeout, no current-password check, names set by the browser, no reason or meaning of signature, no re-sign at approval, no sign-in log | P1-02, 04, 09, 16, 17 |
| 19 | Returns and rework | Missing | Rejected Materials list | Return-to-vendor / destruction record; reprocessing path | SCAN-P9-04; P3-07, P5-04 |
| 20 | Sample and retention register | Partial | Retained Samples tab (QC, Stability, R&D; RM, production RM, FP) | Location, retain-until, disposal | SCAN-P9-05 |
| 21 | Notifications (e-mail, WhatsApp) | Partial | Dashboard cards; reset e-mails from Supabase | Any outbound alert | SCAN-P9-07; P1-06; B44 |
| 22 | Data retention, archiving, backup | Partial | Audit log never deleted; test-data purge with backup script | Retention rules, archive plan, scheduled backup and restore test | B10; E8; P7-25 |
| 23 | Label control | Partial | Four label types per batch, status-based | Print log, label reconciliation | SCAN-P9-06; P4-13 to P4-15 |
| 24 | Self-inspection, internal audit, management review | Missing | Nothing | Schedule, findings, follow-up (fits the quality event register) | SCAN-P9-01 |
| 25 | Material status control (quarantine, approved, rejected) | Present | Batch cannot be used until QC Approved; FIFO hard rule; retest-due and rejected batches cannot be consumed (0090) | Direct-call bypass of the approval (P1-07) | P1-07 |
| 26 | Traceability | Present | Batch Trace both ways; every ledger line carries batch, reference and person | Stops at 6 levels; no dispatch end | P3-13 |
| 27 | Access control | Present | Six roles, RLS on every table, System Admin only user management, disable account | Super Auditor can load opening stock (P1-11); anonymous grants (P1-12) | P1-11, P1-12 |
| 28 | Audit trail | Present | All 34 tables, immutable, full before and after | Screen limits (P1-15), no access log (P1-16) | P1-15, P1-16 |

Totals of the 28 rows: **Present 5** (15, 25, 26, 27, 28), **Partial 13** (1, 7, 9, 12, 13, 14, 16, 17, 18, 20, 21, 22, 23), **Missing 10** (2, 3, 4, 5, 6, 8, 10, 11, 19, 24). Six of the ten Missing rows (2, 3, 4, 5, 6, 24) are the same register (SCAN-P9-01).

## Checked and found sound (P9.1)

- The purchase-to-production chain does enforce status: a batch not QC Approved, in retest, rejected or reopened cannot be consumed by FP, packaging or Production RM (0090 and the QC gate triggers).
- Every stock movement carries a ledger line with batch, reference and user, which is what makes the Batch Trace and a recall summary possible.
- Individual named accounts, no shared login, System Admin-only account creation and a disable switch exist; the audit trail is immutable and never stores password hashes.
- Dashboard alerts for retest due, expiry and pending QC exist and the FP started-batch intimation to QC (B34) is live.

## Areas read (P9.1)

Table and column lists of `vendors`, `purchase_orders`, `purchase_lines`, `quality_checks`, `finished_product_batches`, `packaging_issues`, `coa_records`, `user_roles`, `profiles` on the test database; keyword search of `app`, `lib`, `components` and the migrations; `claude/software-point-3-gap-analysis.md`; master list B-, C- and D-sections; findings P1 to P8 (for cross-references); `package.json` (no mail library).

## P9.2 — Rank and shape the gaps

Nothing is built; this is the order I would suggest Ravi decides in. Regulatory weight is my reading of how often an inspector or customer auditor asks for the record (High = asked first, Medium = asked if the topic comes up, Low = good practice), to be confirmed with the regulatory adviser. Size: S = under a day of work with a test suite, M = one to three days, L = a week or more. "Needs" is what must be decided or built first.

| Rank | Gap | What it would be in this app | Size | Needs | Weight | Why this place |
|---|---|---|---|---|---|---|
| 0 | Backup and restore (B10, parked) | Not a feature: a documented backup plan, plan tier with point-in-time recovery, one restore test | S (ops) | Ravi's decision on the Supabase plan | High | Before real data, not after; already recommended on 30 Sept |
| 0 | Make existing controls hold (SCAN-P1-07, 08, 09, P4-01, P4-02) | Stamp names and times from the database, lock decided QC records, require a rejection reason and a second person | M | Decision on the System Admin exemption (P1-09) | High | Every new register below inherits the same weakness if signatures can be typed |
| 1 | Physical stock count and adjustment (SCAN-P3-07) | Count sheet per store, variance, reasoned adjustment with approval, ledger line | M | None | High (inventory accuracy, the scan's main goal) | Directly closes the "inventory tightening" aim; no new concept |
| 2 | Batch release review tick (SCAN-P9-03, small version) | On the QC Round 2 screen: "batch record reviewed" tick with reviewer, shows latest line clearance and open quality events | S | Ravi: paper or electronic batch record | High | Cheapest visible GMP step; can ship alone |
| 3 | Quality event register (SCAN-P9-01) | One table and screen for deviations, OOS, changes, complaints, audit findings; link to batch / item / document; due dates; closure with reviewer | L | Rank 0 second row (signatures) | High | Biggest absent area; build once, reuse for six checklist rows |
| 4 | Supplier approval and receipt record (SCAN-P9-02) | Vendor approval status, licence numbers; supplier lot, manufacturer, manufacture date, containers and condition on the receipt line; show on Under Test label | M | Which fields; warn or block | High for herbal raw material | Feeds traceability and recall; small schema change |
| 5 | Alerts by e-mail (SCAN-P9-07) | Daily digest by role from one scheduled job | M | Real SMTP provider (SCAN-P1-06); B44 and calibration dates in place | Medium | Makes retest, expiry, calibration and stability dates useful |
| 6 | Calibration programme (SCAN-P8-01 plus certificate and history) | Computed status, overdue mark, calibration history rows | S to M | None | Medium | Already half-specified in P8 |
| 7 | Stability study (SCAN-P9-09, after B44) | Study per FP batch with generated pull dates and results | M | B44 reminders first | Medium | Only worth it if stability is run from this app |
| 8 | Document control completion (B13, SCAN-P8-06, 07, P9-08) | Obsolete / current marker, unique revision, SOP read-and-understood | M | Ravi: will the SOP screen be used | Medium | Training acknowledgement rides on it |
| 9 | Rejected material disposition (SCAN-P9-04) | Returned / destroyed / held with date and reference | S | None | Medium | Closes the life of a rejected batch |
| 10 | Retained sample location and disposal (SCAN-P9-05) | Location, retain-until, disposal record | S | Retention rule | Low to Medium | Small, tidy |
| 11 | Print log (SCAN-P9-06) | Who printed which document and when | S | None | Low | Cheap; do with the next label change |
| 12 | Electronic batch record (SCAN-P9-03, large version) | Weighment lines with who and when, equipment, step times, signatures | L | Ravi chooses electronic over paper | High if chosen | Only if the plant wants to leave paper; otherwise skip |
| 13 | Returns / rework of finished product (SCAN-P9-04, second half) | Reprocessing record linked to original batch | M | Is reprocessing allowed at all | Low unless done | Decide first, may close as "not done here" |
| 14 | Staff, sales, dispatch (B7, B6, D22) | Out of scope by decision | L each | Ravi's scope | Varies | Recall to customers needs a dispatch end point; revisit only if sales enters the app |

Shapes that group well into one piece of work:

- **"Trustworthy records" bundle** (rank 0, second row): names and times from the database, locked decisions, rejection reasons. It is the base for everything else and already has the most findings (P1-07, 08, 09, P4-01, 02, P8-08, P8-10).
- **"Inventory accuracy" bundle**: stock count and adjustment (rank 1), rejected disposition (rank 9), write-off for finished and in-house material (P3-07).
- **"Quality system" bundle**: release review tick (rank 2), quality event register (rank 3), supplier approval (rank 4), document control (rank 8).
- **"Reminders" bundle**: B44 stability reminders, calibration status, e-mail digest (ranks 5, 6, 7).

What I would not do: build any of these before the real-data decisions already waiting (backup, second environment B40, go-live date). Ravi's earlier scope choices (no sales, no payroll) are kept.
