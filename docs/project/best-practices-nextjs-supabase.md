# Best Practices for Apps on Next.js + Supabase

A technology-focused checklist for building and hardening business web apps on this stack: Next.js (App Router, Server Components, Server Actions), Supabase (Postgres, row-level security, Auth, PostgREST), and a serverless host such as Vercel. It is not tied to any industry or product. Every rule exists because it prevents a real class of failure on this stack: data leaks, silent data loss, slow pages, broken phones, or changes that cannot be rolled back.

How to use it: read sections 1 to 3 before you design, section 15 before every release, and the "Bug to rule" table (section 16) when reviewing code. Where an example names a table or screen, swap in your own.

---

## 1. Ten principles

1. **The database is the real gate; the app is the friendly layer.** Anyone signed in can call the database API directly with their own token. A rule that lives only in a screen or a Server Action is a suggestion. Enforce every rule that matters in row-level security, constraints, triggers or function checks, and repeat it in the app only to give a clear message early.
2. **Record events, derive totals.** Balances, counts and status should come from an append-only event history where possible, not from numbers edited in place. Corrections are new entries (reversals), never overwrites.
3. **Make wrong states impossible, not just discouraged.** Prefer a constraint, a trigger or a unique index over a comment, a convention or a hope.
4. **Every action ends with a visible result.** Success, a clear error, or "someone else changed this". Never a silent failure and never a raw database message.
5. **Say what you cannot show.** A list that is capped, a read that failed, a figure that is partial: tell the user on the screen.
6. **Decisions belong to the owner; build the safe default.** When a rule is a product choice (block or warn, who approves, what to do with old records), ask once with a short list of options and a "park it" choice, then record the answer.
7. **One rule, one place.** If the same rule lives in three files (screen, action, SQL), they will drift. Put the real rule in the database, write the user message once, and reuse helpers.
8. **Test the path nobody clicks.** Direct API calls, two people at once, a double-click, a number one digit too long, an empty list, a year-end rollover.
9. **Small, reversible, verified steps.** One migration per change, a regression test with it, a documented rollback story, and a live check after release.
10. **Write it down as you go.** Decisions, the reason for each rule, open questions and live checks go in a living document, so a new teammate or a new working session can resume without guessing.

---

## 2. Architecture and the trust boundary

```
Browser -> proxy/middleware (session check)
        -> Server Components (read, render)
        -> Server Actions (validate, call database)
        -> Supabase client (user token)   <- also reachable directly from the browser
        -> Postgres: RLS, constraints, triggers, SECURITY DEFINER functions
```

- Treat the **anon key as public** and every signed-in user as able to call any table or function their token allows. Test security twice: through the screen, and with a raw API call using the same user's token.
- Use `getUser()` (verified with the auth server) rather than `getSession()` (read from the cookie) for server-side identity checks.
- Never trust ids, prices, quantities, status, role or dates sent from the browser. Re-derive them on the server or in the database.
- Keep role lists in one module that mirrors the database policies, and label it "affordance only: the database is the real check".
- Default to Server Components for reads; use Client Components only for interaction. Keep secrets and service-role keys out of anything that reaches the browser.
- Heavy libraries (PDF, Word, Excel, charts) load on click, not on page load.

---

## 3. Security

### 3.1 Access control
- **Row-level security on for every table, from the first migration.** Add a test that fails if a new table has it off.
- Define one small set of helper functions (`has_role`, `has_any_role`, `is_signed_in`) and use them in every policy.
- Self-registration should grant **no** role. A signed-in user with no role should see nothing sensitive.
- Read policy: decide deliberately between "any signed-in user" and role-scoped reads. A flat read model is simple but means every user can read everything; record that as a decision, not an accident.
- Write policy per role and per table. Tables written only by triggers or functions get no write policy at all (or `with check (false)`).
- Immutable by omission: tables that are records of fact (event history, audit log, issued documents) get no UPDATE or DELETE policy.
- Views: create with `security_invoker = on`, revoke everything from `anon`, grant `select` only, and revoke insert/update/delete explicitly (a simple view is writable by default).
- Revoke default execute on functions from `public` and `anon`, then grant to `authenticated` only where needed. Check the full list of functions `anon` can execute after each release.
- Keep an **anonymous lockdown migration**: no table, view or function readable without sign-in, except what a public page truly needs.

### 3.2 SECURITY DEFINER functions
- Always `set search_path = public` (or the exact schema list). Without it, a function can be hijacked by a same-named object in another schema.
- Put an explicit role check at the top: `if not has_any_role(...) then raise exception ... end if;`. A definer function bypasses RLS, so the check is the only gate.
- Take a lock (`for update`, or an advisory lock keyed on the business object) wherever two people could act on the same record at once.
- Dynamic SQL only from fixed lists or validated arguments, always with `format('%I', ...)`.
- No `UPDATE` or `DELETE` without a `WHERE` in any function or script. Scan all function bodies for this.

### 3.3 Sessions, passwords, accounts
- Automatic sign-out after inactivity, configurable, with an admin exemption if the owner wants one.
- Sign-in, sign-out, failed sign-in and password-change events go into the audit log.
- Show the same message for "wrong password" and "no such account".
- Rate-limit sign-in and password reset at the auth provider, and confirm the setting is on.
- Never type passwords, tokens or keys into test tooling against a live site; use dedicated test accounts created by the owner.
- Only the highest role changes roles, and the database refuses a role change from anyone else, even by direct call. Keep at least one active admin (database trigger).
- Profile fields users can edit should be few, bounded in length, and unique where identity matters.
- Decide on multi-factor authentication early for admin roles; record the decision even if the answer is "later".

### 3.4 Input, output, headers
- Validate every input on the server (zod or equivalent): type, range, length, allowed values. Add database limits on numbers and text length as the second layer.
- Escape user text used in `ilike` filters (`escapeLike`), and strip characters that break PostgREST `or()` filters.
- Spreadsheet export: neutralise cells that start with `=`, `+`, `-`, `@` (formula injection).
- Uploaded files: check type, size and extension; store with generated names; never serve from a guessable path without an access check.
- Set security headers (CSP, frame ancestors, referrer policy, content-type options). Start CSP in report-only mode and move to enforce once clean.
- Never return `error.message` from the database to the user. Map known codes to plain sentences (see section 6).
- Run `npm audit --omit=dev` each release and record accepted advisories with a reason.

### 3.5 Audit trail
- A trigger-based audit log on every business table: who, when, which table, old and new values, and "via" (screen, import, function).
- Stamp `created_by`, `created_at`, `updated_by`, `updated_at` by trigger, not by the app.
- Log sensitive non-row events too: sign-ins, role changes, exports, bulk purges.
- Give auditors a read-only role that sees the audit screen and nothing else writable.
- Show history links on records ("who changed this and when").

---

## 4. Data design and integrity

### 4.1 Event history and derived totals
- Where a figure is a running total (balance, count, quota used), keep an append-only history table (event type, subject, amount, unit, reference type and id, who, when, reason). Totals come from views or summary tables fed by triggers.
- Corrections are compensating entries. Reversing or cancelling must undo only what is still net, per line and per type, and refuse if the effect was already consumed downstream.
- Add an **integrity check**: a function that compares history totals with the figures stored on records and explains every difference in plain words. Run it after each release and expose it to the admin.
- Never compute a figure two different ways in two places. Put the formula in one SQL function or view and reuse it. When the formula changes, search for every copy.

### 4.2 Quantities, units, money
- One base unit per item; convert at the entry point; store the entered and converted values when audit needs both.
- Refuse a value typed in a unit that cannot convert, rather than loading it silently wrong.
- Store numbers with a sensible scale (3 to 6 decimals) and ignore dust below a threshold in availability checks. A 0.0000001 leftover should not block the next operation.
- Money: decide the rounding rule once (per line or per total, which mode, how many decimals) and use it on screen, in PDF and in spreadsheets. Totals must equal the sum of the lines shown.
- Hard upper limits per field and a "10 times the usual" warning that asks for a tick but does not block. It catches the extra zero.

### 4.3 Identifiers and numbering
- Sequence-backed codes (`nextval`), never `max()+1` or `count()+1`.
- Padding is a **minimum width**: after `9999` comes `10000`, never a truncated or repeated code. Test the overflow.
- Year-based numbers restart each year using the business time zone, not server time.
- Gaps happen (failed saves). Decide whether they matter and, if they do, record them.
- Codes that users type from legacy records must be refused if they look like codes the app generates.

### 4.4 Constraints and triggers
- Unique indexes for business rules: one open record per parent (`where status in (...)`), one active default per item, and so on. Use a partial unique index instead of "check in the app".
- New CHECK constraints on populated tables: add `not valid`, then validate after cleaning.
- State machines (draft, submitted, approved, rejected, void) enforced by a trigger that lists the allowed transitions and who may make each. A decided record cannot change except through its defined path (void with a reason).
- Distinguish a direct client write from a write made by your own function inside triggers (a helper such as `_is_direct_client_write()`), so guards bind screens but not the app's own functions.
- Locked after use: once a record has downstream effects, lock the fields that would break the history (parent, number, unit, quantity).
- Computed columns are computed by trigger from their source fields; refuse direct writes to them.

### 4.5 Time
- Store timestamps as `timestamptz`. Decide business dates in the business time zone (set the zone on functions and on the database role, and name it in views).
- Show all dates in one format through one formatter. Spreadsheets and PDFs use the same.
- Date rules in one module: not in the future, not before the previous step, not after a deadline. Apply them in the form (min/max), the action and the database.

---

## 5. Workflow and business-rule patterns

Use the ones that apply; skip the rest.

### 5.1 Approvals (review and sign-off)
- Decide the shape of an approval in numbers: how many rounds, which roles, whether the same person may act twice, minimum length of a written reason.
- A proposed rejection can need a second person to confirm or send it back. A rejection can be voided by a senior role with a written reason, and the history keeps every step.
- Store the **inputs** to a decision with the decision (per round), not just the verdict.
- Never delete a decision. Keep a decision-history table written by trigger.
- Check-then-act race: every decision update carries the expected current status in its `where`, and "0 rows changed" becomes "someone else has already decided this".

### 5.2 Deadlines, expiry and recurring reviews
- Write the cycle down as numbers (maximum period, maximum repeats, what the last repeat means) and keep them in one constants file mirrored by the database.
- A derived date can never fall after the hard deadline it depends on. Enforce in the form, the action and a trigger.
- Expired records cannot be renewed through the normal path; they need an explicit, audited recovery path.
- A record past its date, expired, or under review cannot be used downstream. Put the rule in one database function that returns a reason, and call it from every place that consumes the record.
- Carry the history of imported records (for example "reviews already done") so limits still hold after a data load.

### 5.3 Corrections and reversals
- Plan the correction path before real data arrives: wrong amounts, mistyped values, an action made by mistake, a cancelled order. If the only fix is a database script, the audit trail is already broken.
- Reopen and cancel flows must be safe to repeat (reopen twice does not reverse twice) and must refuse when the result was already used.
- Write-offs and adjustments are first-class events with a reason, an approver above a threshold, and a place on the report.

### 5.4 Operations that consume a shared, limited resource
(Stock, credits, seats, budget, quota: anything where two people can race for the last unit.)
- Pick the allocation order as a database rule (for example oldest first, by arrival date, not by when a line was typed).
- Only records that are valid and usable can be selected anywhere the resource is consumed. The check lives in a trigger, with the same message the screen shows.
- Check availability inside the same transaction that writes the deduction, with a row lock on the resource.
- Use one wording for "not enough" everywhere: "Not enough X: A available, B needed."

### 5.5 Rejected, voided and archived records
- A rejected or voided record leaves the active totals through a history entry with a reason, and comes back if the rejection is voided.
- Provide one place where rejected, expired and archived records can be seen, with who and why.

---

## 6. Server actions, errors and messages

- Every action: check sign-in, check role, validate input, call the database, map errors, revalidate paths, then either return a message or redirect with a saved key.
- `"use server"` files export async functions only; constants and types live in a separate module. A violation breaks the build or silently breaks the module.
- Use one hook for form actions that always shows the result (success banner or error). Redirecting actions pass a `?saved=<key>` that a shared host displays.
- Map database error codes to plain sentences in one function. Messages raised deliberately by your own functions (`P0001`) are written for people and pass through; everything else becomes "Something went wrong. Try again." with the technical detail logged.
- Disable the submit button while pending, and make actions idempotent against a double click (unique index or status condition).
- **Optimistic concurrency**: carry `updated_at` from the form and add it to the update condition. If no row changes, say "Someone else changed this record while you were editing it. Reload to see their change."
- Name the thing in the message: "Order 1042 was cancelled on 05-03-2026, so it can't be edited." beats "Invalid state."

---

## 7. User convenience

- **Search where people look**: by code, by name, by related record. Dropdowns with type-to-filter for long lists; load results from the server as the user types rather than loading the whole table.
- Pre-fill sensible defaults (today's date, the last unit used, the most common choice) and say why in a hint.
- Show hints under fields: allowed range, unit, format, what happens next ("Next review date: 14-04-2027").
- Show the consequence before the click ("Rejecting this moves it out of the active list") and ask for a confirmation tick only on destructive or irreversible steps.
- Cards on the home screen for what is waiting for the user: awaiting review, due soon, low balance. Each card links to the action.
- Lists: sortable columns, filters, sensible default sort (newest first), visible row counts, a "Show inactive" switch where records are hidden, and a spreadsheet or PDF download that matches what is on screen.
- Let people type rows into the page as well as upload a spreadsheet. Templates list valid values, units and codes on a reference sheet, with dropdowns pointing at it.
- Tags that explain data origin ("Imported", "Legacy") appear only when the flag is explicitly true; never default a missing value to a visible tag.
- A feedback widget on every page, with ticket numbers, so testers report in context.
- A **user guide** inside the app (searchable, with a PDF) and short module notes in the repository, both updated with each release.
- Plain wording in the users' own terms. Use the names people used on paper or in the old system, even if the internal term differs.

---

## 8. Mobile and accessibility

- Design entry screens for a phone first. Test at 360 to 400 px width.
- Gutter of at least 16 px, no horizontal page scroll. Only tables and code blocks scroll sideways, each inside its own `overflow-x: auto` container.
- Layout with flex or grid and `gap`; stack to one column on narrow screens; give text-holding children `min-width: 0` so they wrap.
- Touch targets at least 44 by 44 px; inputs at 16 px font size or more (prevents zoom on iOS); number inputs use `inputmode="decimal"`; dates use native date pickers.
- Dropdown lists must not be clipped by scrolling containers (render them in a portal or outside the overflow box). This is invisible on desktop and breaks on phones.
- Tables on phones: either a card layout per row or a clearly scrollable table with the key column pinned.
- Safe-area padding for fixed bars (`env(safe-area-inset-*)`).
- Accessibility basics: labels tied to inputs, `role="status"` for success and `role="alert"` for errors, real radio groups for choices, visible focus, keyboard-operable menus, colour contrast checked by script (4.5:1 for text), never colour alone for status.
- Provide a manifest and icons so the app can be installed on a phone home screen.
- Show a "retrying" or "could not load, try again" banner instead of a blank screen. Mobile networks fail more often than office ones.
- Support dark mode through colour tokens rather than per-component overrides.

---

## 9. Performance and scale

- **PostgREST returns at most 1,000 rows per request, silently.** A bigger `.limit()` does nothing. Page with `.range()` windows and always end the order with a unique column (`id`), or rows will repeat and skip. Wrap this in one helper (`fetchAllRows`).
- Long `.in(ids)` lists break the URL. Split them with a chunk helper.
- Do filtering, counting and aggregation in the database (a view or a function), not by fetching every row and filtering in the browser.
- Registers and reports: server-side paging and filtering, or a default date window with an explicit "load all". When a list is capped, say so on the screen.
- Index foreign keys and every column used in `where` or `order` of a hot query. Test with `explain (analyze, buffers)` on a **scale copy** of the database (realistic volumes: tens of thousands of rows in transactional tables, a million in history tables).
- A running-balance view should filter by subject before the window function; index `(subject_id, event_at, seq)`.
- If a total is expensive to compute, keep a summary table updated by a trigger on the append-only history.
- Bulk imports: one database function per upload that generates codes and inserts in one transaction, not one round trip per row.
- Set timing targets: page-shaped queries under a few hundred milliseconds; the heaviest page under three seconds.
- Region matters: put the app functions in the same region as the database, and the database near the users. A far-away database shows up as intermittent "site can't be reached" and slow saves. Record the chosen regions.
- Prefetching every sidebar link multiplies server work; turn it off for data-heavy pages.
- Load heavy libraries on demand; keep the first page light.
- Read failures must not look like empty results: show a banner when a query fails.

---

## 10. Reports, exports and printed documents

- One formatter for dates, quantities and money used by screen, PDF and spreadsheet; check that the three agree.
- Units next to every quantity in every output. Spreadsheets keep numbers as numbers; screen and PDF show the unit.
- Organisation name, address and registration details come from one settings record. **Keep a copy on each issued document** so a reprint years later shows what was issued, not today's address.
- Issued documents are immutable. Corrections are a new, linked document, with the old one voided and visible.
- Fonts: embed a font that covers your currency symbol, diacritics and any local script you need. Test PDFs with those characters.
- Test long text, page breaks and column widths with real-size data. Include a row-limit message if a PDF is capped.
- Print what the old paper form printed, under the same headings, so people recognise it; add a note when a heading needs explaining.
- Decide which date a document prints when several exist (created, received, approved), and write the rule in the docs.
- Registers: show who recorded each entry and when; allow download.

---

## 11. Data loading, migrations and environments

- Migrations are numbered, small and idempotent where practical (`if not exists`, `create or replace`). Wrap in `begin; ... commit;`.
- Changing a function: keep the same signature and return type, or drop first. `create or replace view` can only append columns; otherwise drop and recreate.
- A migration ships with: the SQL, a regression test suite, the regenerated fresh-install script, and a docs line. The latest definition of a function wins, so grep for earlier copies when you change a formula.
- Add a self-check block at the end of migrations that are easy to mis-paste: `do $$ ... raise exception ... $$;` fails loudly if something did not apply.
- Record each migration in a register with date and who ran it. If you run migrations by hand in the hosted SQL editor, do it in order and check for "Success".
- Opening data (records imported from an old system): a loader function per kind, all-or-nothing, with a load number, an undo while the load is open, an "imported" flag, and the same rules as live entry (units, dates, duplicates). Do not accept codes that look like app-generated codes.
- Separate environments (test, production). Write down what is test data and when it can be purged; provide a safe purge function that only an admin can run and that refuses on real data.
- Back up before real data arrives: decide between the provider's backups and your own dumps, and test a restore once.
- Keep secrets in environment variables; never in the repository; service-role keys only in server code that needs them.

---

## 12. Testing and verification

- **Database regression suites** are the most valuable tests for this stack. One file per migration or feature, running against a fresh local Postgres built from all migrations. Helper functions: `t_ok` (must succeed), `t_fail` (must fail with this message), `t_check` (must be true). One line per suite compared with an expected file (`suite pass fail`).
- Test as different roles by setting the JWT claims, and **also test direct calls** to prove the database blocks what the screen would hide.
- Each past bug becomes a permanent regression test.
- Test the unhappy paths: not enough of the resource, expired, wrong role, same person acting twice, double submit, reopen twice, number overflow, voided then restored.
- Backdate test data the right way (change the source timestamp and let the trigger recompute the derived date) instead of overwriting the computed field.
- Integrity checks (history totals vs stored figures) are tests that run on live data too.
- Before every release: `tsc --noEmit`, lint, the database suites, and a production build. Treat warnings you introduced as failures.
- A **live check list** after each release: step-by-step what to click and what to expect, with a number and a "waiting on owner" status until confirmed.
- A read-only live walk of the real screens finds what code review cannot: wrong wording, raw codes, missing units, blank columns, wrong date formats, stale intro text.
- A full-app scan is worth doing before real data: security, roles, master data, each module, reports, supporting screens. Record each finding with severity, location, evidence and suggested fix; then fix in groups.
- Why a bug was missed is data too. Typical reasons: tests drove the database but never the screens; a flag defaulted to a visible state; a formula existed in four places and one was missed; the scan read code but never saw the live page.

---

## 13. Delivering changes safely

- Work on a branch from the latest main; keep each change small enough to review in one sitting. Stage files by name rather than "add all".
- Use a preview deployment per branch where the host supports it, and run the live check on the preview before merging.
- Order of release when a change has a migration: apply a backward-compatible migration first, then deploy the code, then (later) a clean-up migration. Never ship code that needs a column that does not exist yet.
- Know the rollback for each release: redeploy the previous build; for migrations, a written reverse or a forward fix.
- After release: verify the deployed commit matches what you intended, then update the deployment log, the known-issues log and the open-items list.
- Keep the main logs short: move closed history to archive files.
- Keep a living plan document for any large task and save it after each slice, so a lost session costs nothing.
- Ask product decisions as a short multiple-choice (with a "park it" option) and record the answer. End every working session with one recommended next step.
- Keep a list of "decisions on record" so the same question is never asked twice, and a list of parked items with the reason.
- Never create accounts or type passwords on the live site; never run destructive commands unless asked; do not touch items the owner has frozen.

---

## 14. Documentation to keep

| Document | Purpose |
|---|---|
| Module notes (one per module) | Current behaviour, rules, and "why" for each decision |
| User guide (in the app, with PDF) | For the people using the app; update with every release |
| Process map | One picture of how work flows between modules |
| Deployment log | What is live, which migrations ran, when, verified how |
| Known-issues log | Pass by pass: found, root cause, fix, verification, deploy status |
| Open-items master list | One scoreboard: needs a decision, parked, waiting on owner, scan findings, closed |
| Decisions and scope-change log | Who decided what and when |
| Testing and security reference | Roles matrix, trust boundary, test catalogue, performance notes |
| Session handoff | Where we stopped, what is next, what is waiting on the owner |

---

## 15. Pre-release checklist

**Security**
- [ ] RLS on for every new table; policies written for each role.
- [ ] New views are `security_invoker`, revoked from `anon`, read-only.
- [ ] New functions: `search_path` set, role check at top, execute granted only as needed, locks where racing.
- [ ] Rule enforced in the database, not only in the action.
- [ ] Inputs validated with limits; errors mapped to plain messages.

**Correctness**
- [ ] State transitions and edge cases (expired, last repeat, voided, reopened) tested.
- [ ] Every formula that exists in more than one place is updated everywhere.
- [ ] Integrity check still agrees after the change.
- [ ] Dates, units and money formatted by the shared helpers.

**User experience**
- [ ] Every action ends with a visible message; buttons disable while pending.
- [ ] Hints, defaults and consequences shown; confirmations only for irreversible steps.
- [ ] Lists searchable, sortable and downloadable; caps announced.
- [ ] Wording matches the users' terms; user guide and module notes updated.

**Mobile and accessibility**
- [ ] Checked at phone width: no sideways page scroll, touch targets, input types.
- [ ] Dropdowns not clipped; labels, focus and contrast fine.

**Performance**
- [ ] Paged reads end on a unique order; long id lists chunked.
- [ ] New columns used in filters are indexed; timings measured on scale data.
- [ ] Heavy libraries load on click.

**Delivery**
- [ ] `tsc`, lint, database suites and production build all clean.
- [ ] Migration, suite, expected line, fresh-install script and docs line included.
- [ ] Rollback known; live check written with exact steps; deployment log updated after confirmation.

---

## 16. Bug to rule: patterns we hit and what to do

| What went wrong | Rule |
|---|---|
| A bigger `.limit()` did not return more than 1,000 rows | Page with `.range()` and a unique order; use one helper; tell the user when a list is capped |
| Paging by `created_at` repeated and skipped rows | End every paged order with `id` |
| Very long `.in(...)` list failed with a fetch error | Chunk id lists |
| A check lived only in a Server Action | Put the rule in RLS, a trigger or the function; the action only gives an early message |
| Definer function without `search_path` | Always set it, and test for it |
| Padded codes turned `100` into `00` after the width was reached | Padding is a minimum width; test the overflow |
| Cancelling an order twice reversed its effect twice | Compensating entries reverse only what is still net; refuse when already used |
| A decision could be made twice from two browser tabs | Add the expected status to the update condition; treat zero rows as "already decided" |
| Last save overwrote another person's edit | Carry `updated_at` and check it |
| A value typed in grams against a kilogram line drove a balance negative | Constrained unit select with conversion; history in the line's unit |
| A computed date column could be set directly by a user | Compute by trigger from the source fields; refuse direct writes |
| A flag defaulted to true when missing, so every row got an "Imported" tag | Tags show only when the flag is exactly true |
| A dropdown was clipped inside a scrolling table | Render the list outside the overflow container |
| A multi-part `<option>` label produced stray commas | Build labels as strings; never rely on array-to-string |
| A "use server" file also exported a constant and broke the module | Only async functions in action files |
| The organisation's address on an old document changed after a reprint | Snapshot organisation details on each issued document |
| A list failed to load and looked empty | Show a failure banner; never render failure as "no rows" |
| Four copies of one formula, one missed after a change | One SQL function; grep every copy; integrity check catches drift |
| A derived date could be later than its deadline | Refuse in the form, the action and the database |
| An expired record could still be used by a later step | One "block reason" function called by every consuming path |
| A re-review overwrote a date that a document should keep | Decide per document which record's date it uses and keep it stable |
| A report showed the same record twice after a second approval | A "latest approval" view; dedupe by newest per record everywhere |
| Test data purge had no tool, and fixes needed scripts | Provide admin-only purge and correction paths before real data |
| Intermittent "site can't be reached" | App and database in nearby regions; retry-friendly messages; record the region plan |
| Screens said one thing, the paper form another | Keep the familiar headings; add an explanatory note rather than renaming |

---

## 17. Starter kit: what to set up on day one

1. Repository rules file with the project map, commands and "rules of the road".
2. Folder layout: screens per module, actions per module, shared helpers (`utils`, `fetch-all`, `db-errors`, `table-export`, `pdf`, `spreadsheet-export`), UI kit (data table, combobox, form, banner).
3. First migration: roles table, helper functions, audit trigger, stamp triggers, `anon` lockdown, history-table skeleton.
4. A local database script that builds from all migrations, and a test runner that prints one line per suite.
5. Shared helpers for paging, chunking, date and number formatting, error mapping, form result display.
6. A feedback widget, an audit screen and a user guide page.
7. Documents: deployment log, known-issues log, open-items list, decisions list, session handoff.
8. A release checklist (section 15) copied into the repository.

---

*Distilled from building and hardening a production-style business app on this stack. Adjust the numbers and examples to your own product; keep the principles.*
