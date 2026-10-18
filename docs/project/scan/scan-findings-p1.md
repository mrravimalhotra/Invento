---
title: Scan findings — Phase 1 (security, access and audit)
---

# Phase 1 — Security, access and audit

Steps done: P1.1 to P1.7. Next: P2.1 (after the Phase 1 close-out). (Rewritten whole after every step.)

## Findings

### SCAN-P1-01 — Forgot-password link cannot sign the user in, so the reset cannot be completed
- Severity: Medium
- Kind: Bug
- Where: Sign-in → Forgot password → `/reset-password`; `lib/actions/auth.ts:62-77` (`requestPasswordReset`), `app/(auth)/reset-password/page.tsx`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts:5`
- Finding: The e-mailed link returns the user to `/reset-password` carrying a one-time code (Supabase's default PKCE flow). Nothing in the app exchanges that code for a session: there is no `/auth/confirm` or callback route, no `exchangeCodeForSession` or `verifyOtp` call, and the browser Supabase client (`lib/supabase/client.ts`) is never imported anywhere, so its automatic link handling never runs. The page therefore opens with no signed-in user; when the new password is submitted, `updatePassword` calls `auth.updateUser`, which fails with "auth session missing" and the user sees the generic "Couldn't change your password". Ravi's account-flow live check E6 never covered the reset link. The User Guide (line 75) tells users to use it.
- Evidence: `grep -rn "exchangeCodeForSession|verifyOtp|onAuthStateChange|setSession" app lib components proxy.ts` returns no matches. `node_modules/@supabase/ssr/dist/main/createServerClient.js:37,39` sets `flowType: "pkce"` and `detectSessionInUrl: false`. `createBrowserClient` is defined at `lib/supabase/client.ts:4` and imported nowhere.
- Suggested fix: Add a small confirm route (`/auth/confirm`) that exchanges the code or token hash and then redirects to `/reset-password`; point the Supabase "Reset password" e-mail template at it. Also check in Supabase that the Site URL and redirect allow-list contain the Vercel address. Size S. Until then the only working reset is the System Admin's reset on User Roles & Access.
- Needs decision from Ravi: No (but he must check the Supabase e-mail settings; see SCAN-P1-06)
- Confidence: Likely (code confirmed; not run against the live Supabase Auth)
- Status: New (E6 lists account flows as not yet live-checked; nothing describes this cause)

### SCAN-P1-02 — Sessions never time out; no automatic sign-out after inactivity
- Severity: Medium
- Kind: Security
- Where: whole app; `lib/supabase/middleware.ts`, `lib/auth/session.ts`, `app/(dashboard)/layout.tsx`
- Finding: Once signed in, a browser stays signed in until the user clicks Sign out. The access token is refreshed silently on each request and the refresh token has no inactivity limit, so a PC left unlocked on the shop floor or in the QC lab keeps the full session for days. Schedule M / Part 11 style rules expect an automatic lock or sign-out after a period of inactivity, because every approval in the app (QC decision, Final Submit, Approve MFR) is a signed action under that user's name. Disabling an account ends the session on the next click (good), but nothing ends an abandoned one.
- Evidence: `grep -rniE "idle|inactiv|auto.?logout|session.?timeout" app lib components` returns only "Inactive" status labels. Middleware only calls `auth.getUser()`; no age or last-activity check.
- Suggested fix: Add a lightweight client idle timer (for example 30 minutes, warning at 28) that calls the sign-out action; optionally also turn on the Supabase "inactivity timeout" / "time-box sessions" setting (Pro plan). Size S.
- Needs decision from Ravi: Yes. What idle period (15 / 30 / 60 minutes), and should it apply to every role?
- Confidence: Confirmed (no code); Supabase project settings not visible
- Status: New

### SCAN-P1-03 — Sign-in return link drops the page's query string
- Severity: Low
- Kind: Usability
- Where: `lib/supabase/middleware.ts:55-58`; `app/(dashboard)/layout.tsx:17`
- Finding: When a signed-out user opens a deep link, the redirect to `/login` keeps only the path in `?next=`. After signing in the user lands on the bare page, so links such as the QC "Start QC" shortcut (`/qc/new?line=<id>`) or a filtered list lose their parameter. The dashboard layout's own `redirect("/login")` keeps no `next` at all.
- Evidence: `url.searchParams.set("next", request.nextUrl.pathname)` — pathname only, no `search`.
- Suggested fix: Use `pathname + search` (the sign-in action already validates `next` through `safeRedirectPath`, which allows a query string). Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed
- Status: New

### SCAN-P1-04 — Changing the password does not ask for the current password
- Severity: Low
- Kind: Security
- Where: Profile → change password; `lib/actions/auth.ts:84-107` (`updatePassword`), `app/(dashboard)/profile/profile-forms.tsx:29`
- Finding: The Profile form takes only the new password and confirmation. Anyone at a signed-in, unattended screen can set a new password and lock the owner out, and could then sign in later as that person. This matters more because of SCAN-P1-02 (sessions never expire). The same action is reused for the reset page.
- Evidence: `updatePassword` reads `password` and `confirmPassword` only; it calls `supabase.auth.updateUser({ password })` with no re-verification.
- Suggested fix: On the Profile form only, ask for the current password and verify it (`signInWithPassword`) before updating; leave the reset page as it is. Size S. (Alternative: Supabase's "require current password" project setting.)
- Needs decision from Ravi: No
- Confidence: Confirmed
- Status: New

### SCAN-P1-05 — Forced password change shows Supabase's raw error text
- Severity: Low
- Kind: Usability
- Where: `lib/actions/admin-users.ts:209` (`completePasswordChange`)
- Finding: Any failure other than "same password" and "weak password" is shown as `Couldn't change your password: <raw Supabase message>`. SEC-12 replaced raw database errors with friendly text at 94 sites, and the other password action (`updatePassword`) logs the detail and shows a fixed message; this one was missed. Raw text can read like "Auth session missing!" or reveal provider wording.
- Evidence: `return { error: \`Couldn't change your password: ${updateError.message}\` };`
- Suggested fix: Log the code and message on the server and show the same fixed wording as `updatePassword`. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed
- Status: New

### SCAN-P1-06 — Password-reset and invitation e-mails depend on Supabase's built-in mail sender
- Severity: Medium
- Kind: Gap
- Where: Supabase Auth settings (outside the repository); `lib/actions/auth.ts:62`
- Finding: Supabase's built-in e-mail service is meant for trying things out: it sends only a few messages per hour and, on the free plan, only to addresses of the Supabase organisation's own members. Staff who are not organisation members would never receive the reset link, and the form still says "If that email has an account, a reset link is on its way." The workaround today is the System Admin's password reset.
- Evidence: Not visible from the code; the form always returns the same success text by design (SEC-09), so a non-delivery is silent.
- Suggested fix: Ravi to check Authentication → Emails in the Supabase dashboard; if the built-in sender is still in use, either add a custom SMTP sender (Gmail/Workspace account or a transactional mail service) or document that password resets go through the System Admin. Size S (setting) .
- Needs decision from Ravi: Yes. Custom SMTP, or admin-reset only?
- Confidence: Unconfirmed (needs a look at the Supabase dashboard)
- Status: New

### SCAN-P1-07 — Anyone with an inventory or production role can release a batch by inserting an already-approved QC record
- Severity: High
- Kind: Integrity
- Where: database table `quality_checks`; insert policy `qc_insert` (system_admin, inventory_manager, quality_checker, qc_reviewer, mfr_manager); `trg_fn_qc_enforce_review_stages` only guards UPDATEs
- Finding: The QC screens only ever create a record in the first state, but the database accepts an insert that is already `approved` (or `checker_approved`, `rejected`) from any of those five roles, including an Inventory Manager or MFR Manager who has no QC role at all. The batch then shows as QC Approved everywhere (Stock Position Usable, Compose, Labels, COA), with no Round 1, Round 2 or distinct-reviewer check. SEC-04 (0070) closed the same kind of hole for purchase orders, MFRs and finished-product batches, but not for QC records. Reproduced on the local database by signing in as an Inventory Manager (user with only that role) through the same API path the browser uses.
- Evidence: Local test, role `authenticated`, `sub` = inventory_manager: `insert into quality_checks (ar_number, purchase_line_id, item_id, sample_qty, sample_unit, status, reviewed_by, reviewed_at, retest_period_days, expiry_date) values ('AR-FAKE', <fresh batch>, <item>, 0, 'kg', 'approved', <reviewer id>, now(), 180, current_date+365)` → accepted; `select qc_status from purchase_batch_status where purchase_line_id = <that batch>` → `approved`. The audit log shows the insert with `changed_by` = the inventory manager, so it would be detectable afterwards by looking for QC records inserted in a state other than the first (see the check query in `scan-data-checks.sql`); note that the audit screen cannot tell such a direct call from a normal screen action (both are recorded as via "app", see P1.6). Script in `claude/scan-evidence-p1.sql` (section G).
- Suggested fix: One BEFORE INSERT trigger on `quality_checks` that forces the first state (`submitted`), clears decision, reviewer and expiry fields, and lets only the existing internal functions (retest, opening-stock load, FP submit) create other states. Add a test to the sec04 suite. Size M.
- Needs decision from Ravi: No
- Confidence: Confirmed (reproduced)
- Status: New (SEC-04 lists FP, MFR and PO only)

### SCAN-P1-08 — A decided QC record can be changed afterwards (status, AR number, quantities, reviewer)
- Severity: High
- Kind: Integrity
- Where: database table `quality_checks`; update policy `qc_update` (system_admin, quality_checker, qc_reviewer); triggers `trg_qc_enforce_review_stages`, `trg_qc_compute_retest_date`
- Finding: Once a record is approved or rejected, nothing in the database stops a Quality Checker or QC Reviewer from updating it again through the API: flip Approved to Rejected (or the reverse), change the AR number, the sample quantity or the reviewer. The trigger only checks the two forward transitions. A rejected→approved flip releases stock; approved→rejected moves it to Rejected Materials; changing the sample quantity changes ledger-linked figures. The UI never offers this, so it takes a deliberate API call, and the audit log does record it with the real user (but not that it bypassed the screen). Fix belongs with SCAN-P1-07.
- Evidence: Local test as a Quality Checker on an `approved` record: `update quality_checks set status='rejected'` allowed (status became `rejected`); `set sample_qty=99` allowed; `set ar_number='AR-HACK'` allowed; `set reviewed_by=<self>` allowed. Final row: `status=rejected sample_qty=99 ar=AR-HACK reviewed_by=<checker>`. Script in `claude/scan-evidence-p1.sql` (section E).
- Suggested fix: In the same trigger, refuse any update to a row whose old status is `approved` or `rejected` except the fields that legitimately change later (retest started, rejected-stock flag), and make AR number, item, batch and sample quantity immutable after insert. Add tests. Size M. (Decision locks are re-checked in P4.1.)
- Needs decision from Ravi: No
- Confidence: Confirmed (reproduced)
- Status: New

### SCAN-P1-09 — The person named on a QC decision, COA, line clearance or environmental reading is typed in by the browser, not stamped by the database; the "different person" rule can be bypassed
- Severity: High
- Kind: Integrity
- Where: `quality_checks.checker_by` / `reviewed_by`; `coa_records.issued_by`; `line_clearance_checks.checked_by`; `environmental_control_readings.recorded_by`; `lib/actions/qc.ts:225-240`, `lib/actions/coa.ts:132`; `trg_fn_qc_enforce_review_stages` (0054)
- Finding: `created_by` / `updated_by` are stamped by triggers from the signed-in user, but the columns that act as the signature are plain values sent by the app. A user calling the API directly can record Round 1 as another person, approve as another person, or issue a COA under another name. The two-person rule (Round 2 reviewer must differ from the Round 1 checker) is also bypassable: it compares `auth.uid()` with `new.checker_by`, and the same update may set `checker_by` to null. A user holding both QC roles can complete both rounds alone. System Admin is deliberately exempt from the distinctness check, so an admin can also do both rounds. The code comment calls the trigger "the real backstop that can't be bypassed".
- Evidence: Local test: (A) Quality Checker recorded Round 1 with `checker_by` = the admin's id → allowed, stored as the admin. (B) QC Reviewer approved with `reviewed_by` = the inventory manager's id → allowed, stored. (C) One user holding quality_checker + qc_reviewer: honest Round 2 refused ("must be a different person"), but the same update with `checker_by = null` was allowed and the record became `approved`. Script in `claude/scan-evidence-p1.sql` (sections A to C).
- Suggested fix: Stamp `checker_by`, `checker_at`, `reviewed_by`, `reviewed_at`, `issued_by`, `checked_by` and `recorded_by` from `auth.uid()` in BEFORE triggers (ignore the client value), make `checker_by` immutable once set, and apply the distinctness test to the stamped value. Size M.
- Needs decision from Ravi: Yes. Should System Admin remain exempt from the "different person" rule? (GMP practice is no: the admin should not approve their own check.)
- Confidence: Confirmed (reproduced)
- Status: New (D6 records the two-round decision; nothing records the bypass or the admin exemption as a risk)

### SCAN-P1-10 — Anyone on the internet with the public key can use up document numbers
- Severity: Medium
- Kind: Security
- Where: database functions `get_next_po_number`, `get_next_vendor_code`, `get_next_item_code`, `get_next_coa_number`, `get_next_feedback_ticket`, `get_next_equipment_code`, `get_next_dead_stock_code`, `get_next_mfr_code`, `get_next_packaging_issue_code`, `get_next_fp_batch_number`, `get_next_production_batch_number`, `get_next_batch_number` and the `peek_next_*` family; `0001_init.sql:31` (default execute to anon), `0006_sequence_grants.sql:29`
- Finding: New functions are executable by the `anon` role by default, and `anon` also has USAGE on the number sequences. The "anon" key is public (it ships in the web page). Without signing in, a caller can invoke these functions through the API and advance the PO, COA, vendor, item, MFR, packaging, equipment, dead-stock and feedback counters. Nothing is read or written besides the counter, but regulated number series (PO and COA numbers) get gaps with no business record behind them. Later migrations revoked `anon` on the newer functions (AR numbers, the `create_*` functions, trace) but not on the older number generators.
- Evidence: Local test, `set role anon;` then `select get_next_po_number()` returned PO-0001 then PO-0002; `get_next_vendor_code()` V-0001; `get_next_coa_number()` COA-0001-2026; `get_next_item_code('raw_material')` RM-001; and similar for MFR, packaging, equipment, dead stock and feedback. The sequence `last_value` moved to 2.
- Suggested fix: One migration: revoke execute from `anon` (and `public`) on every `get_next_*` and `peek_next_*` function, and change the default privileges so future functions are not granted to `anon`. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed on the local database; the hosted project uses the same default privileges (migration 0001), but the live grants should be checked once with the SQL in `scan-data-checks.sql`
- Status: New (the sequence-gap notes in 2.6 only cover rollbacks)

### SCAN-P1-11 — Super Auditor (a read-only role) can load opening stock, including pre-approved batches
- Severity: Low
- Kind: Inconsistency
- Where: `lib/actions/opening-stock.ts:31` (no role test); `load_opening_stock` / `load_opening_finished_product` (check `has_app_access()` only); `app/api/opening-stock/template/[kind]/route.ts`
- Finding: Ravi's decision for opening stock was that every role may load while loading is open. The Super Auditor role is otherwise read-only everywhere (no write policy, no write button), and its purpose is independent review. Under the current rule an auditor can post stock and create Approved raw-material batches with a typed-in old AR number. The same applies to any role: while loading is open, any signed-in role can create Approved batches without QC (by design).
- Evidence: `grep -n "has_app_access" ` in the two functions; `submitOpeningStock` has no `canWrite` call.
- Suggested fix: Keep "every role may load" but exclude `super_auditor`, and consider limiting the Approved / Rejected rows (which skip QC) to the QC roles and System Admin. Size S.
- Needs decision from Ravi: Yes. Exclude the auditor, and who may load pre-approved rows?
- Confidence: Confirmed
- Status: Update to B4 (decision "all roles may load")

### SCAN-P1-12 — The anonymous role still holds privileges on every table, and signed-in users can write through one view
- Severity: Low
- Kind: Security
- Where: grants on all 34 tables, `coa_template_register`, `current_qc_approvals`; `0001_init.sql:30` (default privileges), `0075_security_hardening.sql:101-112` (revoked on five views only)
- Finding: Row-level security is on for every table and no policy is open to everyone, so an anonymous caller reads and writes nothing. But the underlying grants were never tightened: `anon` holds SELECT, INSERT, UPDATE, DELETE on all 34 tables and SELECT on the view `coa_template_register`, and the signed-in role holds INSERT, UPDATE and DELETE on `current_qc_approvals`, a simple view that is writable and passes writes to `quality_checks`. One future table or policy written without care would then be open to the internet. The Supabase API root also lists every table, column and function the anonymous key may touch, so the full structure of the database can be read without signing in.
- Evidence: Catalog query on the local fresh install: `information_schema.role_table_grants where grantee='anon'` = 140 rows over 35 relations (34 tables and one view); `information_schema.views`: `current_qc_approvals` is_updatable = YES; `has_table_privilege('anon','coa_template_register','select')` = true. All 34 tables have `relrowsecurity` on and no SELECT policy is `true`.
- Suggested fix: One migration: `revoke all on all tables in schema public from anon`; `alter default privileges in schema public revoke all on tables from anon`; revoke insert/update/delete on `current_qc_approvals` from `authenticated`. Same migration as SCAN-P1-10 (functions). Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed on the local database (live grants to be confirmed with `scan-data-checks.sql` blocks P1-A to P1-C)
- Status: New

### SCAN-P1-13 — Three helper functions run with full database rights and can be called by anyone, signed in or not, including one that changes data
- Severity: Medium
- Kind: Security
- Where: database functions `_item_stock_unit(item, unit)`, `check_sufficient_stock(item, qty)`, `stability_reserve_left(line, batch)`; also `_unit_factor`, `qc_is_current_approval`. All are SECURITY DEFINER with no role test and are executable by `anon` (0001 default grant), except the last, which is executable by every signed-in user
- Finding: These functions are meant to be called only from inside other functions and triggers. Because they run as the database owner and are exposed through the API, a caller who knows an item's id (ids appear in page addresses such as `/items/<id>`) can: (a) set the stock unit of an item whose unit is still blank, without any login and without write rights on Item Master (`_item_stock_unit`); (b) read an item's code, name, unit and current on-hand quantity from the error text, and lock the item's row for the length of the call (`check_sufficient_stock`); (c) read the stability reserve of a batch (`stability_reserve_left`). The unit change passes the same unit check as a normal edit, and is recorded in the audit log with no user.
- Evidence: Local test as `anon`: `select _item_stock_unit(<finished product item with unit NULL>, 'kg')` returned `kg` and the item row then held `unit = kg`; `select check_sufficient_stock(<raw item>, 9999)` raised `Not enough stock for RM-T0001 · Test Oil: 8 kg available, 9999 kg needed.` With an invalid unit the call was stopped only by the `items_unit_check` constraint, not by any authorization. Script in `claude/scan-evidence-p1.sql` (part 5).
- Suggested fix: Revoke execute on these functions from `anon` and `public` (signed-in callers must keep it, because invoker functions such as the packaging and finished-product creators call them under the user's own session); inside `_item_stock_unit` and `check_sufficient_stock` also require `has_app_access()`, and make `_item_stock_unit` change a unit only for a caller who may edit items. Same migration as SCAN-P1-10 and SCAN-P1-12. Size S, plus a test that `anon` cannot execute them.
- Needs decision from Ravi: No
- Confidence: Confirmed (reproduced)
- Status: New (D12 accepts `expire_stale_fp_drafts` only)

### SCAN-P1-14 — Several server checks are missing or run before the permission check (unbounded line counts, negative thresholds)
- Severity: Low
- Kind: Security
- Where: `lib/actions/finished-product.ts:24-26` (`parseComponents`), `lib/actions/mfr.ts:18-20, 177-179` (`parseLines`, `parseProcedureSteps`), `lib/actions/packaging.ts:30-32, 228-230` (`parseMaterials`, packaging lines); `lib/actions/items.ts:25-31, 57, 167` (`numOrNull`); `lib/actions/documents.ts:23`
- Finding: (1) The number of repeated rows is read from a hidden field (`lineCount`, `stepCount`, `pl_count`) and used directly as a loop limit. A request with `lineCount=1000000000` makes the server loop for the whole function time limit; only the production-issue form caps its count (30). In `createFinishedProductBatch` and `createMfrDefinition` this parsing runs before the role check, so any signed-in account, even one with no role, can trigger it. (2) The low-stock threshold accepts negative numbers on the server (only the browser form has `min=0`); a negative value silently switches the low-stock flag off for that item. (3) Document revision number accepts negative and fractional values.
- Evidence: `const count = Number(formData.get("lineCount") || 0); for (let i = 0; i < count; i++)` with no upper bound; `numOrNull` returns any non-NaN number; `parseComponents` is called at `finished-product.ts:~75`, `canWrite` at `:81`. CLAUDE.md says actions "validate with zod"; only 5 of 25 action files use zod, the rest validate by hand.
- Suggested fix: Cap every repeated-row count (for example 200 recipe lines, 30 steps) and run `canWrite` first in every action; add min 0 to the threshold on the server. Size S.
- Needs decision from Ravi: No
- Confidence: Confirmed (code)
- Status: New

### SCAN-P1-15 — The Audit screen cannot answer "who changed this record?" once the day is busy
- Severity: Medium
- Kind: Gap
- Where: `app/(dashboard)/audit/page.tsx:16, 64-75`, `audit-filters.tsx`, `audit-table.tsx:54-76`
- Finding: The screen loads the newest 500 entries and offers only three filters: table, from-date and to-date. There is no paging, and no filter for the person, the action, or the record. A bulk upload or an opening-stock load writes one entry per row, so a single busy day can exceed 500 entries and the older ones of that day cannot be reached at all, even with the date range narrowed to one day. The Excel and PDF export covers only the 500 loaded rows. An auditor trying to follow one batch, one AR number or one person's activity has to scroll and read. The database already has an index on `(table, record, time)` that would make a record history cheap. Four audited tables are also missing from the Table filter: company details, opening-stock loads, opening-stock open/close, COA template revisions (they appear only under "all tables").
- Evidence: `const AUDIT_LIMIT = 500;` `.order("changed_at", { ascending: false }).limit(AUDIT_LIMIT)`; filters are `table`, `from`, `to` only. Filter list compared with the 34 audited tables: `company_settings`, `opening_loads`, `opening_stock_settings`, `coa_template_revisions` not listed.
- Suggested fix: Add filters for user, action and record (batch number, AR number, code, or the record id), page through results instead of a fixed 500, export the whole filtered set (server side), and add a "History" link on QC, batch, PO, item and MFR pages. Add the four missing tables to the filter. Size M.
- Needs decision from Ravi: No
- Confidence: Confirmed
- Status: New (E8 covers the audit log's size only)

### SCAN-P1-16 — Sign-ins, failed sign-ins and password changes by the user are not recorded in the app
- Severity: Medium
- Kind: Gap
- Where: `lib/actions/auth.ts` (`signIn`, `signOut`, `updatePassword`); `audit_account_action` (0072/0074); `lib/actions/admin-users.ts:225`
- Finding: The audit log records what people change in business records and what a System Admin does to accounts (create, reset, disable, enable). It does not record who signed in or out and when, failed sign-in attempts, or a password changed by the user from Profile or after a reset link. The only trace is "last sign-in" on User Roles. Schedule M / electronic-record guidance expects access logs to be reviewable, and a run of failed attempts on an account is the first sign of a guessed password. The "password changed by user" event is written only on the forced first-sign-in path (`completePasswordChange`), not on the Profile form, which makes SCAN-P1-04 harder to detect.
- Evidence: `grep -n "audit_account_action" lib/actions/*.ts` shows calls only in `admin-users.ts` (create, reset, complete forced change, disable, enable). `signIn` and `updatePassword` write nothing. Supabase's own Auth log keeps sign-in events, but only for a short period and only in the Supabase dashboard.
- Suggested fix: Record `sign_in`, `sign_out`, `sign_in_failed` (email only, no password) and `password_changed_by_user` in `audit_log` through a small insert-only function; show them under the Audit table filter "Sign-ins". Size M.
- Needs decision from Ravi: No
- Confidence: Confirmed
- Status: New

### SCAN-P1-17 — The Audit screen cannot tell a normal screen action from a direct call to the database API
- Severity: Low
- Kind: Gap
- Where: function `_audit_changed_via()` (0072)
- Finding: Each audit entry has a "via" value: `app` when the caller's token role is `authenticated`, `server` for the service key, `auth service`, otherwise `database`. A person using the browser and a person calling the API directly with their own token both show as `app`, so the one marker meant to reveal bypasses cannot reveal SCAN-P1-07, 08 and 09 style actions. Only work done in the Supabase SQL editor shows as `database`.
- Evidence: `if v_role = 'authenticated' then return 'app'`; the app's server actions run with the user's own token, so nothing differs.
- Suggested fix: Have the app mark its own writes (for example a request header or `set_config('app.via', 'screen', true)` set by a small wrapper) and report anything without that mark as "direct API". Size M. Lower priority if SCAN-P1-07 to 09 are fixed in the database.
- Needs decision from Ravi: No
- Confidence: Confirmed (code)
- Status: New

### SCAN-P1-18 — Next.js is pinned to a version with published security advisories; a patched release exists
- Severity: Medium
- Kind: Security
- Where: `package.json:21` (`"next": "16.3.3"`, exact pin); `package-lock.json`
- Finding: `npm audit --omit=dev` reports 7 advisories against Next 16.3.3, the pinned version, rated critical overall. All are fixed in 16.3.8 or later (npm also offers 16.4.0). How much they matter here: the critical one (remote code execution in `next/og` ImageResponse) needs a feature the app does not use (no `ImageResponse` or `next/og` anywhere), and the two cache-poisoning advisories are for self-hosted servers, not Vercel. The image-optimisation request-forgery advisory (high) touches `/_next/image`, which is switched on by default; the app uses `next/image` only for its own logo files and sets no `remotePatterns`, which narrows it but does not remove the endpoint. The remaining ones (draft-mode cache leak, metadata image routes, dev-server endpoint) are not features this app uses. So the real exposure today is low, but a critical flag on a production dependency will show on any security review, and the fix is a version bump. Four transitive packages are also flagged: `sharp` (high, the image library Next uses), `brace-expansion` (high, denial of service), `source-map-js` (high, build-time), `dompurify` (low, comes in through the PDF library). All four have patched versions and `npm audit fix` reaches them without a major change.
- Evidence: `npm audit --omit=dev --json` (7 vulnerabilities: next critical; brace-expansion, sharp, source-map-js high; exceljs/uuid, dompurify moderate/low). `grep -rn "ImageResponse|next/og|remotePatterns|images:" app lib components next.config.ts` finds nothing. `npm view next versions` lists 16.3.8 and 16.4.0.
- Suggested fix: Bump `next` to 16.3.8 (smallest step; `eslint-config-next` to match), run `npm audit fix` for the transitive ones, then the usual type check, lint and build. Size S. The exceljs/uuid advisory is already accepted (D15) and stays out of this. Worth a calendar habit: re-run `npm audit` before each release.
- Needs decision from Ravi: No
- Confidence: Confirmed (advisory list); exposure is Likely low
- Status: New (D15 covers only the exceljs/uuid item)

## Carried to later steps

- Sign-in and sign-out events are not in the app's Audit screen, and there is no per-account lockout beyond Supabase's own rate limits → P1.6.
- `profiles` update rights (can a user change anything beyond their own name) → P1.3.
- Print and download events (labels, COA, slips) are not audited at all; label reconciliation is a GMP control → P4.5 and P9.
- Whether the backup copy made before the 13 Sept purge still exists as an extra schema in the live database (block P1-D in `scan-data-checks.sql`) → Ravi to run.
- Decision lock and edit rules for QC records beyond what is logged above → P4.1.
- Two QC checkers acting on the same record at once: the Round 1 action reads the status, then updates without re-checking it, so the second checker can overwrite `checker_by` and comments → P10.1.
- Server Action body limit is the platform default (1 MB): a large opening-stock or bulk file is refused with a raw framework message → P2.3 / P2.4.

## P1.2 — Role matrix (who can write what, screen vs server action vs database)

W = may write. Reads: every role that has at least one role can read every table (B1). The Super Auditor has no write anywhere except feedback and (SCAN-P1-11) opening stock.

| Module | System Admin | Inventory Mgr | MFR Mgr | Quality Checker | QC Reviewer | Super Auditor | Screen = action = database? |
|---|---|---|---|---|---|---|---|
| Item types, Items | W | W | W | – | – | – | Yes |
| Vendors, Purchase (all steps) | W | W | – | – | – | – | Yes |
| Delete / reopen PO / delete master data | W | – | – | – | – | – | Yes |
| QC: assign / start retest | W | W | – | W | W | – | Database also lets MFR Mgr insert (needed for FP submit) |
| QC Round 1 | W | – | – | W | – | – | Yes (but see SCAN-P1-07, 08, 09) |
| QC Round 2 | W | – | – | – | W | – | Yes (same) |
| COA issue | W | – | – | W | W | – | Yes |
| COA templates | W | W (items) | W | – | – | – | Via function `can_manage_coa_template`; table itself system_admin only. Consistent with the FB-0053 decision |
| Wastage | W | W | – | W | W | – | Yes |
| MFR | W | – | W | – | – | – | Yes |
| Finished product, Packaging | W | W | W | – | – | – | Yes |
| Equipment, Dead stock | W | W | W | W | W | – | Yes |
| SOP/STP documents | W | – | – | W | W | – | Yes |
| Line clearance, Env. control | W | – | W | W | W | – | Yes (deprecated screens) |
| BMR (deprecated) | W | – | – | – | – | – | Code system_admin only; database also allows MFR Mgr and both QC roles (deprecated, low impact) |
| Users and roles, Company, Purge, Feedback triage | W | – | – | – | – | – | Yes |
| Audit log read | W | – | – | – | – | W | Yes |
| Bulk upload | by module | by module | by module | by module | by module | – | Yes (each module's own role set) |
| Opening stock load | W | W | W | W | W | W | Any role (decision); see SCAN-P1-11 |

Screen gating: every write button and every admin page is gated by the same role sets; pages for User Roles, Purge, Audit, Bulk upload, BMR show an access message to other roles. Downloads under `/api` repeat the check. The side menu shows every link to every role by design (the page then explains).


## P1.3 — Row-level security and grants, table by table

- 34 tables: all have RLS on. 93 policies, all for role `public`. Every SELECT policy requires an assigned role (`has_app_access()`), except `profiles` / `user_roles` (own row also visible) and `audit_log` (System Admin and Super Auditor only).
- Write policies: matrix in P1.2. Tables with no write policy are written only through functions: `inventory_ledger`, `production_issue_batches` (policy `false`), `company_settings`, `opening_loads`, `opening_stock_settings`, `coa_template_lines`, `coa_template_revisions`, `audit_log`.
- Immutable by omission (no UPDATE or DELETE policy): `quality_checks` (no DELETE), `coa_records`, `packaging_issues`, `packaging_issue_items`, `environmental_control_readings`, `line_clearance_checks`.
- 12 views, all `security_invoker`; `anon` has no SELECT except `coa_template_register`; none of the other views is writable except `current_qc_approvals`.
- All 57 SECURITY DEFINER functions have a fixed `search_path`.
- Profiles: a user may update only their own row and only `full_name` exists as a free column; audit and stamp triggers apply.

## P1.4 — Database functions

- 119 project functions (41 triggers, 57 SECURITY DEFINER of which 24 triggers). 155 in the schema on a fresh local install, the rest are the pgcrypto extension.
- Every SECURITY DEFINER function has a fixed `search_path` (checked on all 57).
- Dynamic SQL appears in only three functions (`_next_ar_number`, `peek_next_item_code`, `purge_test_data`); each builds names from fixed lists or its own arguments after validation, so no injection path.
- No function contains an UPDATE or DELETE without a WHERE clause (all 119 bodies scanned), so the hosted-database rule is not at risk.
- The 41 non-trigger functions that `anon` can execute: 26 are plain invoker functions (the number generators, `peek_*`, helpers; see SCAN-P1-10) and 15 are definer functions. Of the 15, ten check the caller's role (or `auth.uid()`) at the top and refuse an anonymous call (`approve_mfr_definition`, `bulk_create_purchase_orders`, `create_mfr_definition`, `purge_test_data`, `submit_purchase_order`, `update_mfr_procedure`, `update_mfr_recipe`, `has_*` helpers); four have no check (`_item_stock_unit`, `_unit_factor`, `check_sufficient_stock`, `stability_reserve_left`; SCAN-P1-13); `expire_stale_fp_drafts` is accepted as D12.
- `get_next_ar_number` / `get_next_fp_ar_number` are closed to `anon` but open to every signed-in role, including the read-only auditor, which can advance the AR counter; low impact.

## P1.5 — Server action input handling

- 25 action files read. Validation is by hand in 20 files and zod in 5 (dead-stock, equipment, feedback, purchase, vendors). The database repeats the important rules: `load_opening_stock` re-validates every row (quantity above 0, dates not in the future, old AR format and uniqueness, retests 0 to 3, expiry required for Approved), so a direct call of the function cannot skip the file checks.
- What is trusted from the client: record ids come from bound arguments or hidden fields and are always re-checked by RLS and workflow triggers; `item_id` for a QC record is re-derived from the batch on the server (good); signature fields are not (SCAN-P1-09).
- Repeated-row counts and a few number checks: SCAN-P1-14.
- No mass assignment: no action spreads the whole form into a table; every column is named.
- Redirect and banner text: `?saved=` accepts only known keys; `?created=` values are looked up in the database or matched against a strict pattern before display, so a crafted link cannot show arbitrary text.
- URL and file inputs: COA file link (B17) and document links (SEC-05, C5) are already tracked; uploaded Excel files are read in memory (SEC-08, C6).

## P1.6 — Audit trail coverage and integrity

- Coverage: all 34 tables carry a row-level audit trigger (insert, update, delete) and a truncate trigger, including `company_settings`, `opening_loads`, `opening_stock_settings`. Account events (create, reset, disable, enable) are written as `auth.users` entries.
- Integrity: `audit_log` cannot be written by users (policy `false`), and a trigger blocks UPDATE, DELETE and TRUNCATE on it for everyone. Only the SQL editor with owner rights could switch the trigger off. Entries hold the full old and new row, the user from the token, and a database timestamp.
- Noise control: updates that change only `updated_at` / `updated_by` are skipped, so entries are real changes.
- Weak spots: SCAN-P1-15 (reading it), SCAN-P1-16 (no access log), SCAN-P1-17 (screen versus API). Not recorded by design: reads, exports and printing.

## P1.7 — Secrets, headers, dependencies, exports

- Secrets: no keys, tokens or passwords in the repo. The service-role key is read only in `lib/supabase/admin.ts` on the server; the only `NEXT_PUBLIC_` values are the Supabase URL and the public anon key. Seed script reads credentials from the environment.
- Headers: framing, content-type sniffing, referrer and device permissions are set on every response. The full script policy is report-only (known, C15, on hold). HTTPS-only is supplied by Vercel.
- Dependencies: SCAN-P1-18.
- Excel export: text cells are written as text cells. Tested: a value such as `=1+1`, `+cmd` or `@SUM(1)` is stored as a string, not a formula, so a vendor or item name typed with a leading `=` cannot run when the file is opened. Number and date cells are typed. No CSV export exists, so no CSV formula issue.
- Excel import: a formula cell is read as its stored result; rich text and hyperlinks are read as visible text. Nothing is evaluated.
- PDF and Word: text is placed as text; no HTML is rendered from user data.
- App manifest: static, public, no user data.

## Checked and found sound (P1.1 to P1.7)

- Open-redirect protection: `safeRedirectPath` uses the URL parser and rejects `//host`, `/\host` and outside origins; used by the action and the login page.
- Sign-in errors are fixed text, so wrong email and wrong password look the same (no account discovery); reset request always answers the same.
- Forwarded identity headers `x-invento-user-id` / `-email` are overwritten or deleted on every request, so a client cannot spoof them.
- Disabled accounts are signed out on the next request (`banned_until` checked on every call).
- Forced password change is enforced for every route including Server Action posts; the flag lives in `app_metadata` (service-role only) and is cleared only after the password has changed.
- Every server action that writes has a role test (`canWrite` or system_admin) matching the database policy; the database repeats it on every write table; all 34 tables have row-level security on and no policy is open to everyone.
- Direct inserts of a pre-approved MFR or a pre-submitted purchase order are refused, and so are direct edits of submitted PO lines (suite sec04).
- Auditor role really is read-only: no write policy lists it.
- No-role accounts get the "Awaiting access" page instead of an empty app.
- Password length 10 to 72 enforced in both actions and in the forms.
- Public paths are limited to the four auth pages; `/api/*` and `.pdf` files also pass through the sign-in check.

## Areas read (P1.1 to P1.7)

`trg_fn_audit_log`, `audit_account_action`, `_audit_changed_via`, audit trigger list for all tables, `audit_log` policies and indexes, `app/(dashboard)/audit/{page,audit-filters,audit-table}.tsx`, table-filter list against the catalog, account audit calls in `lib/actions/admin-users.ts`.

`lib/actions/qc.ts` (create, Round 1, Round 2), `finished-product.ts` (parsers, create), `mfr.ts` (parsers), `packaging.ts` (parsers), `items.ts` (create/update numerics), `documents.ts`, `environmental-control.ts`, `opening-stock.ts` (upload), `components/ui/flash-host.tsx`, `lib/saved-messages.ts`, the `created` banners on vendors, equipment, packaging pages; `load_opening_stock` body (validation lines).

All 119 project function bodies (`pg_get_functiondef`, scanned for missing WHERE and dynamic SQL); full reads of `_item_stock_unit`, `_unit_factor`, `check_sufficient_stock`, `expire_stale_fp_drafts`, `stability_reserve_left`, `qc_is_current_approval`, `can_manage_coa_template`, `upsert_coa_template`, `bulk_create_coa_templates`, `_next_ar_number`, `peek_next_item_code`, `purge_test_data`.

Catalog queries on the fresh install (`pg_policies`, `pg_class`, `information_schema` grants and views, `pg_proc`); `0001`, `0006`, `0075`, `0082` grant statements; `_audit_changed_via`, `_is_direct_client_write`.

`lib/constants/roles.ts`, `lib/constants/nav.ts`, `components/shell/nav-list.tsx`, all 25 files in `lib/actions` (role gates), the two `/api` template routes, role gates in all 70 `page.tsx` files (counts), `pg_policies` for every write policy, the role checks inside all non-trigger functions (catalog query), `0054` and `0075` migrations, `supabase/tests/sec04_workflow_guards.sql`; own SQL scripts (saved as `claude/scan-evidence-p1.sql`) run on a scratch copy of the local database.

`proxy.ts`, `lib/supabase/{middleware,server,client,admin}.ts`, `lib/auth/{session,user-accounts}.ts`, `lib/constants/auth.ts`, `lib/actions/auth.ts`, `lib/actions/admin-users.ts` (`completePasswordChange`), `app/(auth)/*` (all five pages and layout), `app/(dashboard)/layout.tsx`, `app/layout.tsx`, `next.config.ts`, `docs/user-guide/USER_GUIDE.md` (reset section).

`package.json`, `package-lock.json`, `npm audit` output, `next.config.ts`, `app/manifest.ts`, `lib/excel-export.ts`, `lib/table-export.ts`, `lib/bulk-upload/parse.ts` (cell reading), `next/image` uses (4 files), secret-pattern search across the repo, and a small ExcelJS test of text cells that start with `=`.
