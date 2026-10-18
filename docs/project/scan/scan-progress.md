---
title: Scan progress — full-app review
---

# Full-app review — progress

**Status: SCAN COMPLETE (10 to 11 Oct 2026).** Ravi said "start scan" on 10 Oct 2026. The final report and the one recommended next build are in `claude/scan-findings-p11.md`. "scan status" shows this report; a new scan would start from the master list.

**NEXT STEP: none**

## Progress report

| Measure | Value |
|---|---|
| Steps done | **53 of 53** (100%) |
| Weighted progress | **100%** (82 of 82 points; small step = 1, medium = 2, large = 3) |
| Phases complete | 12 of 12 |
| Findings so far | 140 (High 4 · Medium 47 · Low 89); 1 duplicates dropped |
| Master list updated to | Phases 1 to 10 (140 findings in Part 1F) |
| Last saved | P11.2 on 11 Oct 2026 |

| Phase | Steps done | Points | % done | State |
|---|---|---|---|---|
| P0 Set-up and baseline | 2 of 2 | 2 | 100% | Done |
| P1 Security, access and audit (foundation) | 7 of 7 | 12 | 100% | Done · master list updated |
| P2 Master data | 5 of 5 | 9 | 100% | Done · master list updated |
| P3 Purchase and inventory ledger | 5 of 5 | 10 | 100% | Done · master list updated |
| P4 Quality control, COA and labels | 6 of 6 | 10 | 100% | Done · master list updated |
| P5 Production (MFR and finished product) | 5 of 5 | 8 | 100% | Done · master list updated |
| P6 Packaging and production-issued raw material | 4 of 4 | 6 | 100% | Done · master list updated |
| P7 Reports, dashboard, exports and shared screens | 7 of 7 | 11 | 100% | Done · master list updated |
| P8 Supporting modules | 4 of 4 | 4 | 100% | Done · master list updated |
| P9 Missing functionality for a regulated plant (Ayurvedic / pharma GMP) | 2 of 2 | 3 | 100% | Done · master list updated |
| P10 Cross-cutting data integrity and concurrency | 4 of 4 | 5 | 100% | Done · master list updated |
| P11 Compile and hand over | 2 of 2 | 2 | 100% | Done · master list updated |

*Recalculated and saved after every step. "scan status" at any time shows this report.*


Replaces the earlier 7-slice list. The full plan, the component inventory, the method and the finding format are in `claude/scan-plan.md`. Findings are saved per phase in `claude/scan-findings-pN.md` (the file is rewritten after every step). The master list is updated at the end of every phase.

**How to resume (for any new session):** read this file, read `claude/scan-plan.md` Part C, read the findings file of the phase that holds NEXT STEP, then carry on with that step. Never redo a step marked Done. If a step is marked "In progress", re-do only that step.

| Step | What | Status | Findings | Notes |
|---|---|---|---|---|
| P0.1 | Known-items index | Done | 0 | 0 findings; index of tracked items in scan-findings-p0.md |
| P0.2 | Local test database | Done | 0 | 0 findings; all 26 suites match baseline |
| P1.1 | Sign-in, sessions, proxy | Done | 6 | SCAN-P1-01 to 06 (reset link, idle timeout, deep link, current password, raw error, e-mail sender) |
| P1.2 | Role matrix end to end | Done | 5 | SCAN-P1-07 to 11: 3 High (QC release by direct insert; decided QC editable; signature fields client-written), anon number burning, auditor loads stock |
| P1.3 | RLS and grants table by table | Done | 1 | SCAN-P1-12 (anon grants); RLS on all 34 tables, no open policy |
| P1.4 | Database functions | Done | 1 | SCAN-P1-13 (anon-callable definer helpers); no missing-WHERE, no injection, search_path fixed |
| P1.5 | Server action input handling | Done | 1 | SCAN-P1-14 (unbounded line counts, negative threshold); DB re-validates opening-stock rows |
| P1.6 | Audit trail coverage and integrity | Done | 3 | SCAN-P1-15 to 17 (audit screen cap and filters, no sign-in log, screen vs API not distinguishable); coverage complete |
| P1.7 | Secrets, headers, dependencies, exports | Done | 1 | SCAN-P1-18 (Next.js 16.3.3 has 7 advisories, patched in 16.3.8); no secrets in repo; Excel export cannot inject formulas |
| P2.1 | Items, item types, units, codes | Done | 2 | SCAN-P2-01 to 03 (category switch after records exist, screen-only item rules, weak duplicate checks); codes, unit lock, pairing sound |
| P2.2 | Vendors | Done | 1 | SCAN-P2-04, 05 (vendor cannot be made inactive; vendor edits change old PO and label prints); delete rules sound |
| P2.3 | Bulk upload | Done | 3 | SCAN-P2-06 to 09 (stray far-down cell can crash the reader: 6 s / 1.9 GB; bulk purchase allows blank price and GST; 1 MB file limit unhandled; form vs upload rule gaps); all-or-nothing import, dates and name matching sound |
| P2.4 | Opening stock | Done | 2 | SCAN-P2-10, 11 (template has codes only, no names or units, quantity unit unchecked; no loaded-by or kept file); loads are all-or-nothing, undo and expired handling sound |
| P2.5 | Company, users, roles, profile | Done | 1 | SCAN-P2-12, 13 (display name freely editable and rewrites history; reprints use today's company details); last-admin and role rules sound |
| P3.1 | Purchase order life cycle | Done | 2 | SCAN-P3-01 to 03 (reopened PO keeps QC approval and lines can be changed: qty, batch, item; invoice header cannot be corrected; empty PO can be submitted); create, submit, delete rules sound |
| P3.2 | Ledger writes and stock views | Done | 3 | SCAN-P3-04, 05 (FIFO by typed time not arrival, no expiry rule; no automatic stock reconciliation); ledger append-only; 7 invariants hold on 6 suite databases |
| P3.3 | Wastage and adjustments | Done | 1 | SCAN-P3-06 to 09 (reason saved but invisible; no write-off for finished/packed/in-house stock and no adjustment or count; blank reason accepted; no second person) |
| P3.4 | Stock reports built this month | Done | 5 | SCAN-P3-10 to 14 (low-stock counts unusable stock; RM Report as-on shows today quantities; Statement labels; Batch Trace silent cut-off; sample date) |
| P3.5 | Data invariants, stock side | Done | 0 | Pack of 10 stock checks saved (claude/scan-invariants-stock.sql); clean on all local databases except test-staged data |
| P4.1 | QC rounds and decisions | Done | 2 | SCAN-P4-01, 02 (rejection final with no reason or confirmation; QC rules enforced on the screen only, reproduced) |
| P4.2 | Retests, expiry, stability | Done | 2 | SCAN-P4-03 to 05 (expired batches retested and expiry extended, reproduced; no finished product retest or expiry control; dashboard drops overdue batches) |
| P4.3 | AR numbers and QC lists | Done | 1 | SCAN-P4-06, 07 (QC list capped at 1,000 silently; AR numbers burned by failed saves, gaps unexplained) |
| P4.4 | COA and COA templates | Done | 2 | SCAN-P4-08 to 12 (certificate content unchecked, reproduced; no void or replace; PDF text overlaps and signatures fall off page, measured; no results at QC; specs editable by purchasing) |
| P4.5 | Labels | Done | 2 | SCAN-P4-13 to 16 (best-before rounds up to month end; receipt date is invoice date; long names truncated, measured; page loads all batches) |
| P4.6 | Data invariants, QC side | Done | 0 | Pack of 10 QC checks saved (claude/scan-invariants-qc.sql); runs clean of errors, flags only suite/test data locally |
| P5.1 | MFR definitions | Done | 2 | SCAN-P5-01 to 03 (creator can approve own MFR, reproduced; recipe rules on screen only; procedure changes unmarked on printout) |
| P5.2 | Finished product batch flow | Done | 2 | SCAN-P5-04 to 07 (no correction or close path after Create Batch; yield of any size accepted; batch rules on screen only; stale draft keeps material locked until a page is opened) |
| P5.3 | Compose, FIFO and consumption | Done | 2 | SCAN-P5-08 to 10 (15-decimal quantities leave specks that block the next batch; component item can differ from batch item; deactivated ingredient still consumed); SCAN-P5-06 raised to Medium (Compose URL accepts an unapproved MFR) |
| P5.4 | Documents and slips | Done | 1 | SCAN-P5-11 to 14 (BMR omits AR of production-sourced RM and mislabels quantity; BMR lacks MFR reference and cannot be printed at start; file names contain a slash; batch page hides samples and packed quantity) |
| P5.5 | Data invariants, production side | Done | 1 | No new finding. Ten checks INV-P1 to INV-P10 in `claude/scan-invariants-production.sql`, tested on scratch databases |
| P6.1 | Packaging issues | Done | 2 | SCAN-P6-01 to 03 (a packaging issue can never be voided; rules on screen only: unapproved batch, raw material as packaging, no material accepted; New issue page reads all history) |
| P6.2 | Production raw material batches | Done | 2 | SCAN-P6-04 to 05 (QC can approve a Production batch with no sample and an expiry unrelated to its source batch; item page and slip show the save date, not the issue date) |
| P6.3 | Packed finished product stock | Done | 1 | SCAN-P6-06 (Ageing shows wrong finished product In stock: subtracts pack count from kg). INV-S8 and P3 text corrected |
| P6.4 | Data invariants, packaging side | Done | 1 | No new finding. Eleven checks INV-K1 to INV-K11 in `claude/scan-invariants-packaging.sql`, tested on scratch databases |
| P7.1 | Reports screen | Done | 11 Oct 2026 | 7 findings (SCAN-P7-01 to 07) |
| P7.2 | Dashboard | Done | 11 Oct 2026 | 5 findings (SCAN-P7-08 to 12) |
| P7.3 | Exports and documents | Done | 11 Oct 2026 | 4 findings (SCAN-P7-13 to 16) |
| P7.4 | Shared components and formatting | Done | 11 Oct 2026 | 5 findings (SCAN-P7-17 to 21) |
| P7.5 | Phone and small screens, accessibility | Done | 11 Oct 2026 | 3 findings (SCAN-P7-22 to 24) |
| P7.6 | Performance and scale | Done | 11 Oct 2026 | 1 finding (SCAN-P7-25); SCAN-P7-02 is a duplicate of C17 |
| P7.7 | User guide and module docs accuracy | Done | 11 Oct 2026 | 3 findings (SCAN-P7-26 to 28) |
| P8.1 | Equipment and dead stock | Done | 11 Oct 2026 | 3 findings (SCAN-P8-01 to 03) |
| P8.2 | Documents (SOP / STP), environmental control, line clearance | Done | 11 Oct 2026 | 6 findings (SCAN-P8-04 to 09) |
| P8.3 | Feedback widget and audit screen | Done | 11 Oct 2026 | 3 findings (SCAN-P8-10 to 12) |
| P8.4 | Deprecated BMR and leftovers | Done | 11 Oct 2026 | 2 findings (SCAN-P8-13 to 14) |
| P9.1 | Checklist against the app | Done | 11 Oct 2026 | 28-row checklist (5 Present, 13 Partial, 10 Missing); 9 findings (SCAN-P9-01 to 09) |
| P9.2 | Rank and shape the gaps | Done | 11 Oct 2026 | Ranked list of 15 in `scan-findings-p9.md`; 4 bundles |
| P10.1 | Concurrency and races | Done | 11 Oct 2026 | 4 findings (SCAN-P10-01 to 04) |
| P10.2 | Time, numbers, text | Done | 11 Oct 2026 | 3 findings (SCAN-P10-05 to 07) |
| P10.3 | Test coverage gaps | Done | 11 Oct 2026 | 2 findings (SCAN-P10-08 to 09); 26 suites / 895 checks pass; 97 of 119 functions run |
| P10.4 | Combine the SQL invariant packs | Done | 11 Oct 2026 | 0 findings; 97 read-only blocks in claude/scan-data-checks.sql (P1-A to P10-F plus INV-S, Q, P, K), all run clean in a read-only transaction |
| P11.1 | De-duplicate and rank | Done | 11 Oct 2026 | No new finding. 140 findings in 17 bundles; 14 overlap groups; about 117 separate changes |
| P11.2 | Final report | Done | 11 Oct 2026 | Final report and one recommended next build (QC records, bundle A part 1) in `claude/scan-findings-p11.md` |

| Phase | Findings file | Master list updated |
|---|---|---|
| P0 Set-up and baseline | `claude/scan-findings-p0.md` | n/a (no findings) |
| P1 Security, access and audit (foundation) | `claude/scan-findings-p1.md` | Yes, 10 Oct 2026 (Part 1F) |
| P2 Master data | `claude/scan-findings-p2.md` | Yes, 10 Oct 2026 (Part 1F) |
| P3 Purchase and inventory ledger | `claude/scan-findings-p3.md` | No |
| P4 Quality control, COA and labels | `claude/scan-findings-p4.md` | No |
| P5 Production (MFR and finished product) | `claude/scan-findings-p5.md` | Yes, 11 Oct 2026 (Part 1F) |
| P6 Packaging and production-issued raw material | `claude/scan-findings-p6.md` | Yes, 11 Oct 2026 (Part 1F) |
| P7 Reports, dashboard, exports and shared screens | `claude/scan-findings-p7.md` | Yes, 11 Oct 2026 (Part 1F) |
| P8 Supporting modules | `claude/scan-findings-p8.md` | Yes, 11 Oct 2026 (Part 1F) |
| P9 Missing functionality for a regulated plant (Ayurvedic / pharma GMP) | `claude/scan-findings-p9.md` | Yes, 11 Oct 2026 (Part 1F) |
| P10 Cross-cutting data integrity and concurrency | `claude/scan-findings-p10.md` | Yes, 11 Oct 2026 (Part 1F) |
| P11 Compile | ranking and final report in `claude/scan-findings-p11.md` | n/a (ranking only; Part 1F carries a pointer) |

SQL data checks for the live database (read-only) are in `claude/scan-data-checks.sql` (finished in P10.4: 97 blocks, each with a plain-language note).
