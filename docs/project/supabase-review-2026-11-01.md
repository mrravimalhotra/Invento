# Supabase review, 1 Nov 2026

Done with Supabase's own skills (`supabase`, `supabase-postgres-best-practices`, installed in `.claude/skills/` from `supabase/agent-skills`), Supabase's security and performance advisors, and read-only queries on the live database. Nothing on the live database was changed.

## Fixed in this pass (Pass 121)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High** | The sign-in proxy (`proxy.ts`) skipped every address ending in `.png`, `.svg`, `.jpg`, `.gif`, `.webp`, `.ttf`. A page address such as `/items/abc.png` therefore rendered without the proxy, and `getCurrentUser()` (`lib/auth/session.ts`) trusted an `x-invento-user-id` header sent by the visitor. Shown locally: with a forged header that page returned 200 instead of the sign-in redirect. The same path also skipped the disabled-account and forced-password-change checks. Data reads stayed protected by RLS (they use the real session), but the System Administrator actions in `lib/actions/admin-users.ts` decide on `getCurrentUser()` roles and then use the service-role key. | The proxy now skips only the named public files (logo, icons, favicon, manifest, `/fonts/`). Verified locally: forged requests to `.png/.svg/.jpg/.webp` page addresses now redirect to sign-in; public files still load before sign-in. Unit test `tests/unit/proxy-matcher.test.ts`. |

## Checked and in order

- Row level security is on for every table in `public`, and every table has policies.
- Every read rule requires app access (`has_app_access()`); the audit log only System Admin and Super Auditor.
- No policy uses `auth.role()` or `user_metadata`; no write rule is open (`true`); every update rule has its check; no view skips RLS; the `anon` role has no table rights; no storage buckets.
- The 42 SECURITY DEFINER functions signed-in users may call (advisor warning) all check the caller (`has_role`, `has_any_role`, `has_app_access`, `can_manage_coa_template`) or only read; anonymous visitors can call none; all have a fixed `search_path`. Known since 0124.
- The service-role key is read on the server only (`lib/supabase/admin.ts`), never a `NEXT_PUBLIC_` variable; the server checks the user with `getUser()`; the package lock is committed.

## Open, for Ravi to decide (no change made)

| # | Kind | Finding | Suggestion |
|---|---|---|---|
| 2 | Security setting | Leaked password protection is off (Supabase Auth). | Needs the Pro plan; decide at go-live (B3 / MFA list). |
| 3 | Tidy-up | Schema `backup_20260913_1116` (25 tables, about 4,800 rows, a pre-purge copy) is still in the live database. Not reachable by the app's roles. | Drop before go-live (already in the pending-items file). |
| 4 | Performance | 91 foreign keys without an index (none on BMR tables). | One behaviour-neutral migration adding the indexes. |
| 5 | Performance | 5 policies re-run `auth.uid()` for every row (`page_feedback` insert / owner update / owner delete, `profiles` self insert / self write). | Same migration: wrap in `(select auth.uid())`. |
| 6 | Performance | 40 "multiple permissive policies" warnings: tables with a read rule plus an all-actions write rule, so reads check both. | Split the write rules into insert / update / delete; worth it only when data grows. |
| 7 | Tidy-up | Most policies are written for role `public` instead of `authenticated`. Harmless today (anon has no table rights). | Optional, with item 6. |
| 8 | Information | 11 indexes not yet used (test-data volumes). | Leave. |
