-- ============================================================
-- Bulk data upload — MFR RPC.
--
-- Ravi (13 Sept 2026): "create a temporary link in admin panel to upload
-- data... as bulk upload" for Item Master, Vendor, Item Type, and MFR
-- (scoped via AskUserQuestion to these four pure master/setup-data
-- modules — no ledger/workflow side effects — with Purchase deliberately
-- left for a later, separately-scoped pass; codes always auto-generated,
-- never taken from the file; all-or-nothing per upload).
--
-- Item Master, Vendor Master and Item Type Master don't need a new
-- migration: each bulk upload is (a) a loop of get_next_item_code()/
-- get_next_vendor_code() RPC calls (already existing, already
-- correct — no new function needed) followed by (b) exactly one
-- ordinary multi-row `insert()` from the app, which Postgres already
-- treats as a single atomic statement — no extra plumbing required for
-- "all rows or none."
--
-- MFR is different: createMfrDefinition() (lib/actions/mfr.ts) already
-- shows why — one MFR is FIVE separate inserts/updates across three
-- tables (Finished Product item → Packaged FP item → pairing update →
-- mfr_definitions → mfr_lines), each with manual best-effort rollback of
-- the others on failure, because the Supabase client gives no real
-- multi-statement transaction. That's an acceptable shape for ONE MFR
-- submitted by hand, but a bulk file can contain many MFRs, and
-- "all-or-nothing across the whole file" done via the same one-call-at-a-
-- time application-layer pattern would mean a failure on MFR #8 leaves
-- MFRs #1-7 already committed — exactly the partial-import outcome
-- Ravi's chosen error-handling model rules out.
--
-- The real fix, matching this project's dominant pattern for multi-step
-- transactional business logic (submit_purchase_order(),
-- reopen_purchase_order(), record_wastage(), check_sufficient_stock()):
-- one `security definer` function that does the whole file's worth of
-- work in a single RPC call. A Postgres function body runs inside the
-- caller's transaction; any RAISE EXCEPTION anywhere in the loop below
-- rolls back every insert the function has done so far in this call —
-- true all-or-nothing across every MFR in the uploaded file, not just
-- within one MFR's own five-step sequence.
--
-- Caveat, same as this project's existing sequence-gap precedent
-- elsewhere (batch-number retries, the standing tolerance noted in
-- claude/known-issues.md): get_next_item_code()/get_next_mfr_code() call
-- nextval() on a real sequence, and sequence advances are NOT
-- transactional in Postgres — they are not undone by a rollback. So a
-- file that fails validation partway through (e.g. MFR #8 of 10) rolls
-- back every row this call inserted, but the code numbers already
-- generated for MFRs #1-8 are still "spent" and will not be reused.
-- This is a cosmetic gap in the code sequence, not a data-integrity
-- issue — exactly the same acceptable tradeoff already made elsewhere in
-- this app.
--
-- This function trusts that the app layer (lib/actions/bulk-upload.ts)
-- has already done the bulk of validation (required fields, numeric
-- ranges, unit/category values, item/item-type existence) before
-- calling it — the checks below are a defensive backstop (matching the
-- project's "app-level + RPC-level + DB constraint" defense-in-depth
-- convention), not the primary validation layer.
-- ============================================================

create or replace function public.bulk_create_mfr_definitions(p_payload jsonb)
returns table(mfr_name text, mfr_code text, fp_item_code text, packaged_item_code text)
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
  v_fp_item_id uuid;
  v_fp_item_code text;
  v_pkg_item_id uuid;
  v_pkg_item_code text;
  v_mfr_code text;
  v_def_id uuid;
  v_idx int := 0;
begin
  -- Same reason record_wastage()/submit_purchase_order() check roles
  -- explicitly: SECURITY DEFINER bypasses RLS entirely, so the RLS
  -- policies on items/mfr_definitions/mfr_lines are not what's actually
  -- gating this call — this check is. Mirrors MODULE_WRITE_ROLES.mfr
  -- (lib/constants/roles.ts).
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

    -- 1. Finished Product item — same shape as createMfrDefinition()'s
    --    first insert.
    v_fp_item_code := public.get_next_item_code('processed');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_fp_item_code, v_name, 'processed', v_item_type_id, v_batch_unit)
      returning id into v_fp_item_id;

    -- 2. Paired Packaged Finished Product item (Task F) — same as
    --    createMfrDefinition()'s second insert.
    v_pkg_item_code := public.get_next_item_code('packaged_fp');
    insert into public.items (item_code, name, category, item_type_id, unit)
      values (v_pkg_item_code, v_name, 'packaged_fp', v_item_type_id, 'count')
      returning id into v_pkg_item_id;

    update public.items set packaged_item_id = v_pkg_item_id where id = v_fp_item_id;

    -- 3. MFR definition itself.
    v_mfr_code := public.get_next_mfr_code();
    insert into public.mfr_definitions (code, name, batch_size_qty, batch_size_unit, finished_product_item_id)
      values (v_mfr_code, v_name, v_batch_qty, v_batch_unit, v_fp_item_id)
      returning id into v_def_id;

    -- 4. Recipe lines (version 1 — a bulk-created MFR has no prior
    --    version to increment past, same as a manually-created one).
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
    fp_item_code := v_fp_item_code;
    packaged_item_code := v_pkg_item_code;
    return next;
  end loop;
end $$;

-- No explicit grant needed — 0001_init.sql's
-- `alter default privileges in schema public grant execute on functions
-- to anon, authenticated` already covers every function created after
-- it, functions included (unlike sequences, which do need an explicit
-- grant each time — see 0006_sequence_grants.sql / 0032's
-- item_code_seq_pkgfp grant).
