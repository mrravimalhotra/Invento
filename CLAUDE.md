@AGENTS.md

# Invento — quick map (read this instead of exploring)

Next.js 16 App Router + Supabase (Postgres, RLS). Inventory / QC / manufacturing for a
pharma (GMP) SME. Not live: all data is test data. Deployed by pushing `main` (Vercel).

## Where things live
- Screens: `app/(dashboard)/<module>/` (page.tsx, forms, tables). Module docs: `docs/modules/<module>.md`.
- Server actions (all writes): `lib/actions/<module>.ts` — validate with zod, call `supabase.from()` or an RPC,
  map errors with `friendlyDbError` (`lib/db-errors.ts`; P0001/P0002/22023 messages reach the user as written).
- Shared: `lib/utils.ts` (IST dates, `formatQty`, `escapeLike`), `lib/supabase/fetch-all.ts` (`fetchAllRows`,
  `fetchByIdChunks` — PostgREST caps at 1,000 rows, always page and end with a unique `.order("id")`),
  `lib/constants/{roles,nav,units}.ts`, `lib/table-export.ts`, `lib/pdf.ts`, `lib/excel-export.ts`,
  `components/ui/*` (`saved-banner`, `decision-choice`, `combobox`, `data-table`, `form`).
- Success banners after redirects: `?saved=<key>` (`lib/saved-messages.ts` + `SavedBanner`).
- Heavy libraries (jspdf, docx, exceljs) are imported on click, not at page load — keep it that way.
- Database: `supabase/migrations/NNNN_name.sql` (next number = highest + 1). The latest definition of a function
  or policy wins. Workflow guards are triggers (`_is_direct_client_write()`); RPCs that bypass RLS are SECURITY DEFINER.
- Deprecated (do not touch unless asked): BMR (`bmr_*` tables, `/admin/bmr-deprecated`).

## Commands
- `npx tsc --noEmit`, `npx eslint <files>`, `NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npx next build`
- Database regression suites (needs local Postgres, ~7 s): `scripts/dev/run-tests.sh [suite...]` — one line per suite,
  compared with `supabase/tests/expected.txt`. New migration => add a suite `supabase/tests/part_*.sql` + expected line.
- After adding or changing a migration: `node scripts/build-fresh-install.mjs` and commit `supabase/fresh-install.sql`.

## Rules of the road
- Stage files by name (`git add <paths>`); never `git add -A` (it once committed test output files).
- A migration ships with: the SQL, a test suite, `fresh-install.sql`, and (if user-visible) a line in `docs/modules/`.
- Keep command output short (`| tail`, `| cut -c1-200`); don't re-read large files or the project docs in full.
