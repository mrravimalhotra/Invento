## Part C — Method, finding format and how to resume

### C1 — Starting and resuming

- Ravi says **"start scan"** to begin at P0.1, and **"resume scan"** to continue after any interruption (usage limit, closed session, days later).
- A new session reads, in this order: `claude/scan-progress.md` (find NEXT STEP), `claude/scan-plan.md` Part C (this part), `claude/large-task-ground-rules.md`, then the findings file of the phase that holds NEXT STEP (`claude/scan-findings-pN.md`).
- A step marked **Done** is never repeated. A step marked **In progress** is repeated from its start (its findings were not saved yet). A step marked **Waiting** has not begun.
- The first message of a resumed session says in one line where the scan stands ("Phase 3, step 3.2 next, 14 findings so far") and carries on without asking.

### C2 — Doing one step

1. Mark the step **In progress** in `scan-progress.md` (only if the previous save succeeded).
2. Read the code and database objects the step names. Cheap checks first (search, line counts, SQL on the local database); open whole files only where the check needs it.
3. For every suspected issue, search the master list and `known-issues` (`project_search`) before writing it down. If tracked, skip it or, if the tracked note is wrong or incomplete, record it as "Update to existing item <ID>".
4. Verify before listing: reproduce on the local database or quote the exact code. Anything not confirmed is marked **Unconfirmed** with what would confirm it.
5. Rewrite the whole phase findings file (`project_write` replaces the file) with the new findings added, then mark the step **Done** in `scan-progress.md` with the finding count and move NEXT STEP on. Both saves happen before the next step starts.
6. Recalculate the **Progress report** block at the top of `scan-progress.md` (see C8) in the same save.
7. At most one short chat line per step, ending with the progress figure, for example `P3.2 done · 2 findings · scan 21 of 53 steps (46% weighted)`. No long recaps.

### C3 — Finding format

Each finding in `scan-findings-pN.md` is written as:

```
### SCAN-P3-07 — short title
- Severity: High | Medium | Low
- Kind: Bug | Integrity | Security | Gap | Enhancement | Inventory tightening | Formatting | Usability | Performance | Doc mismatch
- Where: screen / module ; file:line (or migration number and function)
- Finding: what is wrong, with concrete numbers or steps
- Evidence: quoted code or the SQL run and its result
- Suggested fix: one or two sentences, with rough size S / M / L
- Needs decision from Ravi: Yes / No (and what)
- Confidence: Confirmed | Likely | Unconfirmed
- Status: New | Duplicate of <ID> | Update to <ID>
```

**Severity.** High: wrong stock, wrong QC status, broken traceability, data loss, or a security hole that exposes data or lets a role do what it should not. Medium: a wrong figure, a blocked workflow with a workaround, or a notable weakness. Low: cosmetic, rare, or a small improvement.

**IDs.** `SCAN-P<phase>-<nn>`, numbered in the order found inside the phase (SCAN-P3-01, SCAN-P3-02, …). IDs never change. When added to the master list they keep the SCAN ID, and the master list assigns no new letter.

Each findings file also ends with **Checked and found sound** (a short list of what was verified correct, so the work is visible) and **Areas read** (files and migrations opened).

### C4 — Master list

- At the end of each phase, a new section **1F. Scan findings** in `claude/open-items-master-list.md` receives that phase's confirmed findings as table rows (ID, severity, kind, one-line summary, pointer to the findings file). The section and a scoreboard row are created when Phase 1 completes.
- Unconfirmed findings stay in the findings file only until confirmed.
- The master list and the findings file are both written before the phase is reported; the progress table gets "Master list updated: Yes".

### C5 — Evidence rules

- Read-only on the repository and on any real database. The scan changes nothing in the app.
- Reproductions run only on the local Postgres (`service postgresql start`, `scripts/dev/run-tests.sh` conventions, `invento_*` names untouched). Never against the live Supabase.
- Checks that need the live database are written as read-only SQL in `claude/scan-data-checks.sql` for Ravi to run in the Supabase SQL editor; he pastes back the results and they are analysed in a follow-up step.
- Anything on the live site is looked at only with Ravi's say-so, read-only, and never with real credentials entered by Claude.
- Hosted Supabase rules apply to every suggested SQL: no UPDATE or DELETE without WHERE; row cap 1,000 per request.

### C6 — What is not reported

Items already in the master list, standing decisions (see Part A7), pure style nits, and test data being present. Enhancements are reported only if they remove a risk, a manual error, a wrong figure or real extra effort for users.

### C7 — Reporting back

- After each phase: one short message to Ravi with counts by severity, the three most important findings, and "Phase N saved. Next: step X. Say 'continue' or stop here."
- At the end (P11): final report in `claude/scan-findings-p11.md` with counts by kind and severity, top findings, quick wins, items needing a decision, and one recommended next build.
- If a usage limit hits mid-step, nothing is lost: all earlier steps are saved, and "resume scan" repeats only the interrupted step.

### C8 — Progress report (how much of the scan is complete)

`claude/scan-progress.md` opens with a **Progress report** block, kept current after every step:

- **Steps done** — count of steps marked Done out of 53, with percentage.
- **Weighted progress** — small step = 1 point, medium = 2, large = 3 (total 82 points), so a large step moves the figure more than a small one. This is the percentage to quote.
- **Phases complete** and a per-phase table (steps done, points, % done, state: Not started / In progress / Done / Master list updated).
- **Findings so far** — total and split High / Medium / Low, plus how many are duplicates dropped.
- **Master list updated to** — the last phase whose findings are in the master list.
- **Last saved** — step id and date of the last save.

Rules: the block is recalculated from the step table every time, never estimated. A step counts only when marked Done after its findings are saved. At each phase end the chat report repeats the block. When Ravi says **"scan status"**, the current block is shown at once, without doing any scan work.
