---
title: Scan findings — Phase 0 (set-up and baseline)
---

# Phase 0 — Set-up and baseline

Status: P0.1 and P0.2 Done (10 Oct 2026). Phase 0 complete.

## P0.1 — Known-items index (what is already tracked, so it is not re-reported)

Source: `claude/open-items-master-list.md` (updated 10 Oct 2026, `main` = ab0b140, 108 migrations). Before logging a finding, check this index by keyword; if it matches, skip it or record "Update to <ID>". Anything not covered is searched in `known-issues.md` and `open-requirements-log.md` with `project_search`.

| Theme | Already tracked (ID: subject) |
|---|---|
| **Access and roles** | B1/DES-01 everyone with a role reads everything; B14 finer role model; B22 purchase limited to Production In-charge, QC limited to reports; D1/SEC-02 feedback readable by all; SEC-07 last admin and E19 self-demotion (fixed); SEC-01 self-registration closed (fixed); D10 disabled user's token valid up to an hour |
| **Sign-in, passwords** | B3/SEC-09 MFA undecided; B19 only 10-character minimum, no expiry; SEC-03 open redirect (fixed); E6 account flows not live-tested |
| **Security headers, platform** | SEC-10/C15 CSP report-only; C5/SEC-05 document links accept any URL; C6/SEC-08 bulk upload reads whole file; C7/SEC-11 no text length limits; C8/SEC-13 purge has no environment guard; D12/SEC-14 `expire_stale_fp_drafts` no role check; D15 exceljs uuid advisory; B12 LAN-only access; B11 hosting; B10 backup/restore policy; B40 separate environments; C14 tests/CI |
| **Audit trail** | DES-02 complete audit trail (fixed); D11 audited accounts cannot be deleted; E8 audit log size |
| **Integrity of stock** | ACC-01/27 PO reopen (fixed); ACC-02/29 single unit (fixed); ACC-21 stock position reconciles (fixed); C12/SX-2/DQ-14 negative legacy packaging stock; SX-3 sufficient-stock checks (done); FIFO hard rule E22/0090; C16 views recompute ledger (measured); B24 wastage on production-issued RM batches; B41 rejected stock (built) |
| **Items and master data** | A12/DES-10 vendor duplicate names (fixed); D26 duplicate checks app-level only; B29 unit list lacks 0.1 kg; B28 doc_type for label/COA templates; C10 sample unit at purchase not stored; B21 control sample for packaging; D21 sample defaults on purchase line; E20 item type mandatory for RM; FB-0039 "nos" unit; D29 "Part Used" rejected |
| **Purchase** | B9 purchase intimation Word/Excel; B5 vendor credit/debit balance; B23 vendor address on form (done); E5 single-screen New PO unresolved; DES-11 over-sampling (fixed); D9 / "Purchase bulk RPC gaps" PO number gaps |
| **QC** | D6 two-round QC; D7 retest per batch; B15 retest alert (done); FB-0058/0061 expiry, 180 days, 3 retests (E31, built); ACC-10/16/39 retests (fixed); E9 production-batch retest not exercised; B44/FB-0060 FP stability reminders (needs answers); B34 QC told of FP batch (built) |
| **COA** | B2/DES-09 COA wording editable; B17 COA file is a URL field; FB-0053 templates per item/MFR (built); FB-0036 QC report PDF (on hold, C4); E30 COA dates locked on screen only, not server |
| **Labels** | B33/FB-0048 one label vs six (open); B25 labels for production-sourced RM batches; D19 label picker not filtered by QC; D20 in-process Start Date/Retest blank; ACC-14 approved-label guard (fixed); B8 barcode scanning |
| **MFR and finished product** | D13 no recipe versioning; B27 legacy MFRs not backfilled; C2 MFR/BMR format Word/PDF hold; C3/FB-0038 Line Clearance to BMR (hold); C9/L-2 Env control ranges; DES-07/A10 bulk MFR; FB-0050 short batch number (E28); A5 finish ≥ start date |
| **Packaging** | D23/D24 packaging decisions; C11 one packaged item per FP; C19 phone fit; B21; FB-0051/0052 (built); ACC-19/20 (fixed) |
| **Reports and exports** | C17/PERF-05 Reports/Item Master send every row; D17 ledger Excel up to 1,000 events; C2 export (a); D5 no export on Item Type Master, Feedback, User Roles; B9; ACC-35 purchase register (fixed) |
| **Bulk upload** | C6/SEC-08; D9 failed upload burns code numbers; D26; E3 live bulk upload never run; B20 test-data upload and testing agent |
| **Opening stock and legacy** | B4 built (E33–E35); not built: reopened opening-stock PO is still editable; B30 legacy sample small; D22/D25 legacy decisions; DQ-1 to DQ-14 data notes; ACC-11/C1 RM Report as-on-date shows today (item-level now covered by Stock Statement) |
| **Dashboard** | ACC-26 counts vs lists (fixed); D16 movement chart legacy test; E16 retest/expiry cards |
| **Inventory reports (built 6–10 Oct)** | Stock Position by QC (E38), Stock Statement (E41, E44), Batch Trace (E39), Ageing (E42), Retained Samples (E43), Rejected Materials (E37); Part 5: item 6 stock value only if finance wants it |
| **Time, numbers, display** | ACC-13 India time (fixed); ACC-28 3 decimals; A24/E30 date entry rules; L-4 hydration; FB-0026 dd-mm-yyyy |
| **Deprecated** | D2/D3/ACC-41 BMR module; C3, C4 on hold |
| **Process** | Patch delivery rule; C18 SQL scripts not in repo; D14 test data may stay |

### Not in the master list (checked by absence)

These topics have **no** entry in the master list and so are open for the scan: stock adjustment / physical count; deviation, OOS, change control, CAPA, complaints and recall register; supplier qualification; training records; calibration due alerts; e-signature rules; notifications outside the app; data retention; session timeout and lockout; export/CSV injection; read audit; concurrency on PO edit and compose; index and N+1 review beyond PERF-01..07; accessibility; documentation accuracy beyond Part 6.

## Findings (P0)

None yet.

## P0.2 — Local test database (Done)

- `main` = ab0b140. `scripts/dev/run-tests.sh` rebuilt `fresh-install.sql` and ran all 26 suites: every line matches `expected.txt` (sec07 41 pass / 1 fail is the known baseline).
- A working database `scanw_db` (fresh install, India time) holds the catalog for the catalog queries in P1.3, P1.4 and P10.3. It is a scratch copy on the cloud workspace; nothing else was touched.
- Object counts from the catalog: **34 tables, 12 views, 155 functions** in schema `public`. (Part A of the plan quoted 22 views and about 209 functions; those were counts of `create view` / `create function` statements including re-definitions. The catalog figures are the true ones.)
- A seeded realistic data set is not built up front. Each later step that needs data builds a small one in a throw-away copy of `scanw_db`, which keeps `scanw_db` clean for catalog work.
