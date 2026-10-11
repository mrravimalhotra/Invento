-- 0115: Rules that only the screen enforced now hold in the database too (category 7 of the scan)
--
-- SCAN-P2-01  An item's category cannot change once the item has records, and never to or
--             from Finished Product (the unit already had this lock, 0076).
-- SCAN-P2-02  An item cannot be made inactive while it still has stock on hand; a raw
--             material must have an item type.
-- SCAN-P2-03  Names are compared after squeezing repeated spaces, ignoring case and a
--             trailing full stop (norm_name); item type descriptions follow the same rule.
-- SCAN-P10-04 Item, vendor and item type names are unique under that rule in the database,
--             so two saves at the same moment, or an upload plus a form, cannot create a pair.
-- SCAN-P2-12  Only the System Administrator changes a display name (set_display_name); at
--             most 100 characters; no two people share a name.
-- SCAN-P2-09  The MFR batch size unit must be one of the app's units; GST % is at most 100.
--
-- Existing rows are not rewritten. If two names already clash under the new rule the
-- migration stops BEFORE changing anything and lists them, so they can be renamed first.

begin;

-- ------------------------------------------------------------
-- 0. Name cleaning, and a stop if existing names already clash
-- ------------------------------------------------------------
create or replace function public.norm_name(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(regexp_replace(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '[.\s]+$', ''))
$$;
revoke all on function public.norm_name(text) from public, anon;
grant execute on function public.norm_name(text) to authenticated, service_role;

do $$
declare
  r record;
  v_msg text := '';
begin
  -- Raw material and packaging items (auto-created production stock items RM-FP-... excluded)
  for r in
    select string_agg(name || ' (' || item_code || ')', '  /  ' order by item_code) as names
      from public.items
     where category in ('raw', 'packaging') and item_code not like 'RM-FP-%'
     group by public.norm_name(name) having count(*) > 1 limit 15
  loop v_msg := v_msg || E'\n  item: ' || r.names; end loop;
  for r in
    select string_agg(name || ' (' || vendor_code || ')', '  /  ' order by vendor_code) as names
      from public.vendors group by public.norm_name(name) having count(*) > 1 limit 15
  loop v_msg := v_msg || E'\n  vendor: ' || r.names; end loop;
  for r in
    select string_agg(description, '  /  ' order by description) as names
      from public.item_types group by public.norm_name(description) having count(*) > 1 limit 15
  loop v_msg := v_msg || E'\n  item type: ' || r.names; end loop;
  for r in
    select string_agg(full_name, '  /  ' order by full_name) as names
      from public.profiles where btrim(coalesce(full_name, '')) <> ''
     group by public.norm_name(full_name) having count(*) > 1 limit 15
  loop v_msg := v_msg || E'\n  user name: ' || r.names; end loop;
  if v_msg <> '' then
    raise exception E'0115 not applied: these names are used more than once (ignoring capitals, repeated spaces and a trailing full stop). Rename or merge one of each pair, then run this again.%', v_msg;
  end if;
end $$;

create unique index items_name_norm_uq on public.items (public.norm_name(name))
  where category in ('raw', 'packaging') and item_code not like 'RM-FP-%';
create unique index vendors_name_norm_uq on public.vendors (public.norm_name(name));
create unique index item_types_description_norm_uq on public.item_types (public.norm_name(description));
create unique index profiles_full_name_norm_uq on public.profiles (public.norm_name(full_name))
  where btrim(coalesce(full_name, '')) <> '';

-- Lookups for the screens (a friendly message before the database has to refuse).
create or replace function public.item_name_taken(p_name text, p_exclude_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access() and exists (
    select 1 from public.items
     where public.norm_name(name) = public.norm_name(p_name)
       and (p_exclude_id is null or id <> p_exclude_id))
$$;

create or replace function public.vendor_name_taken(p_name text, p_exclude_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select vendor_code from public.vendors
   where public.has_app_access()
     and public.norm_name(name) = public.norm_name(p_name)
     and (p_exclude_id is null or id <> p_exclude_id)
   limit 1
$$;

create or replace function public.display_name_taken(p_name text, p_exclude_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access() and exists (
    select 1 from public.profiles
     where public.norm_name(full_name) = public.norm_name(p_name)
       and (p_exclude_id is null or id <> p_exclude_id))
$$;

-- ------------------------------------------------------------
-- 1. Item category is fixed once the item has records (SCAN-P2-01)
-- ------------------------------------------------------------
create or replace function public._item_has_records(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.inventory_ledger where item_id = p_item_id)
      or exists (select 1 from public.purchase_lines where item_id = p_item_id)
      or exists (select 1 from public.mfr_lines where item_id = p_item_id)
      or exists (select 1 from public.packaging_issue_items where item_id = p_item_id)
      or exists (select 1 from public.production_issue_batches where item_id = p_item_id)
      or exists (select 1 from public.mfr_definitions where finished_product_item_id = p_item_id)
      or exists (select 1 from public.quality_checks where item_id = p_item_id)
      or exists (select 1 from public.items where packaged_item_id = p_item_id or production_rm_item_id = p_item_id)
      or exists (select 1 from public.items where id = p_item_id and (packaged_item_id is not null or production_rm_item_id is not null))
$$;
revoke all on function public._item_has_records(uuid) from public, anon, authenticated;
grant execute on function public._item_has_records(uuid) to service_role;

-- For the Item Master screen: show the category as fixed once this is true.
create or replace function public.item_has_records(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access() and public._item_has_records(p_item_id)
$$;
revoke all on function public.item_has_records(uuid) from public, anon;
grant execute on function public.item_has_records(uuid) to authenticated, service_role;

create or replace function public.trg_fn_item_category_locked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category is not distinct from old.category then
    return new;
  end if;
  if old.category in ('processed', 'packaged_fp') or new.category in ('processed', 'packaged_fp') then
    raise exception 'The category of % can''t be changed to or from Finished Product: those items belong to their MFR.', old.item_code
      using errcode = 'P0001';
  end if;
  if public._item_has_records(old.id) then
    raise exception 'The category of % can''t be changed: it already has purchases, recipes, QC records or stock movements. Create a new item in the right category instead.', old.item_code
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_category_locked_item on public.items;
create trigger trg_00_category_locked_item
  before update of category on public.items
  for each row execute function public.trg_fn_item_category_locked();

-- ------------------------------------------------------------
-- 2. An item with stock cannot be made inactive; a raw material needs an item type (SCAN-P2-02)
-- ------------------------------------------------------------
create or replace function public.trg_fn_item_deactivate_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on_hand numeric;
begin
  if old.active and not new.active then
    select coalesce(on_hand, 0) into v_on_hand from public.stock_balance where item_id = old.id;
    if coalesce(v_on_hand, 0) > 0.0005 then
      raise exception '% still has % % on hand, so it can''t be made inactive. Write the stock off or use it up first.',
        old.item_code, trim_scale(round(v_on_hand, 3)), coalesce(old.unit, '')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_00_deactivate_guard_item on public.items;
create trigger trg_00_deactivate_guard_item
  before update of active on public.items
  for each row execute function public.trg_fn_item_deactivate_guard();

-- NOT VALID: rows saved before this migration are not rejected, but every new row and every
-- change to a row must satisfy it.
alter table public.items drop constraint if exists items_raw_needs_item_type;
alter table public.items
  add constraint items_raw_needs_item_type
  check (category <> 'raw' or item_type_id is not null or item_code like 'RM-FP-%') not valid;

-- ------------------------------------------------------------
-- 3. Display names (SCAN-P2-12)
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_full_name_len;
alter table public.profiles
  add constraint profiles_full_name_len check (full_name is null or char_length(full_name) <= 100) not valid;

create or replace function public.trg_fn_profile_name_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.full_name is distinct from old.full_name
     and auth.uid() is not null
     and not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can change a display name.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_profile_name_admin_only on public.profiles;
create trigger trg_00_profile_name_admin_only
  before update of full_name on public.profiles
  for each row execute function public.trg_fn_profile_name_admin_only();

create or replace function public.set_display_name(p_user_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can change a display name.' using errcode = 'P0001';
  end if;
  if v_name = '' then
    raise exception 'Enter a name.' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 100 then
    raise exception 'A name can be at most 100 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id <> p_user_id and public.norm_name(full_name) = public.norm_name(v_name)) then
    raise exception 'Another user already has the name "%".', v_name using errcode = 'P0001';
  end if;
  update public.profiles set full_name = v_name where id = p_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.set_display_name(uuid, text) from public, anon;
grant execute on function public.set_display_name(uuid, text) to authenticated, service_role;

revoke all on function public.item_name_taken(text, uuid), public.vendor_name_taken(text, uuid), public.display_name_taken(text, uuid) from public, anon;
grant execute on function public.item_name_taken(text, uuid), public.vendor_name_taken(text, uuid), public.display_name_taken(text, uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. MFR batch size unit and GST % (SCAN-P2-09)
-- ------------------------------------------------------------
create or replace function public.trg_fn_mfr_batch_unit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.batch_size_unit is null or new.batch_size_unit not in ('kg', 'g', 'mg', 'ltr', 'ml', 'nos', 'bottle', 'pack') then
    raise exception 'Batch size unit must be one of: kg, g, mg, ltr, ml, nos, bottle, pack.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_mfr_batch_unit on public.mfr_definitions;
create trigger trg_00_mfr_batch_unit
  before insert or update of batch_size_unit on public.mfr_definitions
  for each row execute function public.trg_fn_mfr_batch_unit();

alter table public.purchase_lines drop constraint if exists purchase_lines_gst_pct_max;
alter table public.purchase_lines
  add constraint purchase_lines_gst_pct_max check (gst_pct is null or gst_pct <= 100) not valid;

commit;
