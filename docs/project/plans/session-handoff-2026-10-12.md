# Invento: session handoff, 12 Oct 2026 (resume tomorrow)

## Where things stand
- `main` = `93de17e` (live on Vercel). Migrations run in Supabase up to **0120**. Nothing pending or undelivered.
- Done today: closed out coacol18 and qcresults19; Legacy tag fix (9ca548a); live walk and its fixes (b9edc35); **finished product retest rebuild** (93de17e, migration 0120, SCAN-P4-04 and LW-01 closed).
- Project docs are up to date: deployment-log, known-issues (Pass 84), open-items-master-list (E70 added, scoreboard 1E 55, scan 36 open), fp-retest-plan, live-walk. Memory file for Invento updated.

## First thing tomorrow: live check E70
Needs a finished product batch whose retest date has arrived. On test data, ask for the SQL line that moves one batch's approval back. Check:
1. QC page shows the "Finished product due for retest" card; Start Retest creates an ARFP record.
2. While the retest is open: packaging refuses the batch and Label Printing leaves it out.
3. Round 2: a retest period running past the expiry date is refused; a shorter one is accepted.
4. After approval: batch can be packed again; batch page lists First QC and Retest 1; Ageing shows the new retest date.
5. A sample bigger than the stability sample takes the rest from the bulk (On hand drops).
6. Opening Stock, Finished Product template has Retest date and Retests already done.
7. Reject a retest at Round 2: bulk leaves On hand; void it: bulk returns.

## Waiting on Ravi
- Live checks E62 to E70.
- Decisions: B45 (Invoice Date vs Received Date per output), P6-04 (undecided), P4-09 (void certificates), LW-11 (S9 false alarm in the Stock Integrity Check; needs a migration; confirm RM-00004-02/26 in the ledger first), MFA.
- Quick wins: Vercel Function Region to Tokyo (hnd1) and redeploy. Reminder for production setup: Supabase Mumbai (ap-south-1) with Vercel bom1 (B40).
- Corrections group (P4-09, P6-01, P5-04, P8-01) awaiting "go".
- Parked: B10 backups, P3-07, P3-14, P8-06, P7-16, P10-08.

## Not covered or not done
- Live walk did not cover Batch Trace results, forms, PDF/Excel downloads, sign-in and Profile pages.
- Batch Trace shows the retest QC record but not the retest sample quantity as its own row.

## Standing rules (unchanged)
Patch delivery per skill `invento-patch-delivery`; ask decisions with AskUserQuestion (include Park); end with exactly one next-step recommendation; don't touch FB-0038/FB-0036; never create accounts or enter passwords on the live site.

## Recommended next step
Run live check E70, then send a screenshot; if it passes, say "go" on the corrections group.
