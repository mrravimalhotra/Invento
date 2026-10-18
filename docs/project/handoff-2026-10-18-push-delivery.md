# Invento: handoff to a new session (18 Oct 2026, evening)

Read this first. It sits on top of `handoff-cloud-session-2026-10-18.md` (the detailed handoff of the same morning): this file says what changed during the day and how work is delivered now; the older file still holds the mobile plan (section 8), go-live preparation (section 9), lessons (section 10), the document map (section 11) and the SQL script inventory (section 12).

## 0. If you only have five minutes

1. `main` = `1efc968` or later, live on Vercel. Last change to app code is still `93de17e` (finished product retest); everything after is documents, scripts, the delivery skill and migration 0121.
2. Supabase has migrations **0001 to 0125** applied and recorded (0122 = Stock Integrity Check S9, LW-11; 0123 = approved MFR cannot be deleted; 0124 = function access hardening; 0125 = equipment calibration from dates). The next migration is **0126**.
3. **Delivery changed today.** Claude pushes to `main` itself; Vercel deploys and Supabase's GitHub integration applies migrations. No patches, no `git am`, no SQL pasted by Ravi. Proven end to end with 0121.
4. Claude can read the live database through the Supabase connector (read-only queries only).
5. Nothing is pending. Do not start building until Ravi says what he wants. End every reply with exactly one recommended next step.

## 1. Setting up the session

| Need | How |
|---|---|
| Repository | The session clones `mrravimalhotra/Invento`. Start work with `git fetch origin main && git checkout -B <session-branch> origin/main`. |
| Project map | `CLAUDE.md` and `AGENTS.md` at the repo root. Read them instead of exploring. |
| Delivery skill | `invento-delivery` (repo, `.claude/skills/invento-delivery/SKILL.md`), loaded by Claude Code automatically. Ravi also uploaded the same text to his claude.ai account as `invento-patch-delivery` (name kept, content replaced). Either is fine; they say the same thing. |
| Git method | `docs/GIT-WORKFLOW.md`. |
| Supabase | Connector "Supabase", project `zsmsdssfdtwpkonaaahp` (Invento, Tokyo, Postgres 17). Write tools are blocked by Ravi; **Execute SQL** is allowed and is used for SELECT queries only. |
| Database tests | `service postgresql start`, then `scripts/dev/run-tests.sh`. 40 suites; output must match `supabase/tests/expected.txt` (latest line `mp121 1 0`). |
| GitHub tools | GitHub MCP tools (no `gh`). Pull requests only when Ravi asks. |
| Live site | https://invento-atharva.vercel.app. Read-only walks use Ravi's signed-in Chrome. **Never create accounts, type passwords or log in.** The admin and user accounts already exist. |

## 2. How a change is delivered now

1. Build on the session branch. Stage files by name, never `git add -A`.
2. Checks: `npx tsc --noEmit`, `npx eslint <files>`, `next build` (command in `CLAUDE.md`), and `scripts/dev/run-tests.sh` for database changes.
3. A migration ships with: `supabase/migrations/NNNN_name.sql`, a suite `supabase/tests/part_*.sql` registered in the `FILE` map and `ORDER` array of `run-tests.sh`, a line in `expected.txt`, a regenerated `supabase/fresh-install.sql` (`node scripts/build-fresh-install.mjs`), and a line in `docs/modules/` if user-visible.
4. Commit (session trailer lines), `git status --short` empty, then:
   `git push -u origin <session-branch>` and `git push origin <session-branch>:main`.
   If main moved: `git merge origin/main` into the branch, re-run checks, push again. Never force-push.
5. Confirm a migration (usually live within two minutes):
   `select max(version), count(*) from supabase_migrations.schema_migrations;` plus one query that shows the change itself.
6. Close out: row in `docs/project/deployment-log.md` (and Current state, migration register), next pass in `docs/project/known-issues.md` (next is **Pass 99**), `docs/project/open-items-master-list.md` and the summary if counts change. Commit and push.

**Never run or ask Ravi to run a migration in the SQL Editor.** It is not recorded in `schema_migrations`, so the integration runs it again and stalls. This is what happened from 0008 to 0120 (section 4).

SQL that is not a migration (a one-off data fix, a dashboard setting) is given to Ravi as its own step, with literal instructions. Claude never writes to live data through the connector.

## 3. Rules Ravi works by (unchanged)

- One step at a time; literal instructions for anything he must do; build exactly the approved mockup.
- Product decisions as multiple choice, always with a **Park it** option; record the answer.
- Do not touch FB-0038 or FB-0036. Deprecated BMR, Line Clearance and Environmental Control stay untouched.
- Printed identity: "Atharva Nature Healthcare Pvt. Ltd.", licence "PD/AYU/111".
- Keep the master list and deployment log current after every delivery.
- Short tool output; read only the section of a document you need; replies of one or two sentences on the outcome.
- Decisions on record (do not re-ask): see section 3 of `handoff-cloud-session-2026-10-18.md`.

## 4. What happened on 18 Oct 2026 (afternoon)

| Commit | What |
|---|---|
| — | Found: Supabase's migration history stopped at 0007. 0008 to 0120 had been pasted into the SQL Editor, so the GitHub integration (Deploy to production on `main`, already switched on) had been stuck on 0008. |
| `bd3508d` → `0602487` | A GitHub Actions workflow was built, then dropped at Ravi's choice in favour of Supabase's own GitHub integration (same set-up as his other project). `scripts/db/mark-migrations-applied.sql` written; `supabase/README.md` and `CLAUDE.md` describe the flow. |
| — | Ravi ran the history script once: 120 rows, newest 0120. |
| `811527a` | `docs/GIT-WORKFLOW.md` (push branch, fast-forward `main`) and a `CLAUDE.md` rule. |
| `b5ea6d0` | Migration **0121** `migration_pipeline_check`: only a description on the `public` schema. Applied by the integration within about two minutes and confirmed through the connector (121 rows, newest 0121). Suite mp121. |
| `9170877` | Project documents moved to the new delivery method (Pass 88). |
| `1efc968` | Skill `invento-delivery` in the repository; handoff and `CLAUDE.md` point to it. Ravi disabled, then replaced, the old account skill `invento-patch-delivery` with the same new text. |

## 5. Current state

| | Value |
|---|---|
| GitHub `main` | `1efc968` or later (last app code change `93de17e`) |
| Supabase migrations | 0001 to 0125, recorded in `supabase_migrations.schema_migrations` |
| Next migration | `0126` |
| Database suites | 40, all expected lines pass |
| Pending delivery | none |
| Supabase GitHub integration | Working directory `.`, production branch `main`, Deploy to production on |
| Live database facts (checked 18 Oct) | 50 tables in `public`; time zone Asia/Kolkata |

## 6. Waiting on Ravi

- **Check the skills** in a new session: it should list `invento-delivery` and `invento-patch-delivery`, both describing push-to-main.
- **Live checks E62 to E70**, E70 first (a finished product batch whose retest date has arrived). Claude can now look up candidate batches with a read-only query; moving a date for the test is a data change, so it is done through the app (for example Opening Stock with a past retest date) or as SQL Ravi runs himself.
- **"Go"** on the mobile phone-width walk (old handoff, section 8) or on the corrections group (P4-09, P6-01, P5-04, P8-01).
- **Decisions:** B45, P6-04, P4-09, MFA, P9-01.
- **Quick wins:** Vercel Function Region to Tokyo (hnd1) and redeploy; confirm the GitHub repo is private; B4/E46 password-reset settings (redirect URL and e-mail template) in Supabase.
- **Before go-live:** `scripts/sql/live-data-checks.sql`; Claude can now run its blocks read-only and report.
- **Parked by him:** B10 (now go-live), P3-07, P3-14, P8-06, P7-16, P10-08.

## 7. Recommended order of work

1. Confirm the skills in a new session (one question).
2. E70: Claude finds a suitable batch read-only and gives Ravi the steps.
3. ~~LW-11~~ done 18 Oct 2026 evening (migration 0122, `3444733`).
4. Mobile walk, then the corrections group (ask the decision questions first, with Park it).
5. Run `live-data-checks.sql` read-only and report anything it finds.

## 8. Traps learned today

- A migration run by hand is invisible to the deployer; histories drift silently. Only `main` changes the database.
- Supabase lists migration versions as text; `0120` sorts after `0007`, so order by version descending to see the newest.
- The integration needs no `supabase/config.toml`; it read the four-digit file names (`0001_…`) without trouble.
- `0001_init.sql` drops the whole `public` schema. If the history table is ever emptied, the integration would run it and wipe the data. Never truncate `supabase_migrations.schema_migrations`.
- A push to `main` can be refused by the session's own safety check the first time; an explicit "push to main" from Ravi (or his Git workflow document) is the authorisation.
- Execute SQL runs as the database owner. Read-only is a rule Claude keeps, not a database setting.

## 9. Starter prompt for the next session

> You are continuing work on Invento for Ravi (Atharva Nature Healthcare Pvt. Ltd., licence "PD/AYU/111"), a Next.js 16 + Supabase inventory, QC and manufacturing app. Load the skill `invento-delivery`. Read `docs/project/handoff-2026-10-18-push-delivery.md` first, then the "Current state" block of `docs/project/deployment-log.md` and `docs/project/open-items-summary-2026-10-18.md`. `main` is `1efc968` or later; migrations 0001 to 0125 are live; the next is 0126. Deliver by pushing the session branch and fast-forwarding `main` (Vercel deploys, Supabase applies migrations); confirm migrations through the Supabase connector with read-only queries. Never write to live data, never create accounts or type passwords, never ask Ravi to run a migration by hand. Do not start building until Ravi says what he wants, and end every reply with exactly one recommended next step.
