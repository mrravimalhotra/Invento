-- ============================================================
-- Certificate of Analysis templates move from "one per Item Type" to
-- "one per item".
--
-- Ravi (3 Oct 2026): "COA Templates should be defined at each Item Level.
-- For each Raw Material there would be one template, for each Finished
-- Product there would be one template. This should be defined at the time
-- of defining the product ... when MFR is created, there should be option
-- to define its COA similar to how Manufacturing Procedure is defined.
-- However COA is not part of MFR so should be tracked and reported
-- separately." Decisions (AskUserQuestion, same day): the existing Item
-- Type templates are discarded (all test data); a template is optional
-- when the item or MFR is created (a COA cannot be issued until one
-- exists); whoever can edit the item can edit its template; a register,
-- change history and Excel/PDF export are added.
--
-- Design:
--   - coa_templates is keyed by EITHER a raw-material item (item_id) OR an
--     MFR (mfr_definition_id), never both, never neither. A Finished
--     Product's template hangs off its MFR (the FP item only exists after
--     the MFR is approved, but the template can be defined from the moment
--     the MFR is created, and stays editable after approval: COA is not
--     part of the MFR recipe, so the recipe lock does not apply).
--   - Every save writes a snapshot row to coa_template_revisions, so the
--     register can show who changed what and when without reading the
--     delete-and-reinsert noise in the audit log.
--   - Issued certificates are unaffected: they carry their own snapshot
--     (header_data / result_lines). coa_records.coa_template_id becomes
--     "on delete set null" so removing a template or item never blocks.
-- ============================================================

-- 1. Discard the old per-Item-Type templates.
alter table public.coa_records drop constraint if exists coa_records_coa_template_id_fkey;
alter table public.coa_records
  add constraint coa_records_coa_template_id_fkey
  foreign key (coa_template_id) references public.coa_templates(id) on delete set null;

delete from public.coa_templates;   -- lines cascade; issued COAs keep their snapshot

-- 2. Re-key.
alter table public.coa_templates drop constraint if exists coa_templates_item_type_id_key;
alter table public.coa_templates drop column if exists item_type_id;
alter table public.coa_templates
  add column item_id uuid references public.items(id) on delete cascade,
  add column mfr_definition_id uuid references public.mfr_definitions(id) on delete cascade;
alter table public.coa_templates
  add constraint coa_templates_one_subject
  check ((item_id is not null) <> (mfr_definition_id is not null));
create unique index coa_templates_item_uidx on public.coa_templates (item_id) where item_id is not null;
create unique index coa_templates_mfr_uidx on public.coa_templates (mfr_definition_id) where mfr_definition_id is not null;

-- 3. Revision history (one row per save, written by the RPCs only).
create table public.coa_template_revisions (
  id uuid primary key default gen_random_uuid(),
  coa_template_id uuid not null references public.coa_templates(id) on delete cascade,
  revision_no integer not null,
  lines jsonb not null,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  unique (coa_template_id, revision_no)
);
alter table public.coa_template_revisions enable row level security;
create policy coa_template_revisions_select on public.coa_template_revisions
  for select using ((select public.has_app_access()));
-- no insert/update/delete policy: only the security definer functions below write here.

-- 4. Who may manage a template: whoever may edit the thing it belongs to.
create or replace function public.can_manage_coa_template(p_item_id uuid, p_mfr_definition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_item_id is not null then public.has_any_role('system_admin', 'inventory_manager', 'mfr_manager')
    when p_mfr_definition_id is not null then public.has_any_role('system_admin', 'mfr_manager')
    else false
  end;
$$;

-- Direct writes to the template header row: System Admin only. Everyone else
-- goes through the functions below (lines have never had a direct write policy).
drop policy if exists coa_templates_insert on public.coa_templates;
drop policy if exists coa_templates_update on public.coa_templates;
drop policy if exists coa_templates_delete on public.coa_templates;
create policy coa_templates_insert on public.coa_templates for insert
  with check (public.has_any_role('system_admin'));
create policy coa_templates_update on public.coa_templates for update
  using (public.has_any_role('system_admin')) with check (public.has_any_role('system_admin'));
create policy coa_templates_delete on public.coa_templates for delete
  using (public.has_any_role('system_admin'));

-- 5. Save one template (create or replace its lines) and record a revision.
drop function if exists public.upsert_coa_template(uuid, jsonb);

create or replace function public.upsert_coa_template(
  p_item_id uuid,
  p_mfr_definition_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_line jsonb;
  v_idx int := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_category text;
begin
  if (p_item_id is null) = (p_mfr_definition_id is null) then
    raise exception 'A COA template belongs to either a raw material or an MFR.';
  end if;
  if not public.can_manage_coa_template(p_item_id, p_mfr_definition_id) then
    raise exception 'Not authorized to manage this COA template.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one test is required.';
  end if;

  if p_item_id is not null then
    select category into v_category from public.items where id = p_item_id;
    if v_category is null then
      raise exception 'Item not found.';
    end if;
    if v_category <> 'raw' then
      raise exception 'COA templates are defined for raw materials and MFRs only.';
    end if;
    select id into v_template_id from public.coa_templates where item_id = p_item_id for update;
  else
    if not exists (select 1 from public.mfr_definitions where id = p_mfr_definition_id) then
      raise exception 'MFR not found.';
    end if;
    select id into v_template_id from public.coa_templates where mfr_definition_id = p_mfr_definition_id for update;
  end if;

  if v_template_id is null then
    insert into public.coa_templates (item_id, mfr_definition_id, created_by)
    values (p_item_id, p_mfr_definition_id, auth.uid())
    returning id into v_template_id;
  else
    update public.coa_templates set updated_at = now(), updated_by = auth.uid() where id = v_template_id;
    delete from public.coa_template_lines where coa_template_id = v_template_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_idx := v_idx + 1;
    if coalesce(trim(v_line->>'test'), '') = '' or coalesce(trim(v_line->>'specification'), '') = '' then
      raise exception 'Row %: both Test and Specification are required.', v_idx;
    end if;
    insert into public.coa_template_lines (coa_template_id, seq, test, specification)
    values (v_template_id, v_idx, trim(v_line->>'test'), trim(v_line->>'specification'));
    v_snapshot := v_snapshot || jsonb_build_array(
      jsonb_build_object('seq', v_idx, 'test', trim(v_line->>'test'), 'specification', trim(v_line->>'specification')));
  end loop;

  insert into public.coa_template_revisions (coa_template_id, revision_no, lines, changed_by)
  values (
    v_template_id,
    coalesce((select max(revision_no) from public.coa_template_revisions where coa_template_id = v_template_id), 0) + 1,
    v_snapshot,
    auth.uid()
  );

  return v_template_id;
end $$;

-- 6. Bulk upload: payload is [{item_id | mfr_definition_id, lines:[{test, specification}]}].
create or replace function public.bulk_create_coa_templates(p_payload jsonb)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group jsonb;
  v_item_id uuid;
  v_mfr_id uuid;
  v_template_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No COA template rows to import.';
  end if;

  for v_group in select * from jsonb_array_elements(p_payload)
  loop
    v_item_id := nullif(v_group->>'item_id', '')::uuid;
    v_mfr_id := nullif(v_group->>'mfr_definition_id', '')::uuid;
    if (v_item_id is null) = (v_mfr_id is null) then
      raise exception 'Every row needs either a raw material code or an MFR code.';
    end if;
    if exists (select 1 from public.coa_templates
               where (v_item_id is not null and item_id = v_item_id)
                  or (v_mfr_id is not null and mfr_definition_id = v_mfr_id)) then
      raise exception 'An item or MFR in this file already has a COA template — edit it on its own screen instead of uploading it again.';
    end if;
    v_template_id := public.upsert_coa_template(v_item_id, v_mfr_id, v_group->'lines');
    return next v_template_id;
  end loop;
  return;
end $$;

-- 7. Register: every raw material and every MFR, with or without a template.
create or replace view public.coa_template_register
with (security_invoker = on) as
select
  'raw_material'::text as subject_type,
  i.id as subject_id,
  i.item_code as code,
  i.name as name,
  it.description as item_type,
  i.active as active,
  t.id as template_id,
  coalesce((select count(*) from public.coa_template_lines l where l.coa_template_id = t.id), 0)::int as tests,
  coalesce((select max(revision_no) from public.coa_template_revisions r where r.coa_template_id = t.id), 0)::int as revisions,
  coalesce(t.updated_at, t.created_at) as last_changed_at,
  coalesce(t.updated_by, t.created_by) as last_changed_by
from public.items i
left join public.item_types it on it.id = i.item_type_id
left join public.coa_templates t on t.item_id = i.id
where i.category = 'raw'
union all
select
  'finished_product',
  m.id,
  m.code,
  m.name,
  it.description,
  m.active,
  t.id,
  coalesce((select count(*) from public.coa_template_lines l where l.coa_template_id = t.id), 0)::int,
  coalesce((select max(revision_no) from public.coa_template_revisions r where r.coa_template_id = t.id), 0)::int,
  coalesce(t.updated_at, t.created_at),
  coalesce(t.updated_by, t.created_by)
from public.mfr_definitions m
left join public.items fp on fp.id = m.finished_product_item_id
left join public.item_types it on it.id = coalesce(fp.item_type_id, m.item_type_id)
left join public.coa_templates t on t.mfr_definition_id = m.id;

grant select on public.coa_template_register to authenticated;

-- Same exposure as the other template functions: signed-in users only.
revoke all on function public.upsert_coa_template(uuid, uuid, jsonb) from public, anon;
grant execute on function public.upsert_coa_template(uuid, uuid, jsonb) to authenticated;
revoke all on function public.bulk_create_coa_templates(jsonb) from public, anon;
grant execute on function public.bulk_create_coa_templates(jsonb) to authenticated;
revoke all on function public.can_manage_coa_template(uuid, uuid) from public, anon;
grant execute on function public.can_manage_coa_template(uuid, uuid) to authenticated;

-- The revisions table joins the audit trail like every other business table
-- (same triggers 0072 attaches: row audit, truncate audit, who/when stamps).
do $$
declare
  v_tbl text := 'coa_template_revisions';
begin
  execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || v_tbl, v_tbl);
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_fn_audit_log(%L)',
                 'trg_audit_' || v_tbl, v_tbl, 'id');
  execute format('drop trigger if exists %I on public.%I', 'trg_audit_truncate_' || v_tbl, v_tbl);
  execute format('create trigger %I after truncate on public.%I for each statement execute function public.trg_fn_audit_truncate()',
                 'trg_audit_truncate_' || v_tbl, v_tbl);
  execute format('alter table public.%I add column if not exists created_at timestamptz', v_tbl);
  execute format('alter table public.%I alter column created_at set default now()', v_tbl);
  execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id)', v_tbl);
  execute format('alter table public.%I add column if not exists updated_at timestamptz', v_tbl);
  execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id)', v_tbl);
  execute format('drop trigger if exists %I on public.%I', 'trg_stamp_created_' || v_tbl, v_tbl);
  execute format('create trigger %I before insert on public.%I for each row execute function public.trg_fn_stamp_created()',
                 'trg_stamp_created_' || v_tbl, v_tbl);
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                 'trg_stamp_updated_' || v_tbl, v_tbl);
end $$;
