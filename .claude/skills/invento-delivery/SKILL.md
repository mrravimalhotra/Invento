---
name: "invento-delivery"
description: "Use for any Invento build, fix or migration: how to build, test and deliver by pushing to main (Vercel deploys, Supabase applies migrations), confirm on the live database, close out, and keep token use low."
---

# Invento delivery

Replaces the older account skill `invento-patch-delivery` (patches, SQL run by hand), retired 18 Oct 2026. Where the two differ, this one wins.

Invento = Next.js 16 + Supabase inventory/QC/manufacturing app for an Ayurvedic medicine plant (Atharva Nature Healthcare Pvt. Ltd.). Not live; all data is test data. GitHub `mrravimalhotra/Invento`; live site https://invento-atharva.vercel.app; Supabase project `zsmsdssfdtwpkonaaahp`. Read the repo `CLAUDE.md` first (project map, commands, rules) instead of exploring, then `docs/project/handoff-cloud-session-2026-10-18.md` (section 3 = standing rules) and `docs/GIT-WORKFLOW.md`.

## Building
1. Start from the latest main: `git fetch origin main && git checkout -B <session-branch> origin/main`. Stage files by name (`git add <paths>`), never `git add -A`.
2. Run `npx tsc --noEmit`, `npx eslint <files>`, `npm test` (unit tests, `tests/unit/`; add one when a `lib/` rule changes), `next build` (command in `CLAUDE.md`), and for DB changes `scripts/dev/run-tests.sh` (needs `service postgresql start`; compare with `supabase/tests/expected.txt`).
3. A migration ships with: the SQL (`supabase/migrations/NNNN_name.sql`, next number = highest + 1; check the live history too), a regression suite `supabase/tests/part_*.sql` added to the `FILE` map and `ORDER` array in `run-tests.sh` plus its `expected.txt` line, a regenerated `supabase/fresh-install.sql` (`node scripts/build-fresh-install.mjs`), and a line in `docs/modules/` if user-visible.
4. Never edit a migration that is already live; add a new one.

## Delivery (push; no patches)
1. Commit with the session's trailer lines. `git status --short` must be empty.
2. `git push -u origin <session-branch>`, then fast-forward main: `git push origin <session-branch>:main`. If main has moved: `git merge origin/main` into the branch (no rebase), re-run the checks, push again. Never force-push.
3. Vercel deploys `main`. Supabase's GitHub integration (Deploy to production, branch `main`) applies every file in `supabase/migrations` not yet in `supabase_migrations.schema_migrations`, usually within two minutes.
4. Ravi does not paste SQL, apply patches or push. **Never ask him to run a migration in the SQL Editor**: a hand-run migration is not recorded, so the integration runs it again and stalls (this happened from 0008 to 0120).
5. SQL that cannot be a migration (a one-off data fix, a dashboard setting) is given to Ravi as its own step, with literal instructions.

## Confirm and close out
1. Confirm a migration through the Supabase connector with a read-only query: `select max(version), count(*) from supabase_migrations.schema_migrations`, plus one check that the change itself is there. If it has not appeared after a few minutes, read the integration's error and fix it with a new migration.
2. Update `docs/project/deployment-log.md` (delivery row, migration register, Current state), `docs/project/known-issues.md` (next pass number), `docs/project/open-items-master-list.md` (and the summary when counts change). Commit and push these like any other change.
3. Tell Ravi the short commit hash and the one thing to check live.

## Supabase access
- The connector has its write tools blocked; Execute SQL is allowed. Use it for **read-only queries only** (SELECT; checking migrations, `scripts/sql/live-data-checks.sql`, data for live checks). Never insert, update, delete or change schema through it; every change goes through a migration on `main`.
- Never ask for or store the database password, connection string or service-role key.

## Rules
- Do not touch FB-0038 and FB-0036 until Ravi revisits them. Deprecated BMR (`bmr_*`, `/admin/bmr-deprecated`), Line Clearance and Environmental Control stay untouched unless he asks.
- Company identity: "Atharva Nature Healthcare Pvt. Ltd.", licence "PD/AYU/111" (editable under Admin → Company Details).
- Never create accounts, type passwords or log in on the live site. Read-only walks use Ravi's signed-in Chrome. No destructive git commands unless he asks.
- Work one step at a time; build exactly the approved mockup; ask product decisions as multiple choice with a **Park it** option and record the answer. Do not start building until Ravi says what he wants.
- End every reply with exactly one recommended next step.
- Test data may be left in place.
- A stop-hook message about an unpushed branch means something is not pushed: push it.
- Decisions on record: SEC-02 accepted by design; SEC-05/08/11/13 no action; ACC-11 parked; ACC-41 no action; packaging is Pack only; MFA undecided; C14 tests/CI deferred to go-live (G4); C15 CSP enforce on hold; C16 stock summary table not needed until about 5M ledger rows; C17 Reports/Item Master paging on hold; 13 direct-API findings accepted as risk; all roles may load opening stock; System Admin exempt from the different-person QC rule; go-live items G1 to G11 handled with the move to Pro plans. Purge button stays for the testing cycle; guard it at go-live (C8, 18 Oct 2026).

## Token rules
- Keep tool output short (`| tail`, `| cut -c1-200`). Read only the needed section of a project document.
- Batch independent tool calls in one block.
- Do not re-read files just edited. Replies: one or two sentences on the outcome, no step recaps.
- Heavy libraries (jspdf, docx, exceljs) are imported on click; keep it that way.
