-- ============================================================
-- Invento v2 — initial schema
-- Matches docs/DESIGN.md. Organized by module, in dependency order.
-- ============================================================

-- --------------------------------------------------------------
-- Reset: drop everything in the public schema first, so this whole
-- combined script (0001 + 0002 + 0003) is always safe to re-run from
-- scratch — a fresh project, or a retry after a previous run errored
-- partway through and left some objects behind (e.g. 42P07 "relation
-- already exists" on a second attempt). Supabase keeps the anon/
-- authenticated/service_role default privileges for the public schema
-- at the database level, not on the schema object itself, so they
-- survive this drop and apply automatically to whatever gets created
-- below — no per-table grants needed.
--
-- WARNING: this deletes ALL DATA and objects currently in the public
-- schema. That's exactly what you want for initial setup or while
-- iterating pre-launch. Do NOT run this combined file again once the
-- app has real data you care about — at that point, hand-write a
-- normal additive migration instead.
-- --------------------------------------------------------------
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;
alter default privileges in schema public grant all on functions to postgres, service_role;
alter default privileges in schema public grant all on sequences to postgres, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 0. Roles (see DESIGN.md §3)
-- ------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null check (role in (
    'inventory_manager','system_admin','super_auditor',
    'quality_checker','qc_reviewer','mfr_manager'
  )),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(check_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

create or replace function public.has_any_role(variadic check_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = any(check_roles)
  );
$$;

create or replace function public.is_signed_in()
returns boolean language sql stable as $$
  select auth.uid() is not null;
$$;

alter table public.user_roles enable row level security;

create policy user_roles_select on public.user_roles
  for select using (public.is_signed_in());
create policy user_roles_write on public.user_roles
  for all using (public.has_role('system_admin'))
  with check (public.has_role('system_admin'));

-- profile: thin wrapper over auth.users for a display name, self-service editable
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select using (public.is_signed_in());
create policy profiles_self_write on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- helper: standard audit columns via trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

-- ------------------------------------------------------------
-- 1. Item Type Master
-- ------------------------------------------------------------
create table public.item_types (
  id uuid primary key default gen_random_uuid(),
  description text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_item_types_updated before update on public.item_types
  for each row execute function public.set_updated_at();
alter table public.item_types enable row level security;
create policy item_types_select on public.item_types for select using (public.is_signed_in());
create policy item_types_write on public.item_types for all
  using (public.has_any_role('system_admin','inventory_manager','mfr_manager'))
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

-- ------------------------------------------------------------
-- 2. Item Master (RM / Processed / Packaging)
-- ------------------------------------------------------------
create sequence public.item_code_seq_raw start 1;
create sequence public.item_code_seq_pkg start 1;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  name text not null,
  botanical_alias text,
  category text not null check (category in ('raw','processed','packaging')),
  item_type_id uuid references public.item_types(id),
  unit text check (unit in ('kg','g','mg','ltr','ml','count','bottle','pack')),
  default_qc_qty numeric,
  default_stability_qty numeric,
  default_rnd_qty numeric,
  low_stock_threshold numeric,
  barcode text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_items_updated before update on public.items
  for each row execute function public.set_updated_at();
alter table public.items enable row level security;
create policy items_select on public.items for select using (public.is_signed_in());
create policy items_write on public.items for all
  using (public.has_any_role('system_admin','inventory_manager','mfr_manager'))
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

create or replace function public.get_next_item_code(p_category text)
returns text language plpgsql as $$
declare v_num int; v_prefix text;
begin
  if p_category = 'packaging' then
    v_num := nextval('public.item_code_seq_pkg'); v_prefix := 'PKG';
  else
    v_num := nextval('public.item_code_seq_raw'); v_prefix := 'RM';
  end if;
  return v_prefix || '-' || lpad(v_num::text, 4, '0');
end $$;

-- ------------------------------------------------------------
-- 3. Vendor Master
-- ------------------------------------------------------------
create sequence public.vendor_code_seq start 1;
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  name text not null,
  address text,
  mobile text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_vendors_updated before update on public.vendors
  for each row execute function public.set_updated_at();
alter table public.vendors enable row level security;
create policy vendors_select on public.vendors for select using (public.is_signed_in());
create policy vendors_write on public.vendors for all
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));

create or replace function public.get_next_vendor_code()
returns text language sql as $$
  select 'V-' || lpad(nextval('public.vendor_code_seq')::text, 4, '0');
$$;

-- ------------------------------------------------------------
-- 4. Purchase
-- ------------------------------------------------------------
create sequence public.po_number_seq start 1;
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  vendor_id uuid not null references public.vendors(id),
  invoice_number text not null,
  invoice_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_po_updated before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create or replace function public.get_next_po_number()
returns text language sql as $$
  select 'PO-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
$$;

-- batch number: RM-NN/YY per item per calendar year
create or replace function public.get_next_batch_number(p_item_id uuid)
returns text language plpgsql as $$
declare v_year text := to_char(now(), 'YY'); v_n int;
begin
  select count(*) + 1 into v_n from public.purchase_lines
  where item_id = p_item_id and to_char(created_at, 'YY') = v_year;
  return 'RM-' || lpad(v_n::text, 2, '0') || '/' || v_year;
end $$;

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  batch_number text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  qc_qty numeric not null default 0,
  stability_qty numeric not null default 0,
  rnd_qty numeric not null default 0,
  remaining_qty numeric generated always as (quantity - qc_qty - stability_qty - rnd_qty) stored,
  unit_price numeric,
  gst_pct numeric,
  expiry_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  constraint remaining_not_negative check (quantity - qc_qty - stability_qty - rnd_qty >= 0)
);
create trigger trg_pl_updated before update on public.purchase_lines
  for each row execute function public.set_updated_at();

alter table public.purchase_orders enable row level security;
alter table public.purchase_lines enable row level security;
create policy po_select on public.purchase_orders for select using (public.is_signed_in());
create policy po_write on public.purchase_orders for all
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));
create policy pl_select on public.purchase_lines for select using (public.is_signed_in());
create policy pl_write on public.purchase_lines for all
  using (public.has_any_role('system_admin','inventory_manager'))
  with check (public.has_any_role('system_admin','inventory_manager'));

-- ------------------------------------------------------------
-- 5. Quality Control (QC) — covers both RM batches and FP batches
-- ------------------------------------------------------------
create sequence public.ar_number_seq start 1;
create or replace function public.get_next_ar_number()
returns text language sql as $$
  select 'AR-' || lpad(nextval('public.ar_number_seq')::text, 3, '0') || '-' || to_char(now(), 'DDMMYYYY');
$$;

create table public.quality_checks (
  id uuid primary key default gen_random_uuid(),
  ar_number text not null unique,
  purchase_line_id uuid references public.purchase_lines(id),
  finished_product_batch_id uuid, -- FK added after that table exists (below)
  item_id uuid references public.items(id),
  sample_qty numeric,
  sample_unit text,
  expiry_date date,
  status text not null check (status in ('submitted','approved','rejected')) default 'submitted',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_comments text,
  retest_period_days integer,
  -- Not a generated column: reviewed_at::date is timezone-dependent, which
  -- Postgres won't allow inside a GENERATED expression ("generation
  -- expression is not immutable"). Computed instead by
  -- trg_qc_compute_retest_date below, on the same insert/update that sets
  -- reviewed_at / retest_period_days.
  retest_date date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint qc_one_subject check (
    (purchase_line_id is not null and finished_product_batch_id is null) or
    (purchase_line_id is null and finished_product_batch_id is not null)
  )
);
alter table public.quality_checks enable row level security;
create policy qc_select on public.quality_checks for select using (public.is_signed_in());
create policy qc_insert on public.quality_checks for insert
  with check (public.has_any_role('system_admin','inventory_manager','quality_checker','qc_reviewer'));
create policy qc_update on public.quality_checks for update
  using (public.has_any_role('system_admin','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','quality_checker','qc_reviewer'));

create or replace function public.trg_fn_qc_compute_retest_date()
returns trigger language plpgsql as $$
begin
  if new.reviewed_at is not null and new.retest_period_days is not null then
    new.retest_date := ((new.reviewed_at::date) + (new.retest_period_days || ' days')::interval)::date;
  else
    new.retest_date := null;
  end if;
  return new;
end $$;
create trigger trg_qc_compute_retest_date
  before insert or update on public.quality_checks
  for each row execute function public.trg_fn_qc_compute_retest_date();

create view public.purchase_batch_status as
select pl.id as purchase_line_id,
       coalesce(qc.status, 'not_submitted') as qc_status,
       qc.ar_number, qc.retest_date, qc.id as quality_check_id
from public.purchase_lines pl
left join lateral (
  select * from public.quality_checks
  where purchase_line_id = pl.id
  order by created_at desc limit 1
) qc on true;

-- ------------------------------------------------------------
-- 6. Inventory Ledger
-- ------------------------------------------------------------
create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('push','pull','wastage')),
  item_id uuid not null references public.items(id),
  purchase_line_id uuid references public.purchase_lines(id),
  quantity numeric not null check (quantity >= 0),
  unit text,
  department text check (department in ('production','rnd','store')),
  reference_type text check (reference_type in ('purchase','qc','finished_product','packaging')),
  reference_id uuid,
  event_by uuid references auth.users(id),
  event_at timestamptz not null default now()
);
alter table public.inventory_ledger enable row level security;
create policy ledger_select on public.inventory_ledger for select using (public.is_signed_in());
-- Ledger rows are never inserted directly by a client. They are written exclusively
-- by SECURITY DEFINER triggers (0002_transactions.sql) that fire as a side effect of
-- a Purchase / QC / Finished Product / Packaging insert, inside that same transaction
-- — so this policy blocks the client and the triggers bypass RLS by design.
create policy ledger_no_direct_write on public.inventory_ledger for insert with check (false);

create view public.stock_balance as
select item_id,
       sum(case event_type when 'push' then quantity when 'wastage' then -quantity else -quantity end) as on_hand
from public.inventory_ledger
group by item_id;

-- ------------------------------------------------------------
-- 7. MFR (Master Formula Record) — versioned
-- ------------------------------------------------------------
create sequence public.mfr_code_seq start 1;
create or replace function public.get_next_mfr_code()
returns text language sql as $$
  select 'F-' || lpad(nextval('public.mfr_code_seq')::text, 4, '0');
$$;

create table public.mfr_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  batch_size_qty numeric not null,
  batch_size_unit text not null,
  item_type_id uuid references public.item_types(id),
  version integer not null default 1,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_mfr_def_updated before update on public.mfr_definitions
  for each row execute function public.set_updated_at();

create table public.mfr_lines (
  id uuid primary key default gen_random_uuid(),
  mfr_definition_id uuid not null references public.mfr_definitions(id) on delete cascade,
  version integer not null default 1,
  item_id uuid not null references public.items(id),
  quantity numeric not null,
  unit text not null
);

alter table public.mfr_definitions enable row level security;
alter table public.mfr_lines enable row level security;
create policy mfr_def_select on public.mfr_definitions for select using (public.is_signed_in());
create policy mfr_def_write on public.mfr_definitions for all
  using (public.has_any_role('system_admin','mfr_manager'))
  with check (public.has_any_role('system_admin','mfr_manager'));
create policy mfr_lines_select on public.mfr_lines for select using (public.is_signed_in());
create policy mfr_lines_write on public.mfr_lines for all
  using (public.has_any_role('system_admin','mfr_manager'))
  with check (public.has_any_role('system_admin','mfr_manager'));

-- ------------------------------------------------------------
-- 8. Finished Product
-- ------------------------------------------------------------
create sequence public.fp_batch_seq start 1;
create or replace function public.get_next_fp_batch_number()
returns text language sql as $$
  select 'FP-' || lpad(nextval('public.fp_batch_seq')::text, 4, '0');
$$;

create table public.finished_product_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  mfr_definition_id uuid not null references public.mfr_definitions(id),
  mfr_version integer not null,
  target_qty numeric not null,
  unit text not null,
  wt_total_rm numeric,
  wastage numeric default 0,
  net_weight numeric generated always as (coalesce(wt_total_rm,0) - coalesce(wastage,0)) stored,
  total_units numeric,
  net_qty numeric,
  actual_yield_pct numeric generated always as (
    case when coalesce(wt_total_rm,0) > 0
      then round((coalesce(wt_total_rm,0) - coalesce(wastage,0)) / wt_total_rm * 100, 2)
    end
  ) stored,
  expiry_month date,
  finish_date date,
  qc_sample_qty numeric,
  status text not null check (status in ('in_process','submitted_to_qc','approved','rejected')) default 'in_process',
  expiry_date date,
  packaged_qty numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz,
  updated_by uuid references auth.users(id)
);
create trigger trg_fp_updated before update on public.finished_product_batches
  for each row execute function public.set_updated_at();

alter table public.quality_checks
  add constraint qc_fp_fk foreign key (finished_product_batch_id)
  references public.finished_product_batches(id);

create table public.finished_product_components (
  id uuid primary key default gen_random_uuid(),
  finished_product_batch_id uuid not null references public.finished_product_batches(id) on delete cascade,
  item_id uuid not null references public.items(id),
  purchase_line_id uuid not null references public.purchase_lines(id),
  quantity numeric not null
);

create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.purchase_batch_status
    where purchase_line_id = new.purchase_line_id and qc_status = 'approved'
  ) then
    raise exception 'Batch (purchase_line_id=%) is not QC-Approved and cannot be consumed', new.purchase_line_id;
  end if;
  return new;
end $$;
create trigger trg_fp_component_qc_gate
  before insert on public.finished_product_components
  for each row execute function public.check_batch_qc_approved();

alter table public.finished_product_batches enable row level security;
alter table public.finished_product_components enable row level security;
create policy fp_select on public.finished_product_batches for select using (public.is_signed_in());
create policy fp_write on public.finished_product_batches for all
  using (public.has_any_role('system_admin','mfr_manager','inventory_manager'))
  with check (public.has_any_role('system_admin','mfr_manager','inventory_manager'));
create policy fp_comp_select on public.finished_product_components for select using (public.is_signed_in());
create policy fp_comp_write on public.finished_product_components for all
  using (public.has_any_role('system_admin','mfr_manager','inventory_manager'))
  with check (public.has_any_role('system_admin','mfr_manager','inventory_manager'));

-- ------------------------------------------------------------
-- 9. Batch Manufacturing Record (BMR)
-- ------------------------------------------------------------
create table public.bmr_records (
  id uuid primary key default gen_random_uuid(),
  finished_product_batch_id uuid not null references public.finished_product_batches(id) on delete cascade,
  prepared_by uuid references auth.users(id), prepared_at timestamptz,
  checked_by uuid references auth.users(id), checked_at timestamptz,
  approved_by uuid references auth.users(id), approved_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.bmr_weighment_lines (
  id uuid primary key default gen_random_uuid(),
  bmr_record_id uuid not null references public.bmr_records(id) on delete cascade,
  item_id uuid not null references public.items(id),
  purchase_line_id uuid not null references public.purchase_lines(id),
  standard_qty numeric not null,
  actual_qty numeric
);
create table public.bmr_observations (
  id uuid primary key default gen_random_uuid(),
  bmr_record_id uuid not null references public.bmr_records(id) on delete cascade,
  step_label text not null,
  reading text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);
create trigger trg_bmr_weighment_qc_gate
  before insert on public.bmr_weighment_lines
  for each row execute function public.check_batch_qc_approved();

alter table public.bmr_records enable row level security;
alter table public.bmr_weighment_lines enable row level security;
alter table public.bmr_observations enable row level security;
create policy bmr_select on public.bmr_records for select using (public.is_signed_in());
create policy bmr_write on public.bmr_records for all
  using (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'));
create policy bmr_wl_select on public.bmr_weighment_lines for select using (public.is_signed_in());
create policy bmr_wl_write on public.bmr_weighment_lines for all
  using (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'));
create policy bmr_obs_select on public.bmr_observations for select using (public.is_signed_in());
create policy bmr_obs_write on public.bmr_observations for all
  using (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','mfr_manager','quality_checker','qc_reviewer'));

-- ------------------------------------------------------------
-- 10. Packaging
-- ------------------------------------------------------------
create table public.packaging_issues (
  id uuid primary key default gen_random_uuid(),
  finished_product_batch_id uuid not null references public.finished_product_batches(id),
  pack_size text not null,
  unit_count numeric not null,
  department text not null check (department in ('production','rnd','store')),
  packaging_item_id uuid not null references public.items(id),
  packaging_qty_used numeric not null,
  transaction_type text not null check (transaction_type in ('pack','repack','unpack')) default 'pack',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.packaging_issues enable row level security;
create policy packaging_select on public.packaging_issues for select using (public.is_signed_in());
create policy packaging_insert on public.packaging_issues for insert
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

-- ------------------------------------------------------------
-- 11. COA / Line Clearance / Environmental Control
-- ------------------------------------------------------------
create sequence public.coa_number_seq start 1;
create or replace function public.get_next_coa_number()
returns text language sql as $$
  select 'COA-' || lpad(nextval('public.coa_number_seq')::text, 4, '0') || '-' || to_char(now(), 'YYYY');
$$;

create table public.coa_records (
  id uuid primary key default gen_random_uuid(),
  coa_number text not null unique,
  quality_check_id uuid references public.quality_checks(id),
  finished_product_batch_id uuid references public.finished_product_batches(id),
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  file_url text
);
create table public.line_clearance_checks (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  batch_reference text,
  status text not null check (status in ('clear','not_clear')),
  checked_by uuid references auth.users(id),
  checked_at timestamptz not null default now()
);
create table public.environmental_control_readings (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  temperature numeric,
  humidity numeric,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);
alter table public.coa_records enable row level security;
alter table public.line_clearance_checks enable row level security;
alter table public.environmental_control_readings enable row level security;
create policy coa_select on public.coa_records for select using (public.is_signed_in());
create policy coa_insert on public.coa_records for insert
  with check (public.has_any_role('system_admin','quality_checker','qc_reviewer'));
create policy lc_select on public.line_clearance_checks for select using (public.is_signed_in());
create policy lc_insert on public.line_clearance_checks for insert
  with check (public.has_any_role('system_admin','quality_checker','qc_reviewer','mfr_manager'));
create policy ec_select on public.environmental_control_readings for select using (public.is_signed_in());
create policy ec_insert on public.environmental_control_readings for insert
  with check (public.has_any_role('system_admin','quality_checker','qc_reviewer','mfr_manager'));

-- ------------------------------------------------------------
-- 12. Documents (SOP/STP uploads, minimum viable structured link — Open Question 3)
-- ------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('sop','stp')),
  title text not null,
  revision_number integer not null default 0,
  file_url text not null,
  effective_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.documents enable row level security;
create policy documents_select on public.documents for select using (public.is_signed_in());
create policy documents_write on public.documents for all
  using (public.has_any_role('system_admin','quality_checker','qc_reviewer'))
  with check (public.has_any_role('system_admin','quality_checker','qc_reviewer'));

-- ============================================================
-- end of 0001_init.sql
-- ============================================================
