---
title: Ground rules for large tasks — scans, reviews, audits and multi-part builds
---

# Ground rules for large tasks

Stated by Ravi, 10 Oct 2026, after a six-way parallel scan of the whole app hit the usage limit and produced no findings at all. Applies to every scan, review, audit, research task and multi-part build in this project, from now on.

**The aim:** every unit of work ends with a saved, usable result. Interrupting or running out of limit must never lose everything.

## The rules

1. **One slice at a time.** A big request is cut into slices of one module or one concern (for example: Purchase and Stock, QC, FP batches, Packaging, Reports, Security). Work on one slice, finish it, save the result, report it, then start the next. No fan-out of many parallel agents.
2. **At most one helper agent at a time, and only when it saves effort.** Two only if both are small, independent and each has a written file list. Never launch six. Do the reading in the main conversation when the slice is small.
3. **Show the plan first, then start immediately.** Before a large task, give the slice list in one short message with a rough size for each (small / medium / large), then begin slice 1 without waiting. Ravi can say "stop", "skip" or "next".
4. **Save as you go.** Findings are appended to a file after each file or topic checked, not written at the end. A helper agent must write incrementally and return at most ten lines.
5. **Keep a progress file.** `claude/scan-progress.md` in the project lists every slice (Done / Next / Waiting), what each produced, and where the notes are. A new session reads it and carries on instead of starting over.
6. **Report after every slice.** Two to five lines: what was checked, what was found (counts and the top items), what comes next. The new findings go into the master list at the end of the whole task, or sooner if Ravi asks, not slice by slice, so the list is not churned.
7. **Cheap checks first.** Use search and targeted queries (grep, a database query, one test run) before opening whole files. Read only the part of a file that is needed. Do not re-read what was already read in the session. Keep tool output short.
8. **Verify before listing.** A finding needs a file and line, or a reproduction. Verify High severity findings in the main conversation; drop the ones that do not hold. Say "unconfirmed" rather than guess.
9. **Do not repeat a launch that failed.** If a helper or tool stops on an error or a limit, stop, say what was saved and what was lost, and wait or continue by hand. Do not relaunch the same batch.
10. **One recommendation at the end.** Finish with the single next slice or action.

## Size guide

- Small: about 10 files or one screen and its action: do it directly.
- Medium: one module with its migrations: one slice, optionally one helper agent.
- Large: the whole app or several modules: always sliced, as above.

## Standard slices for a whole-app scan

1. Stock and purchase accuracy (ledger, batches, wastage, units, opening stock)
2. Quality control (QC rounds, retests, expiry, COA, labels)
3. Production (MFR, finished product batches, compose and FIFO, slips)
4. Packaging (packaged product, production-issued raw material)
5. Reports, dashboard, exports and shared screens
6. Security, access, audit trail and data integrity
7. Missing functionality for a regulated plant (deviation, change control, training, complaints and recall, physical count and adjustment, notifications)

Do not report anything already tracked in `claude/open-items-master-list.md`.
