# Writing review, 1 Nov 2026

Done with Vercel's `writing-guidelines` skill (`.claude/skills/`), which checks text against Vercel's published writing rules. Applied to the User Guide (`docs/user-guide/USER_GUIDE.md`, 1,060 lines) and the 368 distinct messages the app shows (errors and confirmations in `lib/actions/`, `lib/saved-messages.ts`, `lib/db-errors.ts`). Rules written for Vercel's own docs site (page metadata, code samples, AI model names, their pull-request process) were not applied. Ravi chose all three clean-ups (Pass 125).

## User Guide

| Rule | Count | Example |
|---|---|---|
| Sentences over 30 words (target under 20) | 178 of 942 (average 20.7 words) | line 74, the sign-in steps |
| Paragraphs over 4 sentences | 13 | lines 74, 121, 231, 433, 436, 481 |
| Em dashes as punctuation | 254 | line 151 "System Admin — the broadest role" |
| Filler words (just, very, really) | 22 | line 56 |
| Vague words (many, often, typically, generally, usually) | 15 | line 151 "essentially everything" |
| Pressure words (easy, simple, quick) | 8 | line 199 |
| Horizontal rules between sections | 14 | already hidden in the PDF and on screen |
| "the user" instead of "you" | 2 | lines 626, 762 (both mean the account, so correct) |
| Passive "… by …" | 8 | line 74 |
| Generic heading | 1 | "Overview" (a menu group name, so correct) |

Passes: no "…" typed as three dots, no "we", no rhetorical questions, units written correctly, sentence-case headings.

## On-screen messages

| Rule | Count | Example |
|---|---|---|
| Em dashes | 57 | "That file has no data rows — nothing to import." |
| Over 25 words | 15 | `coa.ts:141` (batch record mismatch) |
| Problem without a next step | 7 | "Not authorized.", "Purchase order not found." |
| "Please" | 10 | acceptable in an error |

Passes: average 9.6 words per message; no filler words; no "...".

## Result (Pass 125)

| Measure | Before | After |
|---|---|---|
| Guide: average sentence length | 20.7 words | 17.3 words |
| Guide: sentences over 30 words | 178 | 87 |
| Guide: em dashes | 254 | 2 (the status name "Round 1 approved — awaiting review", as the app shows it) |
| Guide: filler, pressure and vague words | 45 | 0 that need changing ("how many" and quoted screen text remain) |
| Guide: horizontal rules | 14 | 0 |
| Guide PDF | 47 pages | 43 pages |
| Messages with dashes | 71 | 0 (deprecated modules untouched) |
| Messages without a next step | 65 | 0 (deprecated modules untouched) |
| Messages over 25 words | 6 | 0 |

Corrections of fact found while rewriting: the Equipment section said there was no calibration reminder (there is one since 20 Oct: Dashboard card and Calibrated / Due in N days / Overdue); the deprecated modules are under the System Administrator's Archive menu (UX-02), not Admin; the QC section no longer mentions the archived Batch Manufacturing Record.
