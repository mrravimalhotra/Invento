# Working agreement: how to work with Ravi on Invento

Copy of `claude/working-agreement.md` from the Claude project (last changed 2 Oct 2026).

**Step-by-step, confirm-before-proceeding.** For all work on the Invento app, break the work into discrete steps and present them one at a time (or as a numbered plan up front, then execute one step at a time). After completing a step, stop and wait for Ravi to explicitly confirm it is done and correct before starting the next step. Do not batch multiple steps' worth of changes or actions between confirmations.

**Full, literal instructions for every manual step.** Never say something like "run git push" or "apply the patch" on its own. Spell out the complete, literal sequence: the exact directory to be in (for example `cd C:\MyApps\Invento\invento-v2`) and the exact commands to run in order, so Ravi can copy and paste without having to infer anything.

This applies especially to:

- Anything requiring Ravi to take an action outside the session (running SQL migrations in Supabase, pushing git commits from his machine, applying patches). Call these out as their own explicit step, with the full literal directory and commands, and wait for his confirmation before moving on.
- Multi-step fixes or features that touch several files or need both a code change and a manual action (for example a database migration plus a code deploy).

His local clone lives at `C:\MyApps\Invento\invento-v2` on his machine (device name "ravipc"), connected folder `C:\MyApps\Invento`. The repo is `mrravimalhotra/Invento` on GitHub. The cloud sandbox's git proxy cannot push to it (403, outside the session's authorised repos), so fixes are delivered as patches (git format-patch, SendUserFile, device_commit_files, then git am in that clone) and Ravi pushes manually from his own machine.

Stated 30 Aug 2026, in the context of the feedback-ticket-number feature (which needed a manual Supabase migration step before the code push).

**Update the ticket's own status and notes in the live `/feedback` admin widget as soon as its fix is confirmed implemented.** When work traces back to a numbered tester-feedback ticket (FB-000x), do not stop at recording it in `feedback-status.md` or `known-issues.md`. Those are the engineering-side audit trail, not what the tester (or Ravi, browsing `/feedback`) sees. As soon as the code is committed, patched, delivered and, where a migration is involved, Ravi has confirmed it is applied, go into `/feedback` and set that ticket's Category (Bug, Enhancement and so on) and Status to Implemented, with a specific note in "Notes shown to the tester" describing what changed (not just "fixed"; enough detail that the tester or Ravi can tell what was done). Always verify the save persisted with a hard reload before considering the ticket closed: this widget has a known quirk (see the Notes section of `feedback-status.md`) where a Save click can show "Saving…" and silently fail to persist.

If a ticket is an exact duplicate of another (as FB-0033 and FB-0034 turned out to be), update both, cross-referencing each other in the note.

A fix that was not filed through the `/feedback` widget (a bug Ravi reported directly in chat, with screenshots and so on) has no ticket to update. This rule only applies when real work traces back to an actual FB-#### ticket. Do not invent or guess a ticket number for an unfiled bug; if unsure whether a fix corresponds to an existing ticket, check `/feedback` for a matching one before assuming there is none.

Stated 13 Sept 2026, after FB-0033 and FB-0034 (wastage batch requirement) were built, deployed and confirmed live without their own ticket status ever being updated in the app.

**Build exactly the approved mockup; never deviate without explicit approval.** When Ravi has seen and approved a mockup (layout, columns, labels, controls, wording), the build must match it. Do not substitute a different layout, drop or rename elements, or "improve" it unasked. If something in the mockup cannot work as drawn (a technical limit, a conflict with an existing rule), stop and ask before changing it, say exactly what differs and why, and wait for a yes. Before delivering a UI patch, compare the rendered screen with the approved mockup and list any differences that were approved. Any difference not approved is a defect to fix first.

Stated 2 Oct 2026, after the FB-0052 multi-line Packaging form was first built as stacked cards instead of the approved single-table mockup.

**UI best practice for validation and stock messages (approved by Ravi, 2 Oct 2026; apply to further patches where applicable).**

- Messages are plain red text only: no coloured boxes, progress bars or cards.
- They sit directly under the row or field they belong to, live while the person types and in the same place after a save is refused. A short pop-up may point at the line; the long text is not repeated at the top of the form.
- One sentence pattern everywhere, for example "Not enough stock for <code · name>: <available> <unit> available, <needed> <unit> needed."
- No redundant information: when an error shows, do not also show the related figures. When a line is valid, helpful figures (used, left) show under that line, not as a summary at the end.
- Add and Save buttons are disabled while the entry is invalid or short on stock, and enabled only for a valid entry.
- Keep screens lean.

**Keep the master list current (standing instruction, Ravi, 2 Oct 2026).** After every delivery Ravi confirms, and whenever an open item, live check, decision or ticket status changes, update `claude/open-items-master-list.md` in the same turn as the deployment log: remove or close finished items, add new open questions and live checks, update the ticket row in Part 3 and the scoreboard counts, and refresh the "Kept current" line at the top. The master list is edited directly (the old `master-list-builder.txt` bundle was retired on 2 Oct 2026 and is only a pointer). Do not wait to be asked.
