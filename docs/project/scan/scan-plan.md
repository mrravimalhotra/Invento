---
title: Full-app scan plan — components, phases, steps and how to resume
---

# Full-app scan — plan (built 10 Oct 2026, waiting for Ravi to say "start scan")

Requested by Ravi: scan the whole app for issues with data or functionality. Find what has **not been reported or tracked before**: unreported bugs, functionality enhancements, inventory tightening, formatting, security and the like. Add what is found to the master list. Work in small saved pieces so a usage limit never loses results, and so the scan can be resumed at Ravi's convenience.

**Nothing in this plan has been run.** The scan starts only when Ravi says **"start scan"**. After an interruption, Ravi says **"resume scan"**.

Rules that apply (from `claude/large-task-ground-rules.md`): one step at a time, no parallel helpers, cheap checks first, save after every step, verify before listing, report after every phase, one recommendation at the end.

## Part A — What is in the app (the components to scan)

Figures taken from the repository on 10 Oct 2026 (`main` = ab0b140): 108 migrations, 34 tables and 22 views in the fresh-install script, about 209 function definitions, 28 database test files (26 registered suites), about 23,500 lines of application TypeScript, about 6,100 lines of server actions.

### A1 — Screens (routes)

| Area | Routes | Notes |
|---|---|---|
| Sign-in | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/change-password` | forced password change, reset by e-mail |
| Dashboard | `/` | alerts, charts, QC in-progress card, legacy toggle |
| Items | `/items`, `/items/new`, `/items/[id]`, `/item-types`, `/item-types/[id]` | Item Master, categories, units, codes |
| Vendors | `/vendors`, `/vendors/[id]` | |
| Purchase | `/purchase`, `/purchase/new`, `/purchase/[id]` | PO lifecycle, batches per line |
| Inventory | `/inventory` tabs: Ledger, Stock Position (`balance`), Stock Statement, RM Report As On Date (`rm-report`), Rejected Materials, Batch Trace, Expiry & Retest Ageing, Retained Samples; `/inventory/items/[id]`; `/inventory/wastage/new` | |
| Opening stock | `/opening-stock` | RM, packaging and FP loads, templates |
| QC | `/qc`, `/qc/new`, `/qc/[id]` | rounds, decisions, retests, batches in progress |
| COA | `/coa`, `/coa/new`, `/coa/[id]`, `/coa/templates`, `/coa/templates/[id]` | |
| Labels | `/labels` | 6-up sheet, JPEG, three label types |
| MFR | `/mfr`, `/mfr/new`, `/mfr/[id]`, `/mfr/[id]/report` | master formula records |
| Finished product | `/finished-product`, `/finished-product/new`, `/finished-product/new/compose`, `/finished-product/[id]` | batch flow, compose, slips |
| Packaging | `/packaging`, `/packaging/new` | Store, R&D and Production issues |
| Reports | `/reports` | registers and exports |
| Bulk upload | `/bulk-upload` plus `/api/bulk-upload/template/[module]`, `/api/opening-stock/template/[kind]` | |
| Supporting registers | `/equipment`, `/equipment/[id]`, `/dead-stock`, `/dead-stock/[id]`, `/documents`, `/documents/new`, `/environmental-control`, `/environmental-control/new`, `/line-clearance`, `/line-clearance/new` | |
| Administration | `/company`, `/user-roles`, `/profile`, `/audit`, `/audit/[id]`, `/feedback`, `/user-guide`, `/admin/purge-test-data`, `/admin/bmr-deprecated` (+ `new`, `[id]`) | |

### A2 — Server actions (`lib/actions`, one file per module)

admin-users, admin, auth, bmr (deprecated), bulk-upload (about 1,600 lines, the largest), coa-templates, coa, company, dead-stock, documents, environmental-control, equipment, feedback, finished-product, inventory, item-types, items, line-clearance, mfr, opening-stock, packaging, purchase, qc, user-roles, vendors.

### A3 — Library modules (`lib`)

- Rules and calculations: `ageing`, `batch-qc-status`, `date-rules`, `finished-product-status`, `fp-in-progress`, `qc-retests`, `qc-rounds`, `usable-stock`, `packaging-materials`, `dashboard-series`.
- Ledger helpers: `ledger-enrich`, `ledger-events`, `ledger-reasons`.
- Output: `pdf`, `pdf-company-heading`, `pdf-user`, `coa-pdf`, `coa-template-data`, `coa-template-lines`, `coa-logo`, `atharva-logo`, `excel-export`, `table-export`, `fonts`.
- Import: `bulk-upload/*` (dates, examples, parse, schemas, templates), `opening-stock/*` (columns, legacy-lines, template, validate).
- Platform: `auth/*` (session, user-accounts), `supabase/*` (admin, client, fetch-all, middleware, server), `constants/*` (admin, auth, feedback, nav, qc-rules, roles, units), `db-errors`, `flash`, `saved-messages`, `paging`, `utils`, `company`, `company-server`, `hooks/use-hide-legacy`, `use-flash-action`.
- Edge: `proxy.ts` (route protection and headers), `next.config.ts` (security headers, CSP report-only).

### A4 — Shared UI

`components/ui`: badge, button, card, combobox, data-table, decision-choice, flash-host, form, hide-legacy-toggle, legacy-tag, page-header, page-loading, signature-block. `components/shell`: sidebar, topbar, mobile-nav, nav-list, company-setter, pdf-user-setter. `components/feedback`: page-feedback.

### A5 — Database (`supabase`)

- 108 migrations (`migrations/`), assembled into `fresh-install.sql` by `scripts/build-fresh-install.mjs`.
- 34 tables, 22 views (security invoker), triggers, about 209 functions (RPCs, guards, number sequences, ledger writers), RLS policies and grants.
- Storage, audit trail (`audit_log` and triggers), number sequences (item codes, PO, batch, AR, COA).
- 28 test files in `supabase/tests`, 26 registered suites in `scripts/dev/run-tests.sh`, baseline in `expected.txt` (sec07 41 pass / 1 fail is the known baseline).

### A6 — Functional areas that cut across screens

| # | Cross-cutting area | Where it lives |
|---|---|---|
| X1 | Stock = push minus pull minus wastage, FIFO, usable-stock rule | ledger triggers, `usable-stock`, FIFO function |
| X2 | QC status of a batch (latest decision, retests, expiry) | `current_qc_approvals`, `purchase_batch_status`, `production_batch_status`, `batch-qc-status` |
| X3 | Roles and permissions (6 roles) | `roles.ts`, `nav.ts`, action gates, RLS |
| X4 | Audit trail | triggers, `/audit` |
| X5 | Numbering (item codes, PO, batch, short batch, AR, COA) | sequences and functions |
| X6 | Legacy (migrated) data handling and the hide-legacy toggle | `legacy-tag`, `hide-legacy-toggle`, opening stock |
| X7 | India time and date rules | `date-rules`, `tz_india_time` suite |
| X8 | Exports and documents (PDF, Excel, Word, JPEG) | `pdf*`, `excel-export`, `table-export`, labels |
| X9 | Company identity on documents | `company`, `company-setter` |
| X10 | Row caps and paging (1,000-row API cap) | `fetch-all`, `paging` |

### A7 — Already tracked (not re-reported)

Everything in the master list (Parts 1 to 5) and the project documents `known-issues`, `open-requirements-log`, `feedback-*`. Standing decisions: SEC-02 accepted; SEC-05, 08, 11, 13 no action; ACC-11 parked; MFA undecided; tests/CI (C14), CSP enforce (C15), ledger partitioning (C16), C17, C18 and separate environments (B40) on hold; packaging is Pack only. Step P0.1 turns this into an index.

## Part B — Phases and steps

12 phases, 53 steps. Size: S = small, M = medium, L = large (a few hours of reading and checking, at most). Each step names what to check; the step's findings are written before the next step starts.

### P0 — Set-up and baseline  (size S)

| Step | What | Check | Size |
|---|---|---|---|
| P0.1 | Known-items index | Read the master list once and build a one-page index of every tracked ID and keyword (so nothing already tracked is re-reported). Saved as the first section of scan-findings-p0.md. | S |
| P0.2 | Local test database | Build the local Postgres from fresh-install.sql, confirm all 26 suites pass, and prepare a small realistic data set (items, vendors, POs, QC, FP batches, packaging) used by the SQL checks in later phases. | S |

### P1 — Security, access and audit (foundation)  (size L)

| Step | What | Check | Size |
|---|---|---|---|
| P1.1 | Sign-in, sessions, proxy | app/(auth)/*, proxy.ts, lib/actions/auth.ts, lib/auth/*: redirect rules, session expiry, forced password change, lockout / rate limits, error messages that reveal accounts, reset flow. | M |
| P1.2 | Role matrix end to end | lib/constants/roles.ts and nav.ts against (a) every server action's role gate, (b) every table's RLS policy, (c) what each screen shows. Build the matrix role x module x read/write and list every mismatch (screen shown but action refused, action allowed but screen hidden). | M |
| P1.3 | RLS and grants table by table | For every table and view in the local database: RLS on or off, select / insert / update / delete policies, grants to anon and authenticated, security invoker on views. Query pg_policies, pg_class and information_schema; list gaps. | M |
| P1.4 | Database functions | All 200+ function definitions (latest version of each): SECURITY DEFINER with a fixed search_path, role check inside, execute grants, anon access, dynamic SQL, missing WHERE on UPDATE / DELETE (the hosted-database rule). | M |
| P1.5 | Server action input handling | Every file in lib/actions: validation present (zod), what is trusted from the client (ids, quantities, dates, status), file and URL inputs (COA file, documents), mass-assignment, redirect and flash messages that echo input. | M |
| P1.6 | Audit trail coverage and integrity | audit_log triggers on every business table, who / when / via stamped, immutability, what the Audit screen shows, gaps (e.g. reads of sensitive data, role changes, exports, login events). | S |
| P1.7 | Secrets, headers, dependencies, exports | Environment variables and service-role usage, CSP and security headers, npm audit, file downloads and PDF / Excel content (injection into spreadsheets), logging of personal data. | S |

### P2 — Master data  (size M)

| Step | What | Check | Size |
|---|---|---|---|
| P2.1 | Items, item types, units, codes | items / item-types actions and pages, code sequences (RM-001, PKG, FP), unit rules (single unit per item), category rules, duplicate checks, deactivation and delete rules, thresholds and low-stock. | M |
| P2.2 | Vendors | vendors module: duplicates, codes, address and mobile, deactivate, link to purchase orders, price and approval status. | S |
| P2.3 | Bulk upload | lib/actions/bulk-upload.ts (1,600 lines) and lib/bulk-upload: every module template, validation, partial failure, row limits, code consumption, encoding and date handling, idempotency. | L |
| P2.4 | Opening stock | opening-stock module and 0100 / 0101: loads, undo, close and reopen, QC status handling, legacy flags, effect on ledger, stock and reports. | M |
| P2.5 | Company, users, roles, profile | company settings, admin users, user-roles, profile, disable account, password change. | S |

### P3 — Purchase and inventory ledger  (size L)

| Step | What | Check | Size |
|---|---|---|---|
| P3.1 | Purchase order life cycle | purchase actions and pages: draft, submit, reopen, delete, edit lines, sample quantities, units and conversions, invoice rules, vendor link, dates, concurrency (two users on one PO). | M |
| P3.2 | Ledger writes and stock views | Triggers that write inventory_ledger, stock_balance, item_position, item_stock_status, live_remaining_qty maintenance, FIFO function and guard (0090), reconciliation of ledger vs batch quantities. | L |
| P3.3 | Wastage and adjustments | record_wastage, Wastage screen, wastage on rejected batches, negative stock paths, and the missing counterpart: stock adjustment and physical count. | S |
| P3.4 | Stock reports built this month | Stock Position, Stock Statement, Rejected Materials, Batch Trace, Expiry and Retest Ageing, Retained Samples, RM Report: check each against the ledger with SQL, edge cases (zero stock, units, legacy, reopened POs, timezone, row caps). | M |
| P3.5 | Data invariants, stock side | Write the SQL invariant pack part 1 (ledger vs batches vs views, negative remaining, orphans, units, duplicate batch numbers) and run it on the local database. Saved as scan-data-checks.sql for Ravi to run on the live database. | M |

### P4 — Quality control, COA and labels  (size L)

| Step | What | Check | Size |
|---|---|---|---|
| P4.1 | QC rounds and decisions | qc actions and pages, two-round review, reviewer rules, decision locks, advisory locks, rejected path, who can do what, edits after decision, audit. | M |
| P4.2 | Retests, expiry, stability | retest start and limits (3 retests, 180 days), expiry rules, stability reserve, Due for retest cards, production raw material retests, finished product retest and expiry. | M |
| P4.3 | AR numbers and QC lists | ARRM / ARFP numbering and year rollover, legacy AR numbers, QC list filters, Awaiting QC and in-progress cards, search, export. | S |
| P4.4 | COA and COA templates | coa and coa-templates actions, template per item and per MFR, issue rules, current-approval check, PDF content, file link field, numbering, edit after issue. | M |
| P4.5 | Labels | labels module (2,000 lines): which batches are offered, status text, expiry and best-before, quantities, 6-up sheet layout, JPEG output, template sizes. | M |
| P4.6 | Data invariants, QC side | SQL invariant pack part 2 (batches without QC, approvals without expiry, two current approvals, retest counts, COA without approval, AR duplicates). | S |

### P5 — Production (MFR and finished product)  (size L)

| Step | What | Check | Size |
|---|---|---|---|
| P5.1 | MFR definitions | mfr module: create, approve, edit rules, recipe lines and units, versioning off, FP item creation at approval, bulk MFR, delete and deactivate, report preview and Word document. | M |
| P5.2 | Finished product batch flow | Draft, Create, Complete, Submit to QC, cancel and 30-minute auto-cancel, batch numbers and short numbers, dates, yield and sample fields, status guards. | M |
| P5.3 | Compose, FIFO and consumption | compose screen, allocation across batches, usable-stock rule, expired and retest-due exclusion, production raw material use, race when two people compose from one batch. | M |
| P5.4 | Documents and slips | FP intimation slip, RM intimation slip, BMR Word document, MFR print, line clearance link, content accuracy against data. | S |
| P5.5 | Data invariants, production side | SQL invariant pack part 3 (components vs ledger pulls, yield vs samples vs packaged, batch numbers, status vs QC state, drafts left behind). | S |

### P6 — Packaging and production-issued raw material  (size M)

| Step | What | Check | Size |
|---|---|---|---|
| P6.1 | Packaging issues | packaging actions: Store, R&D and Production, multi-line save, issue date, pack size and unit count rules, bulk consumed, materials FIFO, codes (PKG-), all-or-nothing. | M |
| P6.2 | Production raw material batches | RM-FP batches made from production issues: QC, retest, expiry, use in compose, wastage, labels, slips. | M |
| P6.3 | Packed finished product stock | Packaged FP items, pack counts, unpack / return gap, packing register, opening stock packs, link to batch trace. | S |
| P6.4 | Data invariants, packaging side | SQL invariant pack part 4 (issue vs ledger, materials vs batches, packaged_qty vs issues, production batches vs issues). | S |

### P7 — Reports, dashboard, exports and shared screens  (size L)

| Step | What | Check | Size |
|---|---|---|---|
| P7.1 | Reports screen | reports module: every register (QC, FP, Purchase, Packing), filters, date ranges, caps, legacy handling, PDF and Excel content, totals. | M |
| P7.2 | Dashboard | dashboard page, alerts, charts, counts versus the lists they link to, legacy toggle, timezone, performance. | S |
| P7.3 | Exports and documents | lib/excel-export.ts, table-export.ts, pdf.ts and every PDF / Word generator: header and company details, number and date formats, decimals, units, long text, page breaks, company logo. | M |
| P7.4 | Shared components and formatting | DataTable, forms, combobox, flash messages, date and quantity formatting, empty states, error states, loading, consistent wording and units across screens. | M |
| P7.5 | Phone and small screens, accessibility | Layout at phone width for the main screens, keyboard use, labels, colour contrast, touch targets (code review; live look only with Ravi's say-so, read-only). | S |
| P7.6 | Performance and scale | Row caps and paging, queries without indexes, N+1 patterns, pages that load everything, heavy exports, expected volume (92,000 legacy lines, 5 million ledger rows). | M |
| P7.7 | User guide and module docs accuracy | docs/user-guide and docs/modules against what the app does now: missing, stale or wrong statements. | S |

### P8 — Supporting modules  (size M)

| Step | What | Check | Size |
|---|---|---|---|
| P8.1 | Equipment and dead stock | equipment and dead-stock modules: calibration dates, quantities, amounts, depreciation, resolution, duplicates, exports. | S |
| P8.2 | Documents (SOP / STP), environmental control, line clearance | the three small registers: validation, attachments, review dates, who can edit, approval. | S |
| P8.3 | Feedback widget and audit screen | feedback module, ticket states, tester rules, audit log screen, filters, export. | S |
| P8.4 | Deprecated BMR and leftovers | bmr module (deprecated, report only), dead code, unused tables and columns, TODO comments, stale scripts. | S |

### P9 — Missing functionality for a regulated plant (Ayurvedic / pharma GMP)  (size M)

| Step | What | Check | Size |
|---|---|---|---|
| P9.1 | Checklist against the app | Map a standard checklist to the app and mark each Present / Partial / Missing: batch release by QA, deviation and OOS handling, change control, CAPA, complaints and recall (batch trace now exists), supplier qualification and approved vendor list, training records, physical stock count and adjustment, calibration schedule and due alerts, stability programme, document control with version and approval, electronic signature and audit rules (Schedule M / 21 CFR Part 11 style), returns and rework, sample and retention register, notifications (email / WhatsApp), data retention and archiving. | M |
| P9.2 | Rank and shape the gaps | For each Missing item: what it would be in this app, size, dependency, regulatory weight. Output is a ranked list for Ravi to decide on; nothing is built. | S |

### P10 — Cross-cutting data integrity and concurrency  (size M)

| Step | What | Check | Size |
|---|---|---|---|
| P10.1 | Concurrency and races | Two users on the same record: PO edit, QC decision, compose, packaging issue, wastage, role change; locks and guards present or missing. | M |
| P10.2 | Time, numbers, text | Timezone (India time) in every date comparison, numeric precision and rounding of quantities, text length and special characters, sequences and overflow. | S |
| P10.3 | Test coverage gaps | What the 26 database suites do not cover (list of untested functions and flows) and what has no test at all (screens, actions). | S |
| P10.4 | Combine the SQL invariant packs | Merge parts 1 to 4 into one scan-data-checks.sql, read-only, with a plain-language note per query, ready for Ravi to run on the live database. | S |

### P11 — Compile and hand over  (size S)

| Step | What | Check | Size |
|---|---|---|---|
| P11.1 | De-duplicate and rank | Drop anything already in the master list, merge duplicates, confirm every High finding in the main conversation, assign final severity. | S |
| P11.2 | Final report | One summary for Ravi: counts by kind and severity, top items, quick wins, items needing a decision, and the one recommended next build. | S |

## Part C — Method, finding format and how to resume

### C1 — Starting and resuming

- Ravi says **"start scan"** to begin at P0.1, and **"resume scan"** to continue after any interruption (usage limit, closed session, days later).
- A new session reads, in this order: `claude/scan-progress.md` (find NEXT STEP), `claude/scan-plan.md` Part C (this part), `claude/large-task-ground-rules.md`, then the findings file of the phase that holds NEXT STEP (`claude/scan-findings-pN.md`).
- A step marked **Done** is never repeated. A step marked **In progress** is repeated from its start (its findings were not saved yet). A step marked **Waiting** has not begun.
- The first message of a resumed session says in one line where the scan stands ("Phase 3, step 3.2 next, 14 findings so far") and carries on without asking.

### C2 — Doing one step

1. Mark the step **In progress** in `scan-progress.md` (only if the previous save succeeded).
2. Read the code and database objects the step names. Cheap checks first (search, line counts, SQL on the local database); open whole files only where the check needs it.
3. For every suspected issue, search the master list and `known-issues` (`project_search`) before writing it down. If tracked, skip it or, if the tracked note is wrong or incomplete, record it as "Update to existing item <ID>".
4. Verify before listing: reproduce on the local database or quote the exact code. Anything not confirmed is marked **Unconfirmed** with what would confirm it.
5. Rewrite the whole phase findings file (`project_write` replaces the file) with the new findings added, then mark the step **Done** in `scan-progress.md` with the finding count and move NEXT STEP on. Both saves happen before the next step starts.
6. Recalculate the **Progress report** block at the top of `scan-progress.md` (see C8) in the same save.
7. At most one short chat line per step, ending with the progress figure, for example `P3.2 done · 2 findings · scan 21 of 53 steps (46% weighted)`. No long recaps.

### C3 — Finding format

Each finding in `scan-findings-pN.md` is written as:

```
### SCAN-P3-07 — short title
- Severity: High | Medium | Low
- Kind: Bug | Integrity | Security | Gap | Enhancement | Inventory tightening | Formatting | Usability | Performance | Doc mismatch
- Where: screen / module ; file:line (or migration number and function)
- Finding: what is wrong, with concrete numbers or steps
- Evidence: quoted code or the SQL run and its result
- Suggested fix: one or two sentences, with rough size S / M / L
- Needs decision from Ravi: Yes / No (and what)
- Confidence: Confirmed | Likely | Unconfirmed
- Status: New | Duplicate of <ID> | Update to <ID>
```

**Severity.** High: wrong stock, wrong QC status, broken traceability, data loss, or a security hole that exposes data or lets a role do what it should not. Medium: a wrong figure, a blocked workflow with a workaround, or a notable weakness. Low: cosmetic, rare, or a small improvement.

**IDs.** `SCAN-P<phase>-<nn>`, numbered in the order found inside the phase (SCAN-P3-01, SCAN-P3-02, …). IDs never change. When added to the master list they keep the SCAN ID, and the master list assigns no new letter.

Each findings file also ends with **Checked and found sound** (a short list of what was verified correct, so the work is visible) and **Areas read** (files and migrations opened).

### C4 — Master list

- At the end of each phase, a new section **1F. Scan findings** in `claude/open-items-master-list.md` receives that phase's confirmed findings as table rows (ID, severity, kind, one-line summary, pointer to the findings file). The section and a scoreboard row are created when Phase 1 completes.
- Unconfirmed findings stay in the findings file only until confirmed.
- The master list and the findings file are both written before the phase is reported; the progress table gets "Master list updated: Yes".

### C5 — Evidence rules

- Read-only on the repository and on any real database. The scan changes nothing in the app.
- Reproductions run only on the local Postgres (`service postgresql start`, `scripts/dev/run-tests.sh` conventions, `invento_*` names untouched). Never against the live Supabase.
- Checks that need the live database are written as read-only SQL in `claude/scan-data-checks.sql` for Ravi to run in the Supabase SQL editor; he pastes back the results and they are analysed in a follow-up step.
- Anything on the live site is looked at only with Ravi's say-so, read-only, and never with real credentials entered by Claude.
- Hosted Supabase rules apply to every suggested SQL: no UPDATE or DELETE without WHERE; row cap 1,000 per request.

### C6 — What is not reported

Items already in the master list, standing decisions (see Part A7), pure style nits, and test data being present. Enhancements are reported only if they remove a risk, a manual error, a wrong figure or real extra effort for users.

### C7 — Reporting back

- After each phase: one short message to Ravi with counts by severity, the three most important findings, and "Phase N saved. Next: step X. Say 'continue' or stop here."
- At the end (P11): final report in `claude/scan-findings-p11.md` with counts by kind and severity, top findings, quick wins, items needing a decision, and one recommended next build.
- If a usage limit hits mid-step, nothing is lost: all earlier steps are saved, and "resume scan" repeats only the interrupted step.

### C8 — Progress report (how much of the scan is complete)

`claude/scan-progress.md` opens with a **Progress report** block, kept current after every step:

- **Steps done** — count of steps marked Done out of 53, with percentage.
- **Weighted progress** — small step = 1 point, medium = 2, large = 3 (total 82 points), so a large step moves the figure more than a small one. This is the percentage to quote.
- **Phases complete** and a per-phase table (steps done, points, % done, state: Not started / In progress / Done / Master list updated).
- **Findings so far** — total and split High / Medium / Low, plus how many are duplicates dropped.
- **Master list updated to** — the last phase whose findings are in the master list.
- **Last saved** — step id and date of the last save.

Rules: the block is recalculated from the step table every time, never estimated. A step counts only when marked Done after its findings are saved. At each phase end the chat report repeats the block. When Ravi says **"scan status"**, the current block is shown at once, without doing any scan work.
