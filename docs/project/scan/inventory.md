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
