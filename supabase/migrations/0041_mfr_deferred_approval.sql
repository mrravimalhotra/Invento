-- ============================================================
-- Ravi (14 Sept 2026): "while creating MFR, transaction should be atomic,
-- new MFR, Finished Product or Packaged Finished Product should only get
-- created once MFR is approved otherwise there is no point of creating
-- these."
--
-- Two changes, both scoped via AskUserQuestion before writing this:
--
-- 1. ATOMICITY. createMfrDefinition() (lib/actions/mfr.ts) did up to five
--    separate inserts/updates with manual best-effort .delete() rollback
--    on each failure, "because the Supabase client doesn't give us a real
--    multi-statement transaction" (its own header comment, now removed).
--    That was never a real transaction — a crash between steps (lost
--    connection, function timeout) could leave a partial row behind with
--    no rollback at all. This migration moves both MFR creation and MFR
--    approval into `security definer` RPCs, the same pattern already
--    proven by bulk_create_mfr_definitions() (0037_bulk_upload_mfr.sql):
--    a function body runs inside one real Postgres transaction, so any
--    RAISE EXCEPTION anywhere in it rolls back every insert the call has
--    made so far, including a mid-crash.
--
-- 2. DEFERRED ITEM CREATION. Task F (claude/packaged-fp-redesign.md)
--    deliberately chose to create the paired Finished Product + Packaged
--    FP items "automatically, the moment FP-0001 is created" — eagerly,
--    at MFR-definition time, before any approval. Ravi's request today
--    reverses that specific choice: an MFR that's created but never
--    approved was, under the old design, still burning two item codes
--    (FP-##### / PKG-FP-#####) and leaving two live Item Master rows
--    behind for a recipe nobody signed off on — exactly what he saw
--    happen the time a failed/abandoned MFR draft had to be manually
--    cleaned up (the "draft FP and Finished FP deleted, counter not
--    reset" conversation, same day). Going forward:
--      - create_mfr_definition() creates ONLY mfr_definitions +
--        mfr_lines (version 1). finished_product_item_id stays null.
--      - approve_mfr_definition() is the one and only place a Finished
--        Product / Packaged FP item pair now gets created — the instant
--        an MFR is approved, atomically, in the same transaction as
--        setting approved_by/approved_at.
--      - Re-approving an edited recipe (updateMfrLines() already clears
--        approved_by/approved_at back to null on every edit, forcing
--        re-approval) does NOT create a second item pair —
--        approve_mfr_definition() only creates items the first time
--        finished_product_item_id is still null; on every later
--        (re-)approval it reuses the pair already on file.
--
--    Confirmed via AskUserQuestion (14 Sept 2026):
--      - /finished-product/new's MFR picker now also requires
--        approved_by is not null (app-side change, lib change only —
--        see that page). An unapproved recipe can no longer be used to
--        start production at all, not just "has no item yet."
--      - Bulk-uploaded MFRs (bulk_create_mfr_definitions(),
--        0037_bulk_upload_mfr.sql) get the exact same treatment for
--        consistency: item creation deferred to approval there too.
--        Bulk upload never auto-approves, so every bulk-uploaded MFR now
--        needs a manual Approve click (same screen as any other MFR)
--        before it can be used for production.
--
--    Where the submitted Item Type goes in the meantime: rather than add
--    a new staging column, this reuses mfr_definitions.item_type_id —
--    present since 0001_init.sql, marked deprecated by 0010 once the
--    linked Finished Product item became the source of truth for item
--    type. It's un-deprecated here, repurposed as exactly the "item type
--    to give the Finished Product item once one exists" field: written at
--    create time, read once at approval time to seed the new item, left
--    in place afterward (redundant with the item's own item_type_id post-
--    approval, but harmless — same "don't drop a column that still has a
--    real use" reasoning 0010 itself used).
-- ============================================================

-- ------------------------------------------------------------
-- create_mfr_definition() — replaces createMfrDefinition()'s first four
-- manual steps (FP item, PKG-FP item, pairing, mfr_definitions insert)
-- with just one: the mfr_definitions header (item_type_id stored, not
-- yet applied to any item — there isn't one yet) plus its version-1
-- mfr_lines, both inside one transaction.
-- ------------------------------------------------------------
create or replace function public.create_mfr_definition(
  p_name text,
  p_batch_size_qty numeric,
  p_batch_size_unit text,
  p_item_type_id uuid,
  p_lines jsonb
)
returns table(id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(both from coalesce(p_name, ''));
  v_line jsonb;
  v_mfr_code text;
  v_def_id uuid;
begin
  -- Mirrors MODULE_WRITE_ROLES.mfr (lib/constants/roles.ts) — same
  -- reasoning bulk_create_mfr_definitions() gives: security definer
  -- bypasses RLS, so this check is what actually gates the call.
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to create an MFR definition.';
  end if;

  if v_name = '' then
    raise exception 'Name is required.';
  end if;
  if p_batch_size_qty is null or p_batch_size_qty <= 0 then
    raise exception 'Batch size must be greater than 0.';
  end if;
  if p_batch_size_unit is null or p_batch_size_unit = '' then
    raise exception 'Batch size unit is required.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one recipe line.';
  end if;

  -- Same case-insensitive duplicate-name check createMfrDefinition() did
  -- before its first insert — still done first, before the code sequence
  -- is ever touched.
  if exists (select 1 from public.mfr_definitions where name ilike v_name) then
    raise exception '"%" already exists as an MFR.', v_name;
  end if;

  v_mfr_code := public.get_next_mfr_code();

  insert into public.mfr_definitions (code, name, batch_size_qty, batch_size_unit, item_type_id)
    values (v_mfr_code, v_name, p_batch_size_qty, p_batch_size_unit, p_item_type_id)
    returning mfr_definitions.id into v_def_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if (v_line->>'item_id') is null or (v_line->>'quantity') is null
       or v_line->>'unit' is null or v_line->>'unit' = '' then
      raise exception 'Every recipe line needs an item, quantity, and unit.';
    end if;
    if (v_line->>'quantity')::numeric <= 0 then
      raise exception 'Recipe line quantity must be greater than 0.';
    end if;
    insert into public.mfr_lines (mfr_definition_id, version, item_id, quantity, unit)
      values (v_def_id, 1, (v_line->>'item_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit');
  end loop;

  id := v_def_id;
  code := v_mfr_code;
  return next;
end $$;

-- ------------------------------------------------------------
-- approve_mfr_definition() — the new home for Finished Product / Packaged
-- FP item creation. `for update` locks the row for the duration of the
-- transaction, so two concurrent Approve clicks on the same MFR can't
-- both pass the "not yet approved" check — the loser blocks on the lock,
-- then fails the check once it acquires it, same optimistic-lock outcome
-- approveMfrDefinition() used to get from `.is("approved_by", null)` on
-- its update, just enforced by a real row lock instead of a second
-- round trip.
-- ------------------------------------------------------------
create or replace function public.approve_mfr_definition(p_id uuid)
returns table(fp_item_code text, packaged_item_code text, items_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def record;
  v_fp_item_id uuid;
  v_pkg_item_id uuid;
  v_fp_item_code text;
  v_pkg_item_code text;
  v_created boolean := false;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to approve an MFR definition.';
  end if;

  select * into v_def from public.mfr_definitions where mfr_definitions.id = p_id for update;
  if not found then
    raise exception 'MFR definition not found.';
  end if;
  if v_def.approved_by is not null then
    raise exception 'This MFR is already approved.';
  end if;

  if v_def.finished_product_item_id is null then
    -- First-ever approval of this MFR (or of this recipe version's very
    -- first pass) — create the Finished Product + Packaged FP pair now,
    -- same shape createMfrDefinition() used to create eagerly at
    -- MFR-creation time, just moved here.
    v_fp_item_code := public.get_next_item_code('processed');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_fp_item_code, v_def.name, 'processed', v_def.item_type_id, v_def.batch_size_unit)
      returning items.id into v_fp_item_id;

    v_pkg_item_code := public.get_next_item_code('packaged_fp');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_pkg_item_code, v_def.name, 'packaged_fp', v_def.item_type_id, 'count')
      returning items.id into v_pkg_item_id;

    update public.items set packaged_item_id = v_pkg_item_id where items.id = v_fp_item_id;

    update public.mfr_definitions set finished_product_item_id = v_fp_item_id where mfr_definitions.id = p_id;
    v_created := true;
  else
    -- Re-approval after an edit (updateMfrLines() clears approved_by/
    -- approved_at on every recipe change, forcing this path again) —
    -- the item pair already exists from a prior approval. Reuse it
    -- rather than creating a second pair, which the unique constraints
    -- on mfr_definitions.finished_product_item_id and
    -- items.packaged_item_id would reject anyway.
    v_fp_item_id := v_def.finished_product_item_id;
    select item_code, packaged_item_id into v_fp_item_code, v_pkg_item_id
      from public.items where items.id = v_fp_item_id;
    if v_pkg_item_id is not null then
      select item_code into v_pkg_item_code from public.items where items.id = v_pkg_item_id;
    end if;
  end if;

  update public.mfr_definitions
    set approved_by = auth.uid(), approved_at = now()
    where mfr_definitions.id = p_id;

  fp_item_code := v_fp_item_code;
  packaged_item_code := v_pkg_item_code;
  items_created := v_created;
  return next;
end $$;

-- ------------------------------------------------------------
-- bulk_create_mfr_definitions() — same deferral applied to the bulk-
-- upload path, per Ravi's "defer for bulk upload too" answer. Drop first:
-- the return table's column set is changing (fp_item_code/
-- packaged_item_code dropped — nothing in the app reads them, confirmed
-- by grep), and Postgres won't let `create or replace function` change a
-- function's OUT columns in place.
-- ------------------------------------------------------------
drop function if exists public.bulk_create_mfr_definitions(jsonb);

create or replace function public.bulk_create_mfr_definitions(p_payload jsonb)
returns table(mfr_name text, mfr_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_def jsonb;
  v_line jsonb;
  v_name text;
  v_batch_qty numeric;
  v_batch_unit text;
  v_item_type_id uuid;
  v_lines jsonb;
  v_mfr_code text;
  v_def_id uuid;
  v_idx int := 0;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to bulk-create MFR definitions.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No MFR definitions to create.';
  end if;

  for v_def in select * from jsonb_array_elements(p_payload)
  loop
    v_idx := v_idx + 1;
    v_name := trim(both from coalesce(v_def->>'name', ''));
    v_batch_qty := nullif(v_def->>'batch_size_qty', '')::numeric;
    v_batch_unit := v_def->>'batch_size_unit';
    v_item_type_id := nullif(v_def->>'item_type_id', '')::uuid;
    v_lines := v_def->'lines';

    if v_name = '' then
      raise exception 'MFR #%: name is required.', v_idx;
    end if;
    if v_batch_qty is null or v_batch_qty <= 0 then
      raise exception 'MFR "%": batch size must be greater than 0.', v_name;
    end if;
    if v_batch_unit is null or v_batch_unit = '' then
      raise exception 'MFR "%": batch size unit is required.', v_name;
    end if;
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'MFR "%": needs at least one recipe line.', v_name;
    end if;

    -- Finished Product / Packaged FP items are no longer created here —
    -- see approve_mfr_definition() above. A bulk-uploaded MFR now lands
    -- the same way a manually-created one does: a recipe on file,
    -- unapproved, with no item pair until someone approves it.
    v_mfr_code := public.get_next_mfr_code();
    insert into public.mfr_definitions (code, name, batch_size_qty, batch_size_unit, item_type_id)
      values (v_mfr_code, v_name, v_batch_qty, v_batch_unit, v_item_type_id)
      returning id into v_def_id;

    for v_line in select * from jsonb_array_elements(v_lines)
    loop
      if (v_line->>'item_id') is null or (v_line->>'quantity') is null
         or v_line->>'unit' is null or v_line->>'unit' = '' then
        raise exception 'MFR "%": every recipe line needs an item, quantity, and unit.', v_name;
      end if;
      if (v_line->>'quantity')::numeric <= 0 then
        raise exception 'MFR "%": recipe line quantity must be greater than 0.', v_name;
      end if;
      insert into public.mfr_lines (mfr_definition_id, version, item_id, quantity, unit)
        values (v_def_id, 1, (v_line->>'item_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit');
    end loop;

    mfr_name := v_name;
    mfr_code := v_mfr_code;
    return next;
  end loop;
end $$;

-- No explicit grants needed for any of the three functions above —
-- 0001_init.sql's `alter default privileges ... grant execute on
-- functions to anon, authenticated` already covers every function
-- created after it (see 0037's own closing comment for the same note).
