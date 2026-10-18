# Invento: production readiness rating (18 Oct 2026)

Ratings out of 10, based on the open-items master list (as of 12 Oct 2026, plus the 18 Oct go-live decision), the scan results and the live walk. Ravi's request: rate the app by category, considering production readiness and the parked items.

**Overall: 7 out of 10 as an internal tool for a small team. About 5.5 as the only system of record for a regulated plant today.** No High findings are open. The app is ready for a supervised pilot on real data with paper kept as a fallback. It is not ready to replace paper.

| Category | Score | Why | What would raise it |
|---|---|---|---|
| Core functionality | 8 | Purchase, QC, finished product, packaging, labels, COAs, opening stock, Batch Trace and reports are built and live | Barcode scanning (B8), alerts by e-mail (P9-07) |
| Data correctness and integrity | 9 (was 8.5) | Append-only ledger, Stock Integrity Check, 121 migrations, 40 database suites | LW-11 false alarm fixed (migration 0122) |
| Security | 7 | Row-level security, anonymous key locked out, audit log, auto sign-out, headers. Open: MFA undecided (B3), content security policy report-only (C15), everyone with a role reads everything (B1), purge has no environment guard (C8), 13 direct-API findings accepted as risk | MFA decision, purge guard, enforce CSP, read scoping if the user group widens |
| Compliance and auditability | 6 | Audit log is strong. Missing: deviations, out-of-specification, change control, CAPA (P9-01); signed batch record before release (P9-03); void or replace a certificate (P4-09); void a mistaken packaging issue (P6-01); correct or close a finished product batch (P5-04); second person on MFR approval (P5-01) | The "corrections group" (P4-09, P6-01, P5-04, P8-01) and a decision on paper versus electronic batch records |
| Reliability and operations | 4 | No backup policy (B10), no separate test and production (B40), no CI (C14, P10-08), built-in e-mail sender, database in Tokyo while users are in India. **Deferred to go-live with the move to Supabase Pro and Vercel Pro** (Ravi, 18 Oct 2026); tracked as G1 to G7 in `claude/go-live-readiness-log.md` | Close G1 to G7; expected to rise to about 8 |
| Performance and scale | 7 | A 400,000-row ledger measured fast; Reports and Item Master still send every row to the browser (C17), about 23 MB per visit with the legacy sample loaded | Default date window with "Load all", or server paging |
| Usability | 7.5 | Search, sorting, hints, banners, due-for-retest cards, User Guide | Single-label choice (B33), barcode, e-mail alerts |
| Mobile | 6 | Menu, install to home screen, 40 px targets, pinned first column done. Wide tables and forms parked (C19). The E58 phone changes are not confirmed on a real phone | Four-step plan in the handoff document, section 8 |
| Testing | 7.5 (was 6.5) | Database suites are excellent (41). Since 18 Oct: 30 unit tests of the app's own rules (`npm test`: FIFO, units, money, limits, QC states, ageing, dates, error messages); `live-data-checks.sql` and the Stock Integrity Check run on the live database after each delivery; the data side of 20 live checks confirmed. Still: no screen tests, nothing runs on a push (CI deferred to go-live) | Workflow on staging push (G4), clear the live checks |
| Documentation | 9 | User Guide, process map, 25 module notes, deployment and issue logs, decisions list, handoffs | Keep current |
| Maintainability | 7.5 | One rule in one place, a regression test per past bug, shared helpers. Cost: dense migration history and a long open-items list | Retire closed history to archives |

## Go-live blockers (in order)

1. Backups and a tested restore (G1).
2. A separate production environment in Mumbai, and the Vercel region (G2, G3).
3. Void and correction paths, so a mistake never needs a SQL script (P4-09, P6-01, P5-04).
4. E-mail sender and the alerts decision (G5).
5. The live-check backlog cleared, starting with E70 (G10).
