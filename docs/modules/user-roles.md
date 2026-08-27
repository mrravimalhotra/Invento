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

Users are listed by **display name only** (from `profiles.full_name`, the
thin wrapper table populated on signup by the `handle_new_user()` trigger).
Email is *not* shown: `auth.users` isn't queryable from the client under RLS,
and there's no `profiles.email` column. Showing email would need a small
`/api/admin/users` Route Handler backed by the service-role key — that's a
few hours of work (an admin-only Route Handler calling
`supabase.auth.admin.listUsers()`), explicitly out of scope for this pass.
Flagging it here for Ravi to prioritize if email-in-list turns out to matter
in practice; name-only was sufficient to identify every seeded/test account
during review.

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
3. Deletes the user's existing `user_roles` rows, then inserts the new
   selection.
4. `revalidatePath("/user-roles")`.

## Known behavior worth flagging to Ravi

Unchecking your own `system_admin` box and saving removes your own admin
access immediately (no confirmation dialog, no "last admin" guard) — this
matches the old baseline's behavior exactly and the task brief didn't ask for
a lockout guard, but it's easy to do by accident. `scripts/seed-admin.ts`
exists specifically to re-bootstrap a `system_admin` from the server side if
every admin account ever gets locked out this way, so it's recoverable, not
catastrophic — flagging in case a "can't remove the last system_admin"
guard is wanted in a follow-up pass.

## Files

- `app/(dashboard)/user-roles/page.tsx` — gate + list (Server Component)
- `app/(dashboard)/user-roles/user-role-row.tsx` — per-user form (Client
  Component, `useActionState`)
- `lib/actions/user-roles.ts` — `setUserRoles` Server Action
