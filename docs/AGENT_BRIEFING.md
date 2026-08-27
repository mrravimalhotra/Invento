# Agent briefing — shared conventions for every module

Read this in full before writing any code. It is the contract every module
must follow so the app integrates without a rework pass. Also read
`docs/DESIGN.md` in full — it is the design spec this whole build follows —
and `supabase/migrations/0001_init.sql` + `0002_transactions.sql` for the
exact schema you're building against (do not invent columns; if something
you need isn't in the schema, add a migration `000N_<name>.sql` for it,
following the existing file's style, rather than working around it in app
code).

## Stack already in place — use it, don't reinvent it

- Next.js 16 App Router, TypeScript. **`params` and `searchParams` are
  Promises** — `const { id } = await params`. This project uses the `proxy`
  convention (not `middleware` — Next 16 renamed it); you will not touch
  `proxy.ts`.
- `lib/supabase/server.ts` → `createClient()` (async, `await createClient()`)
  for Server Components and Server Actions. It runs as the signed-in user —
  every query is subject to the RLS policies already written in the
  migrations. Never use a service-role client in application code (only
  `scripts/seed-admin.ts` does that, for one bootstrap reason explained
  there).
- `lib/auth/session.ts` → `getCurrentUser()` returns `{ id, email, fullName,
  roles }` or `null`. Use it in every page that needs the signed-in user or
  a role-gated "New" button.
- `lib/constants/roles.ts` → `MODULE_WRITE_ROLES` and `canWrite(user.roles,
  "module_key")`. This is a **UI convenience only** (hide the button) — the
  database enforces the real rule via RLS, so don't skip either half.
- `lib/constants/units.ts`, `lib/constants/nav.ts` (nav entries for every
  module already exist — do not add new nav items or change hrefs, your
  pages must live at the paths already wired in `NAV_GROUPS`).
- `lib/utils.ts` → `cn()`, `formatDate()`, `formatNumber()`.
- `lib/pdf.ts` → `letterhead(doc, title)` and `downloadPdfTable(...)` for
  jsPDF exports. Use `letterhead()` as the header on any custom print layout
  (MFR/BMR/labels) so every printed document shares the same masthead.
- UI kit in `components/ui/`: `Button`/`LinkButton` (`button.tsx`),
  `Field`/`Input`/`Select`/`Textarea`/`Checkbox`/`ErrorText` (`form.tsx`),
  `Card`/`CardHeader`/`CardBody`/`StatCard` (`card.tsx`), `Badge` (status
  pill, `badge.tsx` — pass the raw status string, it maps colors),
  `DataTable` (`data-table.tsx` — client component, pass `columns` +
  `rows`), `PageHeader` (`page-header.tsx`), `SignatureBlock`
  (`signature-block.tsx`, for print layouts). **Use these, don't build
  parallel ad-hoc components** — visual consistency across all 15 modules
  depends on every module using the same primitives.

## File layout per module

```
app/(dashboard)/<route>/page.tsx          -- list screen: Server Component, DataTable
app/(dashboard)/<route>/new/page.tsx      -- create form (or a Modal-in-page if trivial)
app/(dashboard)/<route>/[id]/page.tsx     -- detail/edit screen
app/(dashboard)/<route>/<form>.tsx        -- 'use client' form component(s), useActionState
lib/actions/<module>.ts                   -- 'use server' Server Actions: create/update/etc.
```

Follow the pattern already in `lib/actions/auth.ts` and
`app/(dashboard)/profile/`: a client form component using
`useActionState(action, undefined)`, an `ActionState = {error?, success?}`
return type, `revalidatePath` on success, `redirect` when navigating away.
Wrap any `useSearchParams()` usage in `<Suspense>` (Next 16 requirement).

Every Server Action must re-check auth itself
(`const user = await getCurrentUser(); if (!canWrite(user?.roles ?? [],
"module_key")) return { error: "Not authorized." };`) even though RLS is the
real backstop — fail with a clear message, don't rely on the RLS error
string reaching the user.

## Data conventions

- Every list screen queries `.eq("active", true)` unless the screen's whole
  point is to show inactive/historical rows too.
- Auto-generated codes come from the Postgres RPC functions in the
  migration (`get_next_item_code`, `get_next_po_number`,
  `get_next_batch_number`, `get_next_ar_number`, `get_next_mfr_code`,
  `get_next_fp_batch_number`, `get_next_coa_number`) — call them via
  `supabase.rpc("get_next_x", {...})` inside your Server Action, never
  generate a code in JavaScript.
- Numbers from Postgres numeric columns arrive as strings over PostgREST —
  use `formatNumber()` for display and `Number(...)` before arithmetic.
- Don't write directly to `inventory_ledger` — it has an insert policy that
  blocks all direct client/action writes on purpose; triggers in
  `0002_transactions.sql` write it automatically as a side effect of the
  real insert (purchase line, QC record, FP component, packaging issue).
  If your module needs a ledger effect not already covered by a trigger, or
  any other schema change, **do not create a new migration file yourself**
  — other agents are working in this same tree in parallel and a second
  `0003_*.sql` would collide. Instead say exactly what you need in your
  final report (table/column/trigger and why) and build the rest of your
  module against the schema as it stands; the migration gets added once,
  after all agents report back.

## When you're done

1. Other agents are building other modules in this same working tree at the
   same time as you, in parallel. **Do not run `npm run build` or `next
   dev`** — concurrent builds from multiple agents corrupt the shared
   `.next` cache. Instead run `npx tsc --noEmit -p .` to type-check; expect
   and ignore errors that come from files outside the ones you touched
   (another module mid-write). A full build happens once, after every agent
   is done.
2. Touch only files under your own route folder(s), your own
   `lib/actions/<module>.ts` file(s), and your own `docs/modules/*.md`.
   Never edit `lib/constants/nav.ts`, `docs/DESIGN.md`,
   `supabase/migrations/0001_init.sql`/`0002_transactions.sql`, anything in
   `components/ui/` or `components/shell/`, or another module's files — if
   you think one of those needs a change, say so in your final report
   instead of making it, so it can be applied once without collisions.
2. Write a short `docs/modules/<slug>.md` for each module you built: screens
   in this module, fields, workflow, role, and a one-line cross-reference to
   the matching section number in `docs/DESIGN.md` §4. This is the doc Ravi
   reviews screen-by-screen, mirroring how `Invento-Modular-Requirements.docx`
   was reviewed.
3. Report back a short summary of files created/changed and anything you
   deviated from in this briefing or DESIGN.md, with why.
