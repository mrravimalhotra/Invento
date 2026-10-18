# Invento: go-live readiness log

A running record of the operations and reliability items that are deliberately deferred until go-live. Decision (Ravi, 18 Oct 2026): these are taken care of at go-live, when the project moves to the paid Supabase (Pro) and Vercel (Pro) plans. Nothing here blocks testing on the current free plans. Everything marked "Open" must be closed, or consciously accepted, before real data is loaded.

Real data is expected in 1 to 3 months from 29 Sept 2026. Go-live date: not yet set.

## Readiness register

| # | Area | Ref | What must happen at go-live | Today | Status | Owner | Closed on |
|---|---|---|---|---|---|---|---|
| G1 | Backups and restore | B10 | Turn on the paid Supabase backups (check retention and any point-in-time option on the day of the switch). Decide whether to keep own scheduled dumps as well. Run one restore into a spare project and record that it worked. | No backup policy; only the one-off pre-purge script. Parked twice. | Open (deferred to go-live) | Ravi | |
| G2 | Separate test and production | B40 | Create the production Supabase project and a Vercel production deployment. Keep the current project and a `staging` branch as the test environment. Move code test to production by SQL first, then `git push origin staging:main`. Plan: `claude/environments-plan.md`. | One environment (Tokyo). | Open | Ravi, Claude | |
| G3 | Region | B40, pass 75 | Create the production Supabase project in Mumbai (ap-south-1) and set the Vercel Function Region to Mumbai (bom1). Until then keep Vercel on Tokyo (hnd1). | Supabase in Tokyo, users in India; intermittent "site can't be reached" seen. | Open; Vercel hnd1 change still pending | Ravi | |
| G4 | Automatic checks | C14, P10-08 | Add a GitHub workflow that runs type check, lint and the 39 database suites on every push to `staging`. | Suites run by hand; nothing runs on push. | Parked by Ravi; revisit with G2 | Claude | |
| G5 | E-mail delivery | P1-06, P9-07 | Set up a custom e-mail sender (SMTP) so reset and invitation e-mails are reliable. Decide whether retest, expiry and QC-waiting alerts also go out by e-mail or stay on the Dashboard. | Built-in sender: limited volume, may land in spam. Alerts are Dashboard cards only. | Open (decision needed) | Ravi | |
| G6 | Security settings tied to the paid plan | SEC-09, B3 | Turn on leaked-password protection (needs Pro). Decide on MFA for System Admin. Confirm sign-in rate limits are on. | MFA undecided; leaked-password check not available on free. | Open | Ravi | |
| G7 | Purge guard | C8, SEC-13 | Add an environment guard so Purge Test Data can never run against production. Remove or disable the purge screen in production. | No guard; no action decided "for now". Rated High once real data exists. | Open | Claude | |
| G8 | Database size | E8 | Check audit log size; the paid plan raises the 500 MB free limit. Note the figure at the switch. | Check by hand now and then. | Open | Ravi | |
| G9 | Test data and opening stock | B4 | Purge test data in production only, load opening stock, close loading by hand after the agreed cut-off. | Opening Stock screens are built and checked in test. | Open | Ravi | |
| G10 | Live checks | E1 to E70 | Clear the waiting live checks on the test environment first (about 55). Then repeat a short smoke test on production. Also run `scripts/sql/live-data-checks.sql` (read-only, one block at a time; INV- blocks should return no rows) on the test and then the production database. | E62 to E70 waiting. `live-data-checks.sql` run read-only on the live (test) database by Claude, 18 Oct 2026: every stock, production and packaging invariant clean; findings in known issues Pass 89. Production run still to do. | Open | Ravi | |
| G11 | Decisions that change how the app is used | B45, P4-09, P6-01, P5-04, P6-04 | Decide before go-live: invoice vs received date per output; void or replace a certificate; void a mistaken packaging issue; correct or close a finished product batch; production raw material QC. | Undecided. | Open | Ravi | |

## Switch-over checklist (do in this order)

1. Upgrade Supabase to Pro and Vercel to Pro. Note the date.
2. Create the production Supabase project in Mumbai; set Vercel region to bom1.
3. Run all migrations on the new project, in order (use `supabase/fresh-install.sql`).
4. Set environment variables for production; confirm the redirect URLs and the password-reset e-mail template (see E46).
5. Turn on backups; run and record one restore test.
6. Set up the custom e-mail sender; send a test reset e-mail.
7. Create the staging branch and the test project; run the database suites once on staging.
8. Add the purge guard; confirm the purge screen is off in production.
9. Create real user accounts; load opening stock; close loading by hand.
10. Run the smoke test: sign in, one purchase order, one QC decision, one finished product batch, Stock Integrity Check all green.

## Change log

| Date | Entry | By |
|---|---|---|
| 18 Oct 2026 | Register created. Reliability and operations items (backups, separate environments, automatic checks, e-mail delivery, region) deferred to go-live, when the Supabase and Vercel plans move to Pro. Rated 4 of 10 in the readiness rating of the same date; the rating is expected to rise once G1 to G7 are closed. | Ravi (decision), Claude (record) |
