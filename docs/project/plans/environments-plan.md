# Invento — test and production environments: plan (2 Oct 2026)

Status: **plan saved, not started.** Ravi's answers (2 Oct 2026): real data expected in **1 to 3 months**; testers **and Ravi** will use the test environment; for now **save the plan only**.

> **REMINDER FOR CLAUDE — raise this first when Ravi says we are setting up the new production instance (Ravi, 12 Oct 2026).** The current Supabase project is in **Tokyo (ap-northeast-1)**, on the free plan, and users are in India. A project's region cannot be changed after it is created, so: create the production Supabase project in **Mumbai (ap-south-1)** and set Vercel Settings → Functions → Function Region to **Mumbai (bom1)** for that deployment (Vercel needs a redeploy for it to take effect). Keep the server and the database in the same region: many queries per request make that distance matter more than the distance to the user. If the Tokyo project is kept as production instead, keep Vercel at Tokyo (hnd1). Background and the intermittent-error report: known issues pass 75. Until then the Vercel region should be Tokyo (hnd1) (Ravi to set and redeploy).

## Today
One stack: GitHub `main` → Vercel production → one Supabase project (all test data, Tokyo). No staging (R-1 in the testing reference was deferred with C14). Every patch lands where the testers work.

## Target
| | Test (staging) | Production |
|---|---|---|
| Git branch | `staging` | `main` |
| Vercel | stable test URL (Preview-scoped env vars → test Supabase) | live URL (Production-scoped env vars) |
| Supabase | second project: own keys, users, data | the existing project (or a new one in Mumbai, see reminder above) |
| Data | test / seed data, can be purged | real data, never purged |
| Used by | testers and Ravi | real users |

## How code moves
1. Claude builds on a branch and runs the local DB suites (`scripts/dev/run-tests.sh`).
2. Ravi applies the patch to `staging` (`git am`) and pushes; Vercel deploys the test site.
3. Any migration is run on the TEST Supabase project first.
4. Ravi and the testers check the change on the test site against a short checklist.
5. Promote: run the same SQL on PRODUCTION, then `git push origin staging:main` (SQL first, code second, as today).
6. Claude logs it in the deployment log (one column per environment) and updates the master list.
Rules: `main` is never ahead of `staging`; hotfixes also go through `staging`. Rollback: code via Vercel "promote previous deployment" or `git revert`; database by a forward-fix migration, with a backup taken before every production migration.

## Setup steps (about half a day, mostly Ravi's accounts)
0. **Decide the region pair first (see the reminder at the top): Mumbai ap-south-1 for Supabase and bom1 for Vercel functions for the production instance.**
1. Create a second Supabase project; load `supabase/fresh-install.sql`.
2. Copy settings that are not in git: minimum password 10, sign-up off, site URL / redirect URLs (listed in the deployment log).
3. Create the first System Admin there; load test data via Bulk Upload.
4. Vercel: create the `staging` branch; set Preview env vars to the test project's URL and keys; keep Production as is; protect the test site with a login if the plan allows.
5. Claude writes `docs/RELEASE.md` (checklist) and updates the working agreement, deployment log and patch-delivery skill.
6. Optional: GitHub Actions running tsc, eslint, build and the DB suites on every push (C14).
7. Before go-live: back up production, purge test data, create real users, move testers to the test site.
8. If production moves to a new Mumbai project: recreate the users and roles, set the three Supabase variables in Vercel Production, set Function Region bom1, redeploy, and re-run the live checks.

## Cost (check current pricing before acting)
- Test project: free Supabase plan is enough (2 active projects; pauses after a week idle; no automatic backups).
- Production: Supabase Pro about $25/month gives daily backups kept 7 days. Treat as a must before real data (B10). An extra project on Pro is about $10/month.
- Supabase Branching (temporary databases, billed per hour on Pro): not needed now.

## Watch-outs
Settings changed in one environment but not the other · testers on the wrong URL · mixed-up keys · migration order quirk around 0052/0064 on a fresh install · a paused test project · server and database in different regions (slow saves, time-outs).

## Open decisions
Exact go-live date · test project on the free plan or Pro · whether to add CI (C14) at the same time · production region (Mumbai recommended).
