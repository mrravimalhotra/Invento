# Supabase setup

Step-by-step instructions to stand up the database this app needs. Two
paths are covered — the **Dashboard** (no CLI install, good for a first
pass) and the **Supabase CLI** (better once you're iterating on migrations
regularly). Either gets you to the same place.

Budget about 15 minutes for the Dashboard path.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an
   account — the free tier is enough for this app).
2. **New project** → pick an organization, name it (e.g. `invento`), set a
   database password (save it somewhere — you won't need it day-to-day
   since the app never connects with it directly, but you'll want it if you
   ever need `psql` access), pick the region closest to Atharva's users, and
   create it. Provisioning takes 1–2 minutes.

## 2. Apply the schema

The three migration files under `supabase/migrations/` must run **in
order** — `0001_init.sql` first, then `0002_transactions.sql`, then
`0003_fixes.sql`. Each one depends on tables/functions the previous one
created.

### Option A — SQL Editor (no install required)

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. **New query**, paste the entire contents of `supabase/migrations/0001_init.sql`, click **Run**. It should finish with no errors — this creates every table, the RLS policies, and the auto-numbering functions.
3. New query again, paste `supabase/migrations/0002_transactions.sql`, **Run** — this adds the triggers that write to the inventory ledger automatically and enforce the QC gate.
4. New query again, paste `supabase/migrations/0003_fixes.sql`, **Run** — three small fixes found while building the modules (see the comments at the top of that file for what and why).
5. Open **Table Editor** and confirm you see tables like `items`, `purchase_lines`, `quality_checks`, `finished_product_batches`, etc. — if they're there, the schema applied cleanly.

### Option B — Supabase CLI (recommended if you'll keep editing the schema)

```bash
npm install -g supabase
supabase login
cd invento-app
supabase link --project-ref <your-project-ref>   # find this in Project Settings → General
supabase db push                                  # applies every file in supabase/migrations/, in order
```

`db push` is idempotent-safe to re-run — it only applies migrations it
hasn't seen before, tracked in a `supabase_migrations` table it creates for
itself.

## 3. Get your API keys

1. In the dashboard: **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public** key. You will *not*
   need the `service_role` key for normal use — only `scripts/seed-admin.ts`
   uses it, once, to bootstrap the first admin account (see step 6).

## 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000     # becomes your real domain in production
```

Leave `SUPABASE_SERVICE_ROLE_KEY` blank for now — only set it in your
shell environment when you actually run the seed-admin script (step 6),
never commit it, never put it in `.env.local` if that file might end up
anywhere shared. `.env.local` is already git-ignored, but the service-role
key bypasses every RLS policy in the app, so treat it like a root password.

## 5. Configure Auth

The app uses Supabase Auth (email + password) directly — a few dashboard
settings matter:

1. **Authentication → URL Configuration**: set **Site URL** to
   `http://localhost:3000` for local dev (change to your real domain once
   deployed — this is what password-reset emails link back to).
2. **Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:3000/reset-password` (and your production equivalent
   later, e.g. `https://invento.yourdomain.com/reset-password`) — this is
   the page `requestPasswordReset` in `lib/actions/auth.ts` sends people to.
3. **Authentication → Providers → Email**: on by default, that's all this
   app uses (no Google/OAuth wired up, unlike a stray UI reference in the
   old baseline — this build only does email+password). Decide whether you
   want **Confirm email** on — if it's on, a new registrant can't sign in
   until they click the link in a confirmation email; if you're the only
   one testing for now, turning it off is simpler and you can turn it back
   on before real users register.

## 6. Install, run, and bootstrap the first admin

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account
at `/register`. Registering only creates a sign-in — it grants **no
roles**, by design (see `docs/DESIGN.md` §3: the User Roles screen is
itself `system_admin`-only, so nobody can self-escalate, which means the
very first admin has to be granted from outside the app).

Grant it with the seed script, using the **service role** key from step 3:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ... NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co \
  npx tsx scripts/seed-admin.ts you@example.com
```

You should see `Granted system_admin to you@example.com (...)`. Refresh
the app, sign in, and **User Roles & Access** is now usable — assign roles
to every other account from there instead of running the script again.

## 7. Sanity-check the RLS is actually working

Worth doing once, since access control is the headline fix in this
rebuild: sign in as an account with **no roles assigned**, and confirm the
"New" buttons on master-data screens are hidden and that a direct attempt
to submit one of those forms is rejected — not just hidden client-side.
Then sign in as your `system_admin` account and confirm everything works
normally. If you see a Postgres/RLS error surfacing as a raw error message
anywhere rather than a clean "not authorized" message, note which screen —
that's a spot the corresponding module doc under `docs/modules/` should be
checked against.

## 8. Deploying (when you're ready)

Any Next.js host works (Vercel is the path of least resistance for a
Next.js app). Whichever you use:

- Set the same three env vars from step 4 in the host's environment
  variable settings — `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (this one becomes
  your real production URL).
- Update Supabase **Authentication → URL Configuration** (step 5) to your
  production domain, and add its `/reset-password` path to Redirect URLs —
  keep the localhost ones too if you'll still develop locally afterward.
- Never set `SUPABASE_SERVICE_ROLE_KEY` in the hosting platform's
  environment — it's a local-only, one-time bootstrap secret for
  `scripts/seed-admin.ts`, the deployed app itself never reads it.

## Troubleshooting

- **"relation does not exist" errors in the app** — a migration didn't
  apply, or applied out of order. Re-check step 2; `0002` and `0003` both
  depend on objects `0001` creates.
- **Can't sign in after registering** — check whether "Confirm email" is on
  (step 5) and whether the confirmation email actually arrived (Supabase's
  built-in email sending has low rate limits on the free tier — fine for a
  handful of test accounts, not for real onboarding, at which point look at
  **Authentication → Providers → Email → SMTP Settings** to plug in a real
  mail provider).
- **`seed-admin.ts` says "No auth user found"** — the account has to exist
  first; register it at `/register` before running the script.
- **A screen shows no error but silently does nothing on submit** — almost
  always an RLS policy rejecting the write because the signed-in user
  lacks the role that screen requires; check **User Roles & Access**.
