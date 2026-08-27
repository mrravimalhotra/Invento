# Invento v2

Ayurvedic inventory & manufacturing ERP for Atharva Nature Healthcare —
proposed rebuild of `invento-nextgen`, designed against
`Invento-Modular-Requirements.docx` (v2) and reviewed screen by screen.

**Start here:** [`docs/DESIGN.md`](docs/DESIGN.md) — full architecture,
database schema, and per-module design. Then [`docs/modules/`](docs/modules)
— one short doc per screen, meant to be reviewed the same way the Word
document was, module by module.

## Stack

Next.js 16 (App Router, TypeScript) · Supabase (Postgres + Auth, Row Level
Security) · Tailwind CSS v4 · Recharts · jsPDF.

## Local setup

Full walkthrough: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
(project creation, applying the three migrations, Auth configuration,
bootstrapping the first admin, deploying). Short version:

1. Create a Supabase project, apply `supabase/migrations/*.sql` in order
   (0001 → 0002 → 0003) via the SQL Editor or `supabase db push`.
2. Copy `.env.example` to `.env.local` and fill in your project's URL and
   anon key (Project Settings → API).
3. `npm install`
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)
5. Register an account at `/register`, then grant it `system_admin` (the
   User Roles screen is itself admin-only, so the first admin has to be
   bootstrapped outside the app — see the comment at the top of
   `scripts/seed-admin.ts`):
   ```bash
   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
     npx tsx scripts/seed-admin.ts you@example.com
   ```
6. Sign in and assign roles to other accounts from **User Roles & Access**.

## What's here

All 15 modules from the requirements document, plus auth/roles/profile:

| Module | Route |
|---|---|
| Login & Registration | `/login`, `/register`, `/forgot-password`, `/reset-password` |
| Item Type Master | `/item-types` |
| Item Master | `/items` |
| Vendor Master | `/vendors` |
| Purchase | `/purchase` |
| Quality Control | `/qc` |
| Inventory Ledger | `/inventory`, `/inventory/balance`, `/inventory/rm-report` |
| MFR | `/mfr` |
| Finished Product | `/finished-product` |
| Batch Manufacturing Record | `/bmr` |
| Packaging | `/packaging` |
| Label Printing | `/labels` |
| Certificate of Analysis | `/coa` |
| Line Clearance | `/line-clearance` |
| Environmental Control | `/environmental-control` |
| SOP / STP Documents | `/documents` |
| User Roles & Access | `/user-roles` |
| Dashboard | `/` |
| Reports | `/reports` |

## Status

Proposed design + a full working implementation of every module, built for
review — not yet signed off by Ravi/Atharva module by module. Known
simplifications and open items are listed in `docs/DESIGN.md` §9, and each
`docs/modules/*.md` doc calls out anything that agent deviated from the
spec while building, with why. Nothing here has been run against a live
Supabase project yet — do the local setup above and page through it before
treating any module as final.
