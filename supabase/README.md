# Invento database scripts

## What is here

- `migrations/` — one numbered SQL file per change (see the folder for the newest number). This is the
  history. Existing databases only ever need the newest file(s) they have not run yet.
- `fresh-install.sql` — **all migrations in one file**, for building a brand-new,
  empty Supabase project with a single paste. Generated; never edit it by hand.

## Building a new database from scratch

1. Create a new Supabase project.
2. Supabase → SQL Editor → paste the whole of `fresh-install.sql` → Run. It should end
   with "Success". It contains the tables, security rules, functions, triggers, the
   audit trail and the legacy equipment list (304 rows) that migration 0034 loads.
3. Create the first System Admin: `scripts/seed-admin.ts` (needs the project URL and
   service role key in the environment).
4. Set the things that live in dashboards, not in SQL:
   - Authentication → Sign In / Providers: **Allow new users to sign up = off**
     (accounts are created by a System Admin).
   - Authentication → Providers → Email: **minimum password length = 10**.
   - Vercel → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. The live database was moved to India time (Asia/Kolkata) by migration 0081; the
   fresh-install file does the same.

**Never run `fresh-install.sql` on a database that already holds data.** The first
migration recreates the tables.

## Keeping `fresh-install.sql` current

After adding a migration, run this from the repository root and commit the result:

```
node scripts/build-fresh-install.mjs
```

It joins the migrations in the order that works on an empty project. One quirk it
handles: `0064_fix_bulk_create_mfr_definitions_replay.sql` must run straight after
`0052`, not in its own numbered slot.

## How migrations reach the live database

Supabase's GitHub integration applies them (Project Settings → Integrations → GitHub:
working directory `.`, production branch `main`, **Deploy to production on**). On every push
to `main` it runs each file in `migrations/` that is not yet recorded in
`supabase_migrations.schema_migrations`, in file-name order, and records it. Check what has
been applied, and any failure, under Supabase → Database → Migrations. A failed migration is
fixed with a **new** migration, never by editing the old one.

- Never paste a migration into the SQL Editor: a hand-run file is not recorded, so the
  integration runs it again and fails on it, and every later migration waits behind it.
- History before the switch: 0001-0007 were recorded by the integration; 0008-0120 were run
  by hand and recorded once with `scripts/db/mark-migrations-applied.sql`.
- Claude never connects to the live database and never asks for its password, connection
  string or service-role key. SQL that cannot be a migration is handed to the owner to paste.
- A brand-new project is still built with `fresh-install.sql` (the 0064 ordering quirk
  above breaks applying the files one by one from empty); afterwards mark every migration
  version as applied, the same way the history script does.

## Data is not in these files

These scripts rebuild the **structure**. Rows (items, purchases, ledger, QC, …) live only
in Supabase. Keep a regular backup: Supabase → Project Settings → Database → Backups, or
export with `pg_dump` (the connection string is under Connect).
