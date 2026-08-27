# Invento v2 — Design Specification

Status: **Proposed design**, built against the sign-off draft in
`Invento-Modular-Requirements.docx` (v2, refined). Not yet approved module by
module — this is the technical design + implementation to review screen by
screen alongside that document.

## 1. Goals and non-goals

Goals, in priority order, matching the two headline rules in spec.md:

1. **No material moves without quality clearance.** A raw-material batch that
   has not been QC-Approved must be structurally impossible to consume in
   production. In the baseline this was a missing application check; in v2 it
   is a database constraint, not just a UI guard.
2. **Automatic sampling deduction.** QC / Stability / R&D quantities taken at
   receipt must never appear in "available for production" stock. v2 computes
   and stores a real Remaining Quantity, matching the legacy "RM Report As On
   Date" (PQTY/SQTY/QTY) report.
3. Close the access-control gap: every screen enforces role membership via
   Postgres Row Level Security, not just QC (baseline's biggest single gap).
4. Cover all 15 modules from the modular requirements document, including the
   three promoted in the second pass (Batch Manufacturing Record, Packaging,
   Label Printing) and the items from the handwritten requirements list (line
   clearance, environmental control, COA master, barcode, low-stock
   notification, self-service password/profile).

Non-goals for this pass: Sales/Customer module, Employee/Payroll module,
Dead Stock Register, vendor credit/debit ledger — all remain open questions
in the requirements doc (Open Questions 9, 11) and are out of scope until
Ravi/Atharva decide. Placeholder nav entries are not added for these.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Same as baseline — "inspiration from the Node.js UI" carried forward. Server Components for reads, Server Actions for writes. |
| Database | Postgres via Supabase | Same as baseline. |
| Auth | **Supabase Auth** (email + password), not NextAuth | Baseline used NextAuth credentials + a hand-rolled `users` table with bcrypt, which is *why* nothing but QC could enforce roles — role checks were application code, easy to forget per-screen, and were in fact forgotten on 13 of 15 screens. Supabase Auth gives every request a verified `auth.uid()` inside Postgres itself, so role checks can live in Row Level Security policies once and apply everywhere automatically, including to direct database access. It also gives self-service password reset and profile edit for free (`supabase.auth.updateUser`), which was requirement item 1 on both the QC and Store sections of the handwritten list. |
| Styling | Tailwind CSS v4 | Same as baseline. |
| Charts | Recharts | Same as baseline (Dashboard). |
| PDF export | jsPDF + jspdf-autotable | Same approach as baseline's MFR report; extended to every module's "PDF format creation" requirement from the handwritten list. |
| Icons | lucide-react | New — baseline had no consistent icon set. |

## 3. Access control — how the #1 gap gets closed

Six role codes carried over unchanged from the baseline:
`inventory_manager`, `system_admin`, `super_auditor`, `quality_checker`,
`qc_reviewer`, `mfr_manager`.

```sql
create table public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role    text not null check (role in (
    'inventory_manager','system_admin','super_auditor',
    'quality_checker','qc_reviewer','mfr_manager'
  )),
  primary key (user_id, role)
);

create or replace function public.has_role(check_role text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function public.has_any_role(variadic check_roles text[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = any(check_roles)
  );
$$;
```

Every table below states its RLS policy in its own section. The pattern is
uniform: `select` is open to any signed-in user (cross-cutting rule carried
over from the baseline — nothing in the source docs asks for read
restriction), `insert`/`update` requires `has_any_role(...)` matching the
Roles/access line from the requirements doc, every table's `insert`/`update`
runs `with check` (not just `using`) so a role can't be escalated by editing
a row into a state RLS wouldn't have allowed on insert. `system_admin` is
granted `has_any_role` on every policy in addition to the module's own
role(s), since system_admin is meant to be the break-glass role.

The User Roles & Access screen — the screen that was itself unrestricted in
the baseline, the sharpest single finding in the whole review — is
`system_admin`-only in v2, enforced by RLS on `user_roles` itself: nobody
who is not already `system_admin` can write to that table, closing the
self-escalation hole structurally rather than by convention. The first
`system_admin` is seeded by a one-time script (`scripts/seed-admin.ts`), not
grantable through the UI.

## 4. Database schema (full)

Organized by module. Every table has `id uuid primary key default
gen_random_uuid()`, `created_at timestamptz default now()`,
`created_by uuid references auth.users(id)`, `updated_at timestamptz`,
`updated_by uuid references auth.users(id)`, `active boolean default true`
(soft delete) unless noted — omitted below for brevity, present in
`supabase/migrations/0001_init.sql`.

### 4.1 Item Type Master
`item_types(description text unique not null)`

### 4.2 Item Master
```
items(
  item_code text unique not null,          -- RM-0001, auto via get_next_item_code()
  name text not null,
  botanical_alias text,
  category text not null check (category in ('raw','processed','packaging')),
  item_type_id uuid references item_types(id),
  unit text check (unit in ('kg','g','mg','ltr','ml','count','bottle','pack')),
  default_qc_qty numeric,
  default_stability_qty numeric,
  default_rnd_qty numeric,
  low_stock_threshold numeric,             -- new: low-stock notification
  barcode text unique                      -- new: barcode implementation
)
```
Gap closed: `default_qc_qty` / `default_stability_qty` are now editable on
this screen and pre-fill the Purchase line, closing the baseline's Item
Master gap. `category` gains `packaging` as a first-class value so
Packaging's material master (§4.11) reuses this table instead of a parallel
one — one item list, one barcode field, one low-stock threshold, everywhere.

### 4.3 Vendor Master
`vendors(vendor_code text unique, name, address, mobile, phone, email)`

### 4.4 Purchase
```
purchase_orders(po_number text unique, vendor_id, invoice_number, invoice_date)
purchase_lines(
  purchase_order_id, item_id,
  batch_number text,                        -- RM-NN/YY, auto
  quantity numeric, unit text,
  qc_qty numeric default 0, stability_qty numeric default 0, rnd_qty numeric default 0,
  remaining_qty numeric generated always as
    (quantity - qc_qty - stability_qty - rnd_qty) stored,   -- gap closed, see §7.1
  unit_price numeric, gst_pct numeric,
  expiry_date date,
  qc_status text generated always as ('pending') stored     -- superseded by view, see §4.5
)
```
`remaining_qty` is a Postgres generated column — it cannot be out of sync
with the component quantities the way a client-computed number could be.

### 4.5 Quality Control (QC)
```
quality_checks(
  ar_number text unique,                    -- AR-NNN-DDMMYYYY, auto
  purchase_line_id uuid references purchase_lines(id),
  item_id uuid references items(id),
  sample_qty numeric, sample_unit text,
  expiry_date date,
  status text check (status in ('submitted','approved','rejected')) default 'submitted',
  reviewed_by uuid, reviewed_at timestamptz, review_comments text,
  retest_period_days integer,               -- manual per batch, see Open Question 1
  retest_date date generated always as
    (reviewed_at::date + (retest_period_days || ' days')::interval) stored
)
```
```sql
-- a batch's effective QC status, used everywhere else instead of re-deriving it
create view purchase_batch_status as
select pl.id as purchase_line_id,
       coalesce(qc.status, 'not_submitted') as qc_status,
       qc.ar_number, qc.retest_date
from purchase_lines pl
left join lateral (
  select * from quality_checks where purchase_line_id = pl.id
  order by created_at desc limit 1
) qc on true;
```

### 4.6 Inventory Ledger
```
inventory_ledger(
  event_type text check (event_type in ('push','pull','wastage')),  -- wastage type new, closes a baseline gap
  item_id, purchase_line_id,
  quantity numeric, unit text,
  department text check (department in ('production','rnd','store') or department is null), -- new destination field, closes a baseline gap
  reference_type text check (reference_type in ('purchase','qc','finished_product','packaging')),
  reference_id uuid,
  event_by uuid
)
-- as-of-date balance, replacing the manual summing the baseline required
create view stock_balance as
select item_id,
       sum(case event_type when 'push' then quantity else -quantity end) as on_hand
from inventory_ledger group by item_id;
```
`stock_balance` plus `items.low_stock_threshold` is what the low-stock
notification (§4.13) watches.

### 4.7 MFR (Master Formula Record)
```
mfr_definitions(code text unique, name, batch_size_qty numeric, batch_size_unit text, item_type_id, version integer default 1, approved_by uuid, approved_at timestamptz)
mfr_lines(mfr_definition_id, item_id, quantity numeric, unit text)
```
Gap closed: `version` increments on edit (old version rows kept, not
overwritten — see §7.3) and `approved_by`/`approved_at` give the printed
Prepared/Checked/Approved block something real to point at.

### 4.8 Finished Product
```
finished_product_batches(
  batch_number text unique,                 -- FP-0001, auto
  mfr_definition_id, mfr_version integer,    -- pinned to the version used
  target_qty numeric, unit text,
  wt_total_rm numeric, wastage numeric,
  net_weight numeric generated always as (wt_total_rm - wastage) stored,
  total_units numeric, net_qty numeric,
  actual_yield_pct numeric generated always as
    (case when wt_total_rm > 0 then round(net_weight_calc/wt_total_rm*100, 2) end) stored,
  expiry_month date, finish_date date,
  qc_sample_qty numeric,
  status text check (status in ('in_process','submitted_to_qc','approved','rejected')) default 'in_process'
)
finished_product_components(finished_product_batch_id, item_id, purchase_line_id, quantity numeric)
```
Gaps closed: full yield/wastage field set from the legacy Creation Finish
Good screen; `status` plus a QC record keyed to this table (reusing
`quality_checks` with a `finished_product_batch_id` nullable FK — see
migration) gives FP its own approval gate, matching the corrected finding
that the legacy system *does* gate FP on approval.

### 4.9 Batch Manufacturing Record (BMR)
```
bmr_records(finished_product_batch_id, prepared_by, checked_by, approved_by, prepared_at, checked_at, approved_at)
bmr_weighment_lines(bmr_record_id, item_id, purchase_line_id, standard_qty numeric, actual_qty numeric)
bmr_observations(bmr_record_id, step_label text, reading text, recorded_by uuid, recorded_at timestamptz)
```
`bmr_observations` is the structured home for readings like sieve/sifter
retention weight that SOP of Sifter requires be written onto the BMR —
`step_label` is free text so any equipment SOP can log into it without a
schema change per instrument.

### 4.10 Packaging
```
packaging_issues(
  finished_product_batch_id, pack_size text, unit_count numeric,
  department text check (department in ('production','rnd','store')),
  packaging_item_id uuid references items(id),   -- category = 'packaging'
  packaging_qty_used numeric,
  transaction_type text check (transaction_type in ('pack','repack','unpack')) default 'pack'
)
```
Each insert writes one `inventory_ledger` pull row against
`packaging_item_id` and one push row (department-tagged) against the FP
item, so Packaging is the module that finally populates the ledger's
`department` column.

### 4.11 Label Printing
No new table — labels are a **print view**, not new data, matching the
finding that every field on all four real templates already exists in
Purchase/QC/Finished Product. `app/(dashboard)/labels/` renders the four
templates from existing rows and calls jsPDF. The one new field,
`quality_checks.retest_period_days`, is entered manually per batch (Open
Question 1) and printed on the Approved label.

### 4.12 Certificate of Analysis (COA), Line Clearance, Environmental Control
Three small master-entry tables, all first requested in the handwritten
list:
```
coa_records(quality_check_id, finished_product_batch_id, coa_number text unique, issued_at, issued_by, file_url text)
line_clearance_checks(area text, batch_reference text, checked_by, checked_at, status text check (status in ('clear','not_clear')))
environmental_control_readings(area text, temperature numeric, humidity numeric, recorded_by, recorded_at)
```

### 4.13 User Roles & low-stock notification
`user_roles` — see §3. Low-stock notification has no table of its own: it is
a computed banner (`stock_balance.on_hand < items.low_stock_threshold`),
refreshed on Dashboard load and on the Item Master list, not a stored
notification log — there is no requirement source describing a
notification *history*, only a live warning.

### 4.14 Dashboard & Reports
Read-only; no new tables. Reports adds the exports the baseline's Reports
screen never got past "Coming soon": RM stock (from `stock_balance` +
`purchase_lines`), RM report as-on-date (PQTY/SQTY/QTY, matching the legacy
report by name), QC register, FP register — each as a filterable table with
a PDF/Excel export button (CSV, not xlsx binary, to avoid adding a heavy
dependency for a v1 export; noted as a simplification in §9).

## 5. Auto-numbering

All via Postgres sequence-backed functions, same pattern as the baseline,
extended for the new documents:

```
get_next_item_code(category)     RM-0001 / PKG-0001
get_next_vendor_code()            V-0001
get_next_po_number()              PO-0001         -- new: baseline had no PO number
get_next_batch_number(item_id)    RM-NN/YY
get_next_ar_number()               AR-NNN-DDMMYYYY
get_next_mfr_code()                F-0001
get_next_fp_batch_number()         FP-0001
get_next_coa_number()              COA-0001-YYYY   -- new
```

## 6. Route map (App Router)

```
app/
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (auth)/forgot-password/page.tsx        -- new, self-service
  (auth)/reset-password/page.tsx         -- new, self-service
  (dashboard)/layout.tsx                 -- sidebar + topbar, role-aware nav
  (dashboard)/page.tsx                   -- Dashboard
  (dashboard)/item-types/...
  (dashboard)/items/...
  (dashboard)/vendors/...
  (dashboard)/purchase/...
  (dashboard)/qc/...
  (dashboard)/inventory/...              -- ledger + stock balance + RM report as-on-date
  (dashboard)/mfr/...
  (dashboard)/finished-product/...
  (dashboard)/bmr/...
  (dashboard)/packaging/...
  (dashboard)/labels/...
  (dashboard)/coa/...
  (dashboard)/line-clearance/...
  (dashboard)/environmental-control/...
  (dashboard)/user-roles/...
  (dashboard)/profile/...                -- new, self-service
  (dashboard)/reports/...
  api/.../route.ts                        -- only for actions needing service-role logic (PDF assembly, admin-only writes); everything else is Server Actions calling Supabase directly under RLS
```

## 7. Key workflow specs (the parts that differ from the baseline)

### 7.1 Purchase line insert — sampling deduction
Server Action `createPurchaseLine`: inserts the row with `qc_qty` /
`stability_qty` / `rnd_qty` filled from `items.default_qc_qty` etc.
(overridable); `remaining_qty` is DB-generated, not client-computed. The
ledger push event uses `remaining_qty`, **not** `quantity** — the sample
portion never becomes available stock. Separately, a `pull`-into-QC ledger
event is written for `qc_qty` at the moment the QC record is created (not
at purchase time), matching the legacy flow where QC sampling is its own
step.

### 7.2 QC-gates-consumption — enforced in the database
```sql
create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from purchase_batch_status
    where purchase_line_id = new.purchase_line_id and qc_status = 'approved'
  ) then
    raise exception 'Batch % is not QC-Approved and cannot be consumed', new.purchase_line_id;
  end if;
  return new;
end $$;

create trigger trg_fp_component_qc_gate
before insert on finished_product_components
for each row execute function check_batch_qc_approved();
```
This is the direct fix for the review's single most important finding — it
is now impossible, not just discouraged, to consume an unapproved batch.
The same trigger pattern gates `bmr_weighment_lines`.

### 7.3 FIFO suggestion
`finished_product` composition step queries candidate batches:
```sql
select pl.*, pbs.qc_status, coalesce(sb.on_hand,0) as on_hand
from purchase_lines pl
join purchase_batch_status pbs using (purchase_line_id)
left join stock_balance sb on sb.item_id = pl.item_id
where pl.item_id = $1 and pbs.qc_status = 'approved' and coalesce(sb.on_hand,0) > 0
order by pl.expiry_date asc, pl.created_at asc;   -- FIFO by expiry, then receipt order
```
The UI pre-selects the first row instead of the baseline's unordered
dropdown; the user can still override, but the default is FIFO.

### 7.4 MFR versioning
Editing a definition's lines does not update `mfr_lines` in place — it
increments `mfr_definitions.version`, and a new set of `mfr_lines` is
inserted tagged with that version (column added in migration:
`mfr_lines.version`). `finished_product_batches.mfr_version` freezes which
version a given FP batch was actually built under, closing the baseline's
"no record of which MFR version was used" gap.

## 8. UI system (see also Figma-less "component spec" per screen in each
module's own review doc under `docs/modules/`)

- **Shell**: fixed left sidebar (role-aware — a nav item is hidden if the
  signed-in user's roles can't pass that module's own RLS insert check,
  though read access stays universal per the cross-cutting rule), topbar
  with global low-stock banner + profile menu (self-service password/edit).
- **Brand color**: emerald `#1F6F4E` (carried over from the requirements
  doc's brand color, for visual continuity across both deliverables).
- **Primitives** (`components/ui/`): Button, Input, Select, Textarea,
  Checkbox, Badge (status pill — submitted/approved/rejected/etc, color
  keyed to status), Card, DataTable (sort + filter + paginate, used by every
  list screen), Modal, PageHeader (title + breadcrumbs + primary action),
  SignatureBlock (Prepared/Checked/Approved, reused by MFR/BMR/labels),
  GapNote (amber callout — used in each module's `docs/modules/*.md`
  review doc, not in the app itself).
- Every list screen: `DataTable` + a "New" button gated by the module's
  role check (client-side hide, server-side RLS enforces for real).
- Every form screen: Server Action, optimistic-free (redirect + revalidate
  on success), Zod schema shared between client validation and the action.

## 9. Known simplifications in this pass (flag for review, not silent)

- Reports export as CSV, not native `.xlsx` — full Excel binary export is
  listed as an open item (Not Yet Built table, "Word / Excel export").
- Word/PDF export exists for MFR, BMR, Labels, and Reports; Purchase/QC
  "intimation" documents export PDF only in this pass, not Word — matches
  the Not Yet Built table's existing item, not newly deferred.
- Barcode is a stored value + on-screen code128 render (via a small inline
  SVG generator, no external service) — physical scanner integration is
  out of scope until Open Question 15 (barcode scope/timing) is answered.
- Instrument calibration status, Dead Stock Register, Sales/Customer,
  Employee/Payroll, vendor credit/debit ledger: **not built**, per the
  non-goals in §1 — still open questions, not silently dropped.
- SOP/STP remain document uploads (a `documents` table + Supabase Storage),
  not full structured entities — Open Question 3 is still open; this is the
  minimum viable version (linkable, versioned file, not a workflow engine).

## 10. Review process

Each module has its own one-page review doc under `docs/modules/<module>.md`
— screens, fields, role, and a "matches requirements doc §N" cross-reference
— generated from this spec, meant to be reviewed screen by screen exactly
like the Word document, with the working screen next to it.
