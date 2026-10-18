# Invento: what has been built, and how

Written 18 Oct 2026 for Ravi and for any new working session. Source of truth for each point is the code in the repository and the other project documents named in brackets. Nothing here is a plan; planned and open work is in `claude/open-items-summary-2026-10-18.md` and `claude/open-items-master-list.md`.

## 1. What Invento is

Inventory, quality control (QC) and manufacturing software for **Atharva Nature Healthcare Pvt. Ltd.** (licence line "PD/AYU/111", editable in the app under Admin, Company Details). It replaces a legacy desktop app and paper registers. It covers a small herbal and Ayurvedic medicine plant: buying raw and packing material, testing it, making finished product from an approved master formula, packing it, labelling it and reporting on stock.

- **Not live.** Every record in the app is test data; real data is expected 1 to 3 months after 29 Sept 2026. Go-live work is tracked in `claude/go-live-readiness-log.md`.
- **Live address:** https://invento-atharva.vercel.app. **Code:** GitHub `mrravimalhotra/Invento`, branch `main`. Vercel deploys `main` on every push.
- **Size today (18 Oct 2026):** 120 migrations, about 41,000 lines of TypeScript, 39 database test suites, 25 module notes, a 39-page User Guide PDF and a process map.

## 2. Technology

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 16 (App Router), React, TypeScript | The repo's `AGENTS.md` warns that this Next.js version differs from older ones; read `node_modules/next/dist/docs/` before using an API from memory. `proxy.ts` replaces the old middleware. |
| Server writes | Server Actions in `lib/actions/<module>.ts` | zod validation, then `supabase.from()` or an RPC, then `friendlyDbError` |
| Database | Supabase Postgres with row-level security | Tokyo region, free plan today |
| Hosting | Vercel | Free plan today; function region still default |
| Documents | `jspdf`, `docx`, `exceljs` | Loaded on click, never on page load |
| Fonts | Noto Sans embedded in PDFs | Covers the rupee sign, macron letters and Hindi (no joined forms) |

## 3. People and roles

Six fixed roles, defined in `lib/constants/roles.ts` and mirrored by database policies:

| Role | In practice |
|---|---|
| System Admin | Everything; manages users, company details, opening stock, purge; exempt from the different-person QC rule (Ravi's decision) |
| Inventory Manager | Items, vendors, purchase, packaging, finished product, labels |
| MFR Manager | Master formulae (MFR), items |
| Quality Checker | QC Round 1 |
| QC Reviewer | QC Round 2, retest, void a rejection |
| Super Auditor | Read-only; also allowed to load opening stock (Ravi kept it) |

`MODULE_WRITE_ROLES` hides buttons only. **The database is the real check**; every rule is also enforced by a policy, trigger or function.

## 4. What each module does

| Module (folder under `app/(dashboard)/`) | What it does | Key rules |
|---|---|---|
| Items, Item Types, Vendors | Master data with codes (RM-001 style for raw material, 5 digits for the rest) | Names compared ignoring case and spaces; category locked once stock, QC or recipes exist; deactivating an item with stock is refused; vendors can be made inactive |
| Purchase | Purchase order (draft, edit, Final Submit, Reopen), lines with QC / Stability / R&D sample quantities, invoice and Received-on dates | Submit books stock; Reopen is refused once QC has a record on a batch; 10-times-last-purchase warning; quantity and price ceilings |
| Quality Control (`qc`) | Two-round review of every raw material batch and finished product batch | Round 1 Quality Checker fills the COA template results with a written reason; Round 2 QC Reviewer may edit and then owns the certificate results; a Round 1 rejection is only a proposal until Round 2 confirms or sends it back; a rejection can be voided with a reason; every step is kept in a decision history |
| Retest | Same cycle for raw and finished product | Max 3 retests, each up to 180 days; the 3rd takes only an expiry date; a retest never extends expiry; expired material is never retested; a retest date can never fall after the expiry date; the sample comes from the stability sample, then the bulk |
| MFR | Master formula with recipe lines, procedure, batch size; approval creates the finished product and packaged items | Recipe versioning is off; edit only before approval |
| Finished Product | Draft, Create Batch (In Process), Complete Batch, Submit to QC; component draw is first-in-first-out by arrival date | Yield outside the MFR range needs a reason; above 150% is refused; QC is told when a batch starts |
| Packaging | One kind of issue: Pack. Store, R&D and Production issues with up to 30 lines | Bulk left = yield minus QC, stability and R&D samples, retest samples and packaged quantity; packing and labels are refused for an expired, retest-overdue or retest-in-progress batch |
| Labels | Raw material and finished product labels (6 per sheet, JPEG download) | Search runs on the server; "Approved" labels only for approved batches; exact Best Before date |
| COA | Certificates of Analysis, templates per item and per MFR, template register | Header and tests are rebuilt from the batch and template; the company block is copied onto each issued certificate |
| Inventory | Stock Position (usable and not usable by QC status), Ledger, Rejected Materials, Batch Trace, Stock Statement, Expiry & Retest Ageing, Retained Samples, Stock Integrity Check | See section 6 |
| Opening Stock | Load existing stock by Excel or typed rows; raw material, packaging, finished product | All-or-nothing load with a load number, Legacy tag, undo while loading is open, System Admin closes by hand |
| Bulk Upload | Excel upload for eight kinds of master and transaction data | 500-row and 800 KB limits, all-or-nothing, named row errors |
| Reports | QC, finished product, purchase and RM registers, Excel and PDF | One date format, one money rounding rule |
| Dashboard | Cards for what needs attention (low stock, QC waiting, retest and expiry due) | Counts match their lists |
| Admin | User Roles & Access (create, disable, rename, roles, auto sign-out setting), Company Details, Audit Log, Stock Integrity Check, Purge Test Data | Audit Log has filters, paging and Excel download |
| Feedback | Tester ticket widget on every page; admin triage | FB-0001 to FB-0061 |
| User Guide | Searchable guide and Process Map, PDF download | Rebuilt with each release by `scripts/build-user-guide-pdf.py` |
| Deprecated | BMR, Line Clearance, Environmental Control | Ignore unless Ravi asks. Scan findings about them are set aside. |

## 5. How the database is built

- **Ledger.** `inventory_ledger` is append-only. Stock figures come from views (`stock_balance`, `item_position`, `item_stock_status`, `batch_ageing`, `retained_samples`) and functions (`stock_statement`, `trace_batch`). Corrections are compensating entries. A summary table was measured and judged unnecessary below about 5 million ledger rows.
- **Stock Integrity Check.** `stock_integrity_check` runs checks S1 to S9 and explains each difference in words. Run it after each release.
- **Workflow guards.** Triggers refuse impossible status changes and direct client writes that bypass the screen (`_is_direct_client_write()`).
- **SECURITY DEFINER functions** all `set search_path` and check the role at the top; stock-moving functions take locks.
- **Numbers.** Sequence-backed; padding is a minimum width; year-based numbers use India time (Asia/Kolkata).
- **Audit.** A trigger writes an audit row for every business table, plus sign-in, sign-out, failed sign-in and password-change events.
- **Security.** Row-level security on every table; the anonymous key is locked out of tables, views, sequences and functions; self-registration is closed; automatic sign-out after inactivity (default 60 minutes, System Admin excluded).
- **Migration themes (by number).** 0001 to 0069 foundations and early fixes (ledger, QC retest, FIFO units, batch numbers); 0070 to 0075 workflow guards, audit trail, security hardening; 0076 to 0084 units, PO reopen, packaging integrity, India time, current QC approval, dashboard counts; 0085 to 0099 hardening, performance indexes, packaging multi-line, COA templates per item and MFR, expiry date, AR number format; 0100 to 0108 opening stock, rejected materials, stock status, batch trace, stock statement, ageing and samples; 0109 to 0117 scan fix groups (purchase, figures, clean-ups, approved-batch locks, security, reliability, data integrity, limits, accounts); 0118 to 0120 integrity check wording, QC results and rejection control, finished product retest. Latest is **0120**; the next is **0121**.

## 6. How a change is built and tested

1. Branch from `origin/main` in the cloud clone. Stage files by name.
2. `npx tsc --noEmit`, `npx eslint <files>`, `scripts/dev/run-tests.sh` (39 suites, about 7 seconds on a local Postgres) compared with `supabase/tests/expected.txt`, then `next build`.
3. A migration ships with its SQL, a regression suite `supabase/tests/part_*.sql` (helpers `t_ok`, `t_fail`, `t_check`), an expected line, a regenerated `supabase/fresh-install.sql` (`node scripts/build-fresh-install.mjs`) and a line in `docs/modules/`.
4. `git format-patch` writes one patch; the patch and any SQL are delivered into `C:\MyApps\Invento\invento-v2`.
5. Ravi runs the SQL in the Supabase SQL Editor first, then `git am`, `git push origin main`, deletes the files and sends a screenshot.
6. Close-out: `git fetch`, content diff against the delivered branch, then update the deployment log, the known-issues log, the open-items master list and the memory file.

Testing facts worth knowing: `quality_checks.retest_date` is recomputed by a trigger from `reviewed_at` plus the period, so tests backdate `reviewed_at`; packaging inserts in tests run as the owner because of row-level security; the suite runner needs a new suite added to both its `FILE` map and its `ORDER` array.

## 7. Timeline of the work

| When | What |
|---|---|
| Late Aug 2026 | First build; legacy import sample; Item, Vendor, Purchase, QC, MFR, Finished Product, Inventory Ledger |
| 1 to 13 Sept | First audit (H, M, L items), unit conversion, duplicates, bulk upload (eight modules), purge tool, packaged finished product |
| 14 to 30 Sept | Packaging redesign, two-round QC, FIFO hard rule, accuracy audit ACC-01 to ACC-41, security review SEC-01 to SEC-14, design review DES-01 to DES-14, performance indexes, exports and PDFs, mobile menu and install |
| 1 to 5 Oct | Tester tickets FB-0045 to FB-0061: short batch numbers, packaging multi-line, COA templates, expiry date, AR number format, opening stock (two parts), company details, rejected materials |
| 6 to 10 Oct | Inventory reporting: stock by QC status, stock statement, batch trace, expiry ageing, retained samples; QC "in progress" card |
| 10 to 11 Oct | Full-app scan: 11 phases, 140 findings, ranked into 17 fix bundles; accepted-risk decision for direct API use |
| 11 to 12 Oct | Fix groups 1 to 5, documentation clean-up, security, reliability, data integrity, convenience, PDF, limits and accounts groups |
| 12 Oct | Sign-in log, opening stock typed in, quick wins, QC results and rejection control, live walk and its fixes, finished product retest (`93de17e`, migration 0120) |
| 17 to 18 Oct | Best-practices guide for Next.js + Supabase, production-readiness rating, go-live readiness log, mobile plan, this handoff |

## 8. Scan results at a glance

140 findings from the full-app scan: **86 fixed**, 14 accepted as risk, 3 set aside (deprecated modules), **36 open** (0 High, 12 Medium, 24 Low), 2 of those parked (SCAN-P10-08, SCAN-P7-16). Detail: `claude/scan-findings-p0.md` to `p11.md`, `claude/scan-findings-by-group.md`, `claude/scan-progress.md`.

## 9. Documents that explain the rest

| Need | Read |
|---|---|
| Start a session | `claude/handoff-cloud-session-2026-10-18.md` |
| Everything known and open | `claude/open-items-master-list.md` (full), `claude/open-items-summary-2026-10-18.md` (short) |
| What is live | `claude/deployment-log.md` |
| What was found and fixed, pass by pass | `claude/known-issues.md`, `claude/known-issues-archive.md` |
| Go-live | `claude/go-live-readiness-log.md`, `claude/environments-plan.md` |
| How good it is | `claude/production-readiness-rating-2026-10-18.md` |
| Rules for other apps | `claude/best-practices-nextjs-supabase.md` |
| Per-module behaviour | `docs/modules/*.md` in the repository |
