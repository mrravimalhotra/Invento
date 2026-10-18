# Invento: detailed handoff to a new (cloud) session, 18 Oct 2026

Read this first in a new session. It replaces `claude/session-handoff-2026-10-12.md` (keep that one as history). It says where things stand, how to set up, the rules Ravi works by, what is waiting on him and what to do next. A ready-to-paste starter prompt is at the end.

## 0. If you only have five minutes

1. `main` = `b5ea6d0` or later, live on Vercel (code last changed at `93de17e`; later commits are documents, scripts and the 0121 pipeline check). Migrations run in Supabase up to **0121**; the next is **0122**. Nothing is pending or undelivered. **Since 18 Oct 2026 Claude pushes to `main` itself and Supabase applies migrations from `main`** (section 3); patches are no longer used.
2. Read, in this order: this file, `claude/deployment-log.md` (Current state block only), `claude/open-items-summary-2026-10-18.md`.
3. Ravi's pending answer: **"go"** for a read-only phone-width walk of the app (section 8), or "go" on the corrections group, once he has run live check E70.
4. End every reply to him with exactly **one** recommended next step.

## 1. Who and what

- **Ravi** owns Invento: a Next.js 16 + Supabase inventory, QC and manufacturing app for Atharva Nature Healthcare Pvt. Ltd. (licence "PD/AYU/111"). He is not a developer by trade (data warehousing and release-train background), so explain in plain words and give him exact steps. Reply in English.
- All data is **test data**; real data is expected in 1 to 3 months. Go-live moves both Supabase and Vercel to Pro plans.
- Full description of what exists and how it works: `claude/what-was-built-and-how.md`.

## 2. Setting up the new session

| Need | How |
|---|---|
| The repository | Cloud clone was at `/home/claude/invento-app` (branch from `origin/main`). If it is gone: clone `mrravimalhotra/Invento` through the session's GitHub connection (`gh api` works for the REST API), or stage the repo files from `C:\MyApps\Invento\invento-v2` with the device tools. Then `npm ci`. |
| Project map and commands | The repo's `CLAUDE.md` (31 lines) and `AGENTS.md`. Read them instead of exploring. |
| Database tests | `scripts/dev/run-tests.sh [suite...]` needs a local Postgres. Check `which psql pg_ctl postgres`; install with the system package manager if missing. Output must match `supabase/tests/expected.txt` (40 lines; latest `mp121 1 0`). |
| Skill | `invento-delivery` (repository, `.claude/skills/invento-delivery/SKILL.md`) holds the delivery workflow. Load it before building or delivering anything. The account skill `invento-patch-delivery` is retired (old patch method). |
| Memory | `/projects/01a03e97-a48e-741d-aa6d-66b350bb0f21/areas/invento.md` (decisions and status), plus `.../preferences.md`. Read before fix or deploy work; append new decisions. |
| Project docs | The Invento project holds about 70 documents under `claude/`. Search with `project_search`; read only the section you need. |
| Ravi's computer | Linked folder `C:\MyApps\Invento\invento-v2`. Not used for delivery any more (patches retired 18 Oct 2026); his clone catches up with `git pull`. |
| Supabase | Claude's Supabase connector (project `zsmsdssfdtwpkonaaahp`): write tools blocked; Execute SQL allowed, used for read-only queries only (checking a migration applied, `scripts/sql/live-data-checks.sql`, data for live checks). Never write to live data from a session. |
| Live site | https://invento-atharva.vercel.app. Read-only walks use his signed-in Chrome. **Never create accounts or type passwords.** |

## 3. Rules Ravi works by (standing)

- Build on a branch from `origin/main`. Stage files by name, never `git add -A`. No destructive git commands unless he asks.
- Run `npx tsc --noEmit`, `npx eslint <files>`, the database suites and `next build` before delivering.
- Deliver by pushing (`docs/GIT-WORKFLOW.md`): push the session branch, then `git push origin <branch>:main`. Vercel deploys `main`; Supabase's GitHub integration applies new files in `supabase/migrations`. Ravi does not paste SQL, apply patches or push. Never run a migration by hand in the SQL Editor (it is not recorded, so the integration would run it again).
- After the push: confirm a migration in `supabase_migrations.schema_migrations` through the Supabase connector (read-only), then update `claude/deployment-log.md`, `claude/known-issues.md` (next pass number), `claude/open-items-master-list.md`, and the `docs/project` copies. The delivery skill is `invento-delivery` in the repository (`.claude/skills/invento-delivery/SKILL.md`); the older account skill `invento-patch-delivery` describes patches and is retired.
- Ask product decisions with the multiple-choice tool and always include a **Park it** option. Record the answer.
- Do not touch **FB-0038 and FB-0036**. Deprecated BMR, Line Clearance and Environmental Control stay untouched. Printed identity: "Atharva Nature Healthcare Pvt. Ltd." and "PD/AYU/111".
- Keep tool output short. Do not read whole project docs. Replies: one or two sentences on the outcome, no step recaps.
- The session can push. A "Stop hook" about an unpushed branch means something is not pushed yet: push it.
- Decisions on record that must not be re-asked: SEC-02 accepted by design; SEC-05, SEC-08, SEC-11, SEC-13 no action; ACC-11 parked; ACC-41 no action; packaging is Pack only; MFA undecided; C14 tests/CI deferred; C15 CSP enforcement on hold; C16 summary table not needed until about 5 million ledger rows; C17 Reports/Item Master paging and C18 loose SQL scripts on hold; 13 direct-API findings accepted as risk (11 Oct); all roles may load opening stock; System Admin exempt from the different-person QC rule.

## 4. What was done in the last stretch (12 to 18 Oct 2026)

| Item | Result |
|---|---|
| Finished product retest rebuild | Live at `93de17e`, migration 0120, suite fr120 67/67, live check E70 waiting. Same cycle as raw material; packing and labels blocked for expired, overdue or in-retest batches; a retest date can never exceed expiry; closes SCAN-P4-04 and LW-01. Ravi's answers: block packaging and labels; opening stock gets a "Retests already done" column; refuse a retest that runs past expiry; packs are bulk only. |
| Best-practices guide | `claude/best-practices-nextjs-supabase.md`: technology-only (no inventory, QC or pharma content) checklist for any Next.js + Supabase app. Reworked once at Ravi's request to remove domain content. |
| Readiness rating | `claude/production-readiness-rating-2026-10-18.md`: 7/10 overall, reliability 4 (weakest), mobile 6, compliance 6. |
| Go-live decision (18 Oct) | Backups, separate environments, automatic checks, e-mail delivery and the Mumbai region move are handled at go-live with the Pro plans. Recorded in `claude/go-live-readiness-log.md` (G1 to G11) and in the master list. |
| Mobile plan | Agreed outline in section 8; waiting for "go". |
| This handoff pack | Four new documents plus Pass 85 in the known-issues log. |

## 5. Current state of the live system

| | Value |
|---|---|
| GitHub `main` | `b5ea6d0` or later (last code change `93de17e`) |
| Supabase migrations run | up to `0121_migration_pipeline_check.sql` (applied by the GitHub integration) |
| Pending delivery | none |
| Next migration number | `0122` |
| Database test suites | 40, all expected lines pass |
| Cloud clone | local branch `fpretest22` may show "ahead 1, behind 1" against `origin/main`; that is only the re-authored hash. Start new work with `git fetch origin && git checkout -B <new-branch> origin/main`. |

## 6. Waiting on Ravi

- **Live checks E62 to E70** (E70 first). For E70 he needs a finished product batch whose retest date has arrived; offer the SQL line that moves a batch's approval back, or Opening Stock with a past retest date.
- **Decisions:** B45 (invoice date versus received date per output), P6-04 (production raw material QC), P4-09 (void certificates), LW-11 (S9 false alarm), MFA, P9-01 (deviations and CAPA: paper or app).
- **Before go-live:** run `scripts/sql/live-data-checks.sql` on the live database, one block at a time (section 12; go-live log G10).
- **Quick win:** Vercel Function Region to Tokyo (hnd1) and redeploy.
- **"Go"** on the corrections group (P4-09, P6-01, P5-04, P8-01).
- **Parked by him:** B10 (backups; now go-live), P3-07, P3-14, P8-06, P7-16, P10-08.

## 7. Recommended order of work

1. Ravi runs E70 and sends a screenshot (or asks for the SQL line).
2. Mobile: the phone-width walk (section 8), then two patches. No SQL.
3. Corrections group (void and correct paths): needs migration 0122 or later. Ask the decision questions first.
4. LW-11 fix (small migration): confirm RM-00004-02/26 in the ledger before changing the check.
5. Go-live preparation (section 9) when Ravi sets a date.
6. Remaining scan decisions in groups of four, each with a Park option.

## 8. Mobile plan (agreed outline; waiting for "go")

Gap: the wide tables and forms are parked (C19), and the phone changes from E58 are not confirmed on a real phone.

1. **Ravi checks E58 items 3 and 4 on his phone** (taller buttons, pinned first column with "Swipe sideways" hint, menu focus, skip link). About 5 minutes.
2. **Claude walks every screen at about 390 px wide**, read-only, in Ravi's signed-in Chrome (resize the window; do not click anything that saves). For each screen record: page-level sideways scroll, forms that overflow, small buttons, clipped dropdowns, unreadable tables. Write findings to `claude/mobile-walk.md`.
3. **Ravi decides the phone-first set.** Suggested: receiving and purchase lines, QC decision and results, packaging issues, label printing, Dashboard. Reports, ledger, Stock Statement and other wide registers stay as sideways tables with the first column pinned.
4. **Two patches, no SQL.** Patch 1 for the phone-first screens: one card per row instead of a wide table, forms in one column, Save and Submit kept in view at the bottom. Patch 2 for the rest. Raise touch targets from 40 px to 44 px, keep inputs at 16 px text, `inputmode="decimal"` on number boxes. Finish line: no sideways page scroll at 360 to 400 px, tested on one iPhone and one Android.

Technical rules are in `claude/best-practices-nextjs-supabase.md`, section 8.

## 9. Go-live preparation

Register and ten-step checklist: `claude/go-live-readiness-log.md`. Plan for environments: `claude/environments-plan.md`. Reminder on record: create the production Supabase project in **Mumbai (ap-south-1)** and set Vercel Function Region to **Mumbai (bom1)**; today the project is in Tokyo. Add the purge guard (C8) before real data. Scan P8 notes that README and SUPABASE_SETUP are out of date; fix before building the second environment.

## 10. Lessons and traps from this work

- **Never compute one figure two ways.** "Bulk left" lived in four places; a change missed one. Put a formula in one SQL function and search for copies.
- `quality_checks.retest_date` is recomputed by a trigger. Tests must backdate `reviewed_at`.
- A new test suite prints nothing until it is added to `run-tests.sh` (FILE map and ORDER array) and `expected.txt`.
- The latest definition of a function wins across migrations; `grep` earlier copies before editing.
- `create or replace view` can only add columns at the end; otherwise drop and recreate.
- "use server" files may export async functions only.
- PostgREST returns at most 1,000 rows silently: always page with `.range()` and end the order with `id`.
- A missing flag shown as a visible tag caused a false "Legacy" tag on app-made rows; show tags only when the value is exactly true.
- Stop-hook "unpushed branch" messages are expected; ignore with a brief reply.
- The live walk covers only what was clicked; it did not cover Batch Trace results, forms, downloads, sign-in or Profile.

## 11. Where everything is

| Document | Purpose |
|---|---|
| `claude/handoff-cloud-session-2026-10-18.md` | This file |
| `claude/what-was-built-and-how.md` | What exists and how it was built |
| `claude/open-items-summary-2026-10-18.md` | Short list of everything still open |
| `claude/open-items-master-list.md` | Full register (open, parked, closed, tickets, decisions) |
| `claude/known-issues.md`, `known-issues-archive.md` | Pass-by-pass findings and fixes (latest Pass 88) |
| `claude/deployment-log.md`, `deployment-archive.md` | What is live, migrations, delivery rows |
| `claude/production-readiness-rating-2026-10-18.md` | Ratings by category |
| `claude/go-live-readiness-log.md` | Go-live register G1 to G11 and switch-over checklist |
| `claude/best-practices-nextjs-supabase.md` | Technology-only best practices for similar apps |
| `claude/scan-*` | Full-app scan plan, findings P0 to P11, evidence SQL |
| `claude/live-walk.md` | Live walk findings LW-01 to LW-11 |
| `claude/fp-retest-plan.md` | Finished product retest design |
| `claude/environments-plan.md`, `opening-stock-plan.md`, `date-validation-review.md` | Plans |
| `claude/working-agreement.md`, `large-task-ground-rules.md` | How to work with Ravi |
| `scripts/sql/README.md`, `scripts/sql/live-data-checks.sql` (repository) | Read-only data and invariant checks (section 12) |
| `docs/project/` (repository) | Copies of the documents above, so the repository carries the full story (section 13) |
| `claude/session-handoff-2026-10-12.md` | Earlier handoff (history) |

## 12. SQL scripts (checked in 18 Oct 2026, `b54da87`)

| Script | Where | Status |
|---|---|---|
| `live-data-checks.sql` | `scripts/sql/` in the repository | **Kept.** 97 read-only SELECT blocks. Part 1: P1 to P10 blocks, one family per scan phase (privileges, constraints, data shapes, figures, limits). Part 2: invariants INV-S1..S10 (stock), INV-Q1..Q10 (QC), INV-P1..P10 (production), INV-K1..K11 (packaging); these return rows only when something is wrong. Run one block at a time in the Supabase SQL Editor. Updated for migration 0120 (`retest_sample_qty`, retest QC records) and parsed against a fresh install. Not yet run on live data. |
| `scan-data-checks.sql`, `scan-invariants-stock/qc/production/packaging.sql` | Claude project only | Superseded: merged into `live-data-checks.sql`. |
| `scan-evidence-p1.sql` to `p10.sql`, and the concurrency scripts | `docs/project/archive/scan-sql/` and the Claude project | Historical bug reproductions for findings that are now fixed. Not for the live database. |
| `audit-impact-check.sql` | `docs/project/archive/` and the Claude project | One-off impact check for the 28 Sept accuracy audit. Refers to `packaging_issues.transaction_type`, dropped in migration 0079, so it no longer runs. Historical. |
| `task_f_live_test_cleanup.sql` | Claude project only | Destructive one-off with hard-coded ids; already run on 3 Sept 2026. Do not reuse. |
| `backup-before-purge-2026-09-13.sql` | Claude project only | Pre-purge data dump script (13 Sept 2026). Kept out of the repository because it copies every table. |

Rules for the next author: a migration that renames or drops a column must also fix any block in `live-data-checks.sql` that uses it, in the same change. To test, build a database from `supabase/fresh-install.sql` (as `scripts/dev/run-tests.sh` does) and run each block; an error means a broken reference. An empty database returns no rows, so this does not test the results themselves.

Known caveat: a finished product batch whose retest was rejected (bulk taken out of On hand) may appear in INV-S8 until it is looked at.

## 13. What is in the repository (18 Oct 2026)

- `docs/project/`: the documents listed in section 11 as snapshots, plus `scan/` (full-app scan plan, method, inventory, findings P0 to P11, findings by group, progress), `plans/` (finished product retest, live walk, environments, opening stock, date validation, scope changes, earlier handoff) and `rules/` (working agreement, large-task ground rules). Its README says which file is which.
- Not copied (still only in the Claude project because they are long, closed history): `known-issues-archive.md` (passes 1 to 52), `deployment-archive.md`, `bug-fix-prompts.md`, the audit and review documents of Aug and Sept 2026, and the older design notes. The README lists them by name.
- The Claude project copies stay the working versions; refresh the repository copies when a delivery is closed out.

## 14. Starter prompt for the new session

> You are continuing work on Invento for Ravi (Atharva Nature Healthcare Pvt. Ltd.). Load the skill `invento-delivery` (in the repository, `.claude/skills/`). Read, in this order, from the Invento project: `claude/handoff-cloud-session-2026-10-18.md`, the "Current state" block of `claude/deployment-log.md`, and `claude/open-items-summary-2026-10-18.md`. Read the memory file `areas/invento.md` for this project. Set up the repository from `origin/main` (see section 2 of the handoff). `main` is `b5ea6d0` or later (last code change `93de17e`); migrations are run up to 0121 (next 0122); nothing is pending. Deliver by pushing to `main` as in section 3 (no patches). Do not start building until Ravi tells you what he wants; his likely next messages are the result of live check E70, or "go" for the mobile phone-width walk or the corrections group. Follow the standing rules in section 3 and end every reply with exactly one recommended next step.
