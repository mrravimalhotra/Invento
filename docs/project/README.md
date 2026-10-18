# Project documents (snapshot, 18 Oct 2026)

Copies of the working documents kept in the Invento project on claude.ai, checked in so the repository carries the full story: what was built, what is open, what was found, what is waiting on Ravi, and how to continue. The Claude project copies stay the working versions; refresh these files when a delivery is closed out.

A path written as `claude/<name>.md` in these files means the file of that name somewhere in this folder (the table below says where). Module notes stay in `docs/modules/`, the User Guide in `docs/user-guide/`, and the read-only SQL checks in `scripts/sql/`.

## Start here (this folder)

| File | What it holds |
|---|---|
| `handoff-cloud-session-2026-10-18.md` | Where things stand, how to set up a new session, rules, what is waiting, next steps, SQL script inventory, starter prompt |
| `what-was-built-and-how.md` | What exists and how it was built |
| `open-items-summary-2026-10-18.md` | Short list of everything still open |
| `open-items-master-list.md` | Full register: open, parked, closed, tickets, decisions |
| `known-issues.md` | Pass-by-pass findings and fixes (Pass 53 to 87; passes 1 to 52 are in the Claude project archive, see below) |
| `deployment-log.md` | What is live, migrations run, delivery rows |
| `production-readiness-rating-2026-10-18.md` | Ratings by category |
| `go-live-readiness-log.md` | Go-live register G1 to G11 and switch-over checklist |
| `best-practices-nextjs-supabase.md` | Technology-only best practices for similar apps |

## `scan/` (full-app scan, 10 to 11 Oct 2026: 140 findings)

| File | What it holds |
|---|---|
| `scan-findings-p0.md` to `scan-findings-p11.md` | Findings by phase (P0 set-up, P1 access and sign-in, P2 master data, P3 purchase and stock, P4 QC and COA, P5 production, P6 packaging, P7 reports and shared screens, P8 other modules, P9 compliance gaps, P10 concurrency and limits, P11 ranking into fix bundles). Each finding has evidence and a suggested fix. |
| `scan-findings-by-group.md` | The same 140 findings grouped by kind, with the decision each needs |
| `scan-plan.md`, `method.md`, `inventory.md`, `scan-progress.md` | How the scan was planned and run, the inventory of screens, tables and functions it covered, and its progress log |

These are the scan-time records. A finding's current status (fixed, accepted, open) is in `open-items-master-list.md` Part 1F and in `known-issues.md`.

## `plans/`

| File | What it holds |
|---|---|
| `fp-retest-plan.md` | Finished product retest design (built as migration 0120) |
| `live-walk.md` | Live walk findings LW-01 to LW-11 |
| `environments-plan.md` | Separate test and production environments |
| `opening-stock-plan.md` | Opening stock design |
| `date-validation-review.md` | Date rules review |
| `scope-changes-log.md` | Scope changes and decisions |
| `session-handoff-2026-10-12.md` | Earlier handoff (history) |

## `rules/`

| File | What it holds |
|---|---|
| `working-agreement.md` | How to work with Ravi: step by step, literal instructions, approved mockups, message style, keep the master list current |
| `large-task-ground-rules.md` | Rules for large multi-step tasks |

## `archive/`

Historical SQL (scan evidence, one-off audit check). Not for the live database. See `archive/README.md`.

## Only in the Claude project (not copied here)

Long, closed history and older design notes. They are not needed to continue the work; ask for any of them to be added here.

- `known-issues-archive.md` (passes 1 to 52), `deployment-archive.md`
- `bug-fix-prompts.md`, `bug-log-2026-09-19.md`, `e2e-test-results-jatamansi-tail-2026-09-19.md`
- `app-accuracy-audit-2026-09-28.md`, `app-accuracy-fix-plan.md`, `security-bundle-decision.md`, `ai-testing-security-performance-reference.md`, `pre-production-review-prompt.md`
- `feedback-oct-2026.md`, `feedback-status.md`, `open-requirements-log.md`
- `inventory-ledger-redesign.md`, `packaged-fp-redesign.md`, `packaging-issue-identifier-options.md`, `fb-0043-production-rm-qc-implementation-plan.md`, `hosting-options-evaluation.md`
- `first-draft-overview.md`, `requirements-gap-analysis.md`, `software-point-3-gap-analysis.md`, `data-gap-analysis.md`, `legacy-data-mapping.md`
- `master-list-builder.txt` (retired pointer)
- SQL: `task_f_live_test_cleanup.sql` (destructive one-off, already run), `backup-before-purge-2026-09-13.sql` (data dump), and the superseded `scan-data-checks.sql` and `scan-invariants-*.sql`
