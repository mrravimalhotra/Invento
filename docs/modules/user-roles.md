# Module 13 — User Roles & Access

Route: `/user-roles`. Cross-reference: `docs/DESIGN.md` §3 (Access control — how
the #1 gap gets closed) and §4.13.

## Why this module matters

In the pre-review baseline, this screen was **completely unrestricted** — any
signed-in employee could open it and grant themselves `system_admin`, which in
turn unlocked every write in the system. This was the sharpest single finding
in the whole requirements review.

**This closes that finding.** The fix is not a UI convention this time — it is
a database constraint:

```sql
create policy user_roles_write on public.user_roles
  for all using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));
```

(`supabase/migrations/0001_init.sql`, table `user_roles`.) Nobody who does not
already hold `system_admin` can write a row to `user_roles` — not through this
screen, not through a direct `supabase.from("user_roles").insert(...)` call
from the browser console, not through any future screen that forgets to check
first. The self-escalation hole is closed structurally, not by convention.

The app layer (this module) exists to give an authorized admin a usable
interface onto that database rule, and to fail with a readable message
instead of a raw Postgres RLS error when someone without access tries anyway.

## Screens

### `/user-roles` — single screen, two states

- **Not `system_admin`** (`!canWrite(user.roles, "user_roles")`): the whole
  form is replaced with a plain "Access restricted" card —
  *"You need System Admin access to manage roles."* This is not a hidden
  button; the entire management UI never renders for a non-admin, matching
  the instruction that this module (unlike every other one) is admin-only for
  reads of the management UI too — the six-role checkbox grid and Save
  actions simply don't exist on the page for anyone else. (List reads on
  `user_roles` itself are open to all signed-in users per the cross-cutting
  RLS rule — that's unchanged and is how the topbar/nav can compute
  `canWrite` for every user — but this screen's *editing UI* is
  admin-gated in the app, on top of that.)
- **`system_admin`**: an amber callout at the top states plainly —
  *"This is now database-enforced — even a direct API call from a non-admin
  account is rejected, not just this screen."* — then a card listing every
  user (joined from `profiles`, ordered by name) as one row each. Each row is
  its own `<form>` with a six-checkbox set (one per `ROLES` entry — Inventory
  Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR
  Manager) pre-checked to that user's current roles, and its own "Save"
  button.

Saving a row **replaces that user's full role set**: the Server Action
deletes all of that user's existing `user_roles` rows, then inserts a row per
currently-checked box (zero rows if none are checked). This matches how the
old baseline's UI worked for this screen — the difference is that the write
is now RLS-gated to `system_admin`, both in the database and, redundantly, in
the Server Action.

### Users list — what's shown, what isn't

Users are listed by display name (from `profiles.full_name`, populated by the
`handle_new_user()` trigger). Since 28 Sept 2026 each row also shows the
account's **email**, **last sign-in**, and a **"Temporary password — not
changed yet"** badge. Those three come from Supabase Auth, not from a table
RLS can expose, so the page reads them through the service-role client
(`lib/auth/user-accounts.ts`, `getUserAccountStatuses()`), and only inside the
`system_admin` branch of the page. If `SUPABASE_SERVICE_ROLE_KEY` isn't set on
the server, the page still works for role assignment and shows an amber note
in place of the Add user form.

## Account creation and temporary passwords (28 Sept 2026)

Ravi: "admin should be able to set user and default password which should be
changed at first login" — replacing public self-registration, which let
anyone create a login (see `docs/AI_TESTING_SECURITY_PERFORMANCE_REFERENCE.md`,
SEC-01).

- **Add user** card (top of `/user-roles`, `system_admin` only): full name,
  email, temporary password (type one or click **Generate** — 12 characters
  from `crypto.getRandomValues`, look-alike characters removed), and at least
  one role. `createUserAccount` (`lib/actions/admin-users.ts`) creates the
  Supabase Auth user already email-confirmed, with
  `app_metadata.must_change_password = true`, then inserts the roles **with
  the admin's own session** so `user_roles`' RLS policy still gates them. If
  the role insert fails, the just-created account is deleted again so no
  role-less login is left behind. After success the email and temporary
  password stay on screen so the admin can pass them on privately.
- **Reset password** (per row, two-step, not shown on your own row):
  `resetUserPassword` sets a new temporary password and re-sets the flag.
- **Forced change:** `proxy.ts` → `lib/supabase/middleware.ts` reads the user
  fresh from Supabase Auth on every request; while the flag is set, every
  route (pages and Server Action POSTs) redirects to `/change-password`,
  which is the only page they can use (plus Sign out). A reset therefore also
  locks any session the user already had open. `completePasswordChange`
  changes the password first (Supabase rejects reusing the temporary one),
  then clears the flag with the service-role client, refreshes the session
  and sends them to the dashboard. The redirect rule is a pure function,
  `forcedPasswordChangeRedirect()` in `lib/constants/auth.ts`.
- **Why `app_metadata`:** users can edit their own `user_metadata` but not
  `app_metadata` (service-role only), so nobody can clear the flag on
  themselves. Known limit: someone holding a temporary password could still
  query the database directly before changing it — acceptable, since the
  admin who issued it already has full access.
- **Self-registration closed:** `/register` now explains that accounts come
  from the System Administrator; `signUp` always refuses; the login page's
  Register link is gone. Also switch off **Authentication → Sign In /
  Providers → Allow new users to sign up** in Supabase — the app change alone
  doesn't stop a direct call to Supabase Auth's signup endpoint.

## Server Action

`lib/actions/user-roles.ts` — `setUserRoles(userId, prevState, formData)`:

1. Re-checks `canWrite(currentUser.roles, "user_roles")` itself — defense in
   depth per `docs/AGENT_BRIEFING.md`, even though RLS is the real backstop —
   and returns `{ error: "Not authorized. Only System Admin can change user
   roles." }` rather than letting a raw RLS failure reach the UI.
2. Reads all checked `roles` values from the submitted form, filtered against
   the `ROLES` constant (defense against a tampered form posting an invalid
   role string — the DB `check` constraint would reject it anyway, but this
   fails earlier with a clearer path).
3. Calls `set_user_roles(p_user_id, p_roles)` (`0073_set_user_roles.sql`,
   SEC-07) — one database transaction that adds the newly ticked roles and
   removes the un-ticked ones (untouched roles stay as they are, so the audit
   log shows only real changes). Before 28 Sept 2026 this was a delete-all
   followed by a separate insert, which could leave a user with no roles if
   the second request failed.
4. `revalidatePath("/user-roles")` and the root layout (Topbar badge).

## Last System Admin guard (SEC-07, 28 Sept 2026)

The database refuses any change that would leave no System Admin — un-ticking
the box on this screen, a direct API delete/update of a `user_roles` row, a
SQL-editor delete, or deleting that user's account (the cascade is caught
too). The whole save is rolled back, so the user keeps their previous roles,
and the screen shows "At least one System Admin must remain. Give System
Admin to another user first." An admin can still remove their own admin
access while another admin exists. Two admins removing each other at the
same moment are serialised by a transaction lock, so only one succeeds
(verified locally for both the screen path and direct API deletes).
`scripts/seed-admin.ts` remains the server-side recovery path.

## Disabling a leaver's account (28 Sept 2026)

Ravi: "add functionality to disable user if user leaves". An account that
has ever made a change can't be deleted — `audit_log` and the
`created_by`/`updated_by` columns still point to it, which keeps the history
attributable — so a leaver is **disabled** instead.

On each user row (System Admin only, not on your own row): **Disable
account** → confirm. `disableUserAccount()` (`lib/actions/admin-users.ts`):

1. Removes all their roles with `set_user_roles()` (0073) — one transaction,
   refused if they are the last System Admin (then nothing else happens).
2. Bans the account in Supabase Auth (`ban_duration` ~100 years): no new
   sign-in, no session refresh. The login screen says "Your account has been
   disabled. Contact your System Administrator if you need access."
3. Any session they still have open is signed out on its next request
   (`lib/supabase/middleware.ts` checks `banned_until` on the fresh
   `getUser()` result).

Disabled users are listed at the bottom, greyed, with a "Disabled — cannot
sign in" badge and a **Re-enable account** button. Re-enabling lifts the ban
and brings the account back with no roles — tick them again and Save roles.

Audit: the role removals (0072 trigger), the ban/unban (account-change
audit, `banned_until`), and "Account disabled / re-enabled by System Admin"
naming the admin (`audit_account_action()`, events added in
`0074_disable_user_account.sql`).

Limit: for up to an hour after disabling, a still-valid access token could
read data through the API directly (not through the app, which signs them
out). It can't change anything — their roles are already gone.

## Files

- `app/(dashboard)/user-roles/page.tsx` — gate + list (Server Component)
- `app/(dashboard)/user-roles/user-role-row.tsx` — per-user form (Client
  Component, `useActionState`)
- `lib/actions/user-roles.ts` — `setUserRoles` Server Action
- `app/(dashboard)/user-roles/account-access-control.tsx` — Disable / Re-enable account control
- `lib/actions/admin-users.ts` — `disableUserAccount` / `enableUserAccount`

## A System Admin cannot remove their own System Admin role (30 Sept 2026, migration 0089)
Ravi: "own System Admin option should be disabled for System Admins so they can not degrade their own access. Only another System Admin can degrade other System Admins."
- On your own row the System Admin box is ticked and greyed out, with a note. Other rows are unchanged.
- The save action refuses it with a clear message, and the database refuses it on every path (trigger `trg_user_roles_no_self_admin_removal` on `user_roles`): the screen, a direct API call, any attempt to clear your own roles.
- Another System Admin can still change your roles, and the existing "at least one System Admin must remain" guard (0073) still applies. The SQL editor / service role is not affected (no signed-in user).
- Adding roles to yourself, and removing your own non-admin roles, still work.
- Suite `sec07` (41 checks; 1 known control failure unchanged) covers it.
