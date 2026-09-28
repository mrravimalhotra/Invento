-- ============================================================
-- SEC-04 / DES-03 (docs/AI_TESTING_SECURITY_PERFORMANCE_REFERENCE.md):
-- stop direct table writes from bypassing the workflow.
--
-- The problem: several workflow steps are enforced only inside SECURITY
-- DEFINER RPCs or triggers, while the tables' own RLS write policies are
-- role-only. Any user holding the right role can call PostgREST directly
-- with their normal JWT and the public anon key, skipping those steps:
--   * set finished_product_batches.status = 'approved' without QC — no
--     fp_yield ledger push ever happens (stock silently missing);
--   * set mfr_definitions.approved_by/approved_at without
--     approve_mfr_definition() — no FP / Packaged-FP item pair is created;
--   * edit or delete mfr_lines of an APPROVED MFR — the recipe lock in
--     update_mfr_recipe() (0043) is only enforced inside that RPC;
--   * edit lines of a SUBMITTED purchase order (DES-03) — live_remaining_qty
--     is recomputed but the ledger push made at submit is not, so batch and
--     stock balances drift apart;
--   * flip purchase_orders.status directly (draft <-> submitted) without
--     submit_purchase_order()/reopen_purchase_order() — the ledger push or
--     its compensating reversal never happens. 0019 accepted this as a trust
--     decision; it is closed here too because otherwise the purchase-line
--     guard above could be sidestepped by reopening a PO by hand.
--
-- The rule, applied by BEFORE triggers on the five tables:
--   A write is a DIRECT CLIENT WRITE when current_user is 'authenticated' or
--   'anon' — i.e. it came through PostgREST (the app's Server Actions, or
--   anyone calling the API directly). Every trusted writer in the schema is
--   a SECURITY DEFINER function owned by postgres (submit/reopen PO, record
--   wastage, approve/create/update MFR, bulk uploads, the QC-review trigger,
--   the FP draft-cancel reversal, packaging/component triggers,
--   expire_stale_fp_drafts), so inside them current_user is 'postgres' and
--   they pass untouched. So does the Supabase SQL editor (postgres) and the
--   service-role client (service_role). The guard functions themselves are
--   deliberately NOT security definer, so current_user reflects the caller.
--   Direct client writes keep working for every step the app legitimately
--   performs directly today (checked against every .insert/.update/.delete
--   on these tables in lib/actions): FP draft -> in_process / cancelled,
--   in_process -> complete_awaiting_qc, complete_awaiting_qc ->
--   submitted_to_qc; MFR active toggle; creating a draft PO; adding,
--   editing and deleting lines of a draft PO.
--
-- Guard trigger names start with "trg_00_guard_" so they sort (and
-- therefore fire) before every existing BEFORE trigger on the same tables
-- (e.g. trg_fp_updated, trg_purchase_line_live_remaining) — they see exactly
-- what the client sent, before updated_at/live_remaining_qty are filled in.
--
-- No data is changed. Existing rows are untouched; only future direct
-- writes are checked. Run as one transaction; the self-check at the end
-- aborts everything if any guard trigger is missing.
-- ============================================================

begin;

create or replace function public._is_direct_client_write()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon');
$$;

comment on function public._is_direct_client_write() is
  'True when the current statement comes straight from PostgREST (authenticated/anon), false inside SECURITY DEFINER functions, the SQL editor, or the service role. Used by the trg_00_guard_* workflow triggers (0070).';

-- ------------------------------------------------------------
-- 1. finished_product_batches — status may only move along the app's own
--    direct steps; approved/rejected only via the QC review trigger.
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_fp_batch_workflow()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_direct_client_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      raise exception 'A new finished product batch must start as a draft (got "%").', new.status
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'cancelled') then
      raise exception 'Finished product batch % is "%" and cannot be deleted.', old.batch_number, old.status
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    if not (
         (old.status = 'draft'                and new.status in ('in_process', 'cancelled'))
      or (old.status = 'in_process'           and new.status = 'complete_awaiting_qc')
      or (old.status = 'complete_awaiting_qc' and new.status = 'submitted_to_qc')
    ) then
      raise exception 'Finished product batch % cannot move from "%" to "%" directly. Approval and rejection happen only through the QC review.',
        old.batch_number, old.status, new.status
        using errcode = '42501';
    end if;
  elsif old.status not in ('draft', 'in_process') then
    raise exception 'Finished product batch % is "%" and can no longer be edited.', old.batch_number, old.status
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_guard_fp_batch_workflow on public.finished_product_batches;
create trigger trg_00_guard_fp_batch_workflow
  before insert or update or delete on public.finished_product_batches
  for each row execute function public.trg_fn_guard_fp_batch_workflow();

-- ------------------------------------------------------------
-- 2. mfr_definitions — approval fields only via approve_mfr_definition();
--    an approved MFR can only be activated/deactivated directly.
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_mfr_definition_workflow()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_direct_client_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.approved_by is not null or new.approved_at is not null or new.finished_product_item_id is not null then
      raise exception 'A new MFR must be created unapproved; use Approve to approve it.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.finished_product_item_id is distinct from old.finished_product_item_id
     or new.version is distinct from old.version then
    raise exception 'MFR % approval details can only be changed with Approve.', old.code
      using errcode = '42501';
  end if;

  if old.approved_by is not null
     and (to_jsonb(new) - 'active' - 'updated_at' - 'updated_by')
         is distinct from (to_jsonb(old) - 'active' - 'updated_at' - 'updated_by') then
    raise exception 'MFR % is approved and locked; only Activate/Deactivate is allowed.', old.code
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_guard_mfr_definition_workflow on public.mfr_definitions;
create trigger trg_00_guard_mfr_definition_workflow
  before insert or update on public.mfr_definitions
  for each row execute function public.trg_fn_guard_mfr_definition_workflow();

-- ------------------------------------------------------------
-- 3. mfr_lines — recipe lines of an approved MFR are locked.
--    (A parent that no longer exists — e.g. an admin deleting the MFR,
--    which cascades here — is not treated as approved.)
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_mfr_lines_locked()
returns trigger language plpgsql set search_path = public as $$
declare
  v_code text;
begin
  if not public._is_direct_client_write() then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select code into v_code from public.mfr_definitions
    where id = old.mfr_definition_id and approved_by is not null;
    if found then
      raise exception 'MFR % is approved; its recipe lines are locked.', v_code
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select code into v_code from public.mfr_definitions
    where id = new.mfr_definition_id and approved_by is not null;
    if found then
      raise exception 'MFR % is approved; its recipe lines are locked.', v_code
        using errcode = '42501';
    end if;
    return new;
  end if;

  return old;
end $$;

drop trigger if exists trg_00_guard_mfr_lines_locked on public.mfr_lines;
create trigger trg_00_guard_mfr_lines_locked
  before insert or update or delete on public.mfr_lines
  for each row execute function public.trg_fn_guard_mfr_lines_locked();

-- ------------------------------------------------------------
-- 4. purchase_orders — status and submit/reopen stamps only via
--    submit_purchase_order() / reopen_purchase_order(); a submitted PO's
--    header is locked (only active may change).
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_purchase_order_workflow()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public._is_direct_client_write() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft'
       or new.submitted_at is not null or new.submitted_by is not null
       or new.reopened_at is not null or new.reopened_by is not null then
      raise exception 'A new purchase order must start as a draft; use Final Submit to submit it.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status is distinct from old.status
     or new.submitted_at is distinct from old.submitted_at
     or new.submitted_by is distinct from old.submitted_by
     or new.reopened_at is distinct from old.reopened_at
     or new.reopened_by is distinct from old.reopened_by then
    raise exception 'Purchase order % can only be submitted with Final Submit and reopened with Reopen.', old.po_number
      using errcode = '42501';
  end if;

  if old.status = 'submitted'
     and (to_jsonb(new) - 'active' - 'updated_at' - 'updated_by')
         is distinct from (to_jsonb(old) - 'active' - 'updated_at' - 'updated_by') then
    raise exception 'Purchase order % is submitted and locked. Ask a System Admin to reopen it first.', old.po_number
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_guard_purchase_order_workflow on public.purchase_orders;
create trigger trg_00_guard_purchase_order_workflow
  before insert or update on public.purchase_orders
  for each row execute function public.trg_fn_guard_purchase_order_workflow();

-- ------------------------------------------------------------
-- 5. purchase_lines — lines can only be added, edited or deleted while
--    their PO is a draft; pushed_at and live_remaining_qty are never set
--    directly (the submit RPC and the stock triggers own them).
-- ------------------------------------------------------------
create or replace function public.trg_fn_guard_purchase_line_workflow()
returns trigger language plpgsql set search_path = public as $$
declare
  v_po record;
begin
  if not public._is_direct_client_write() then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select po_number, status into v_po from public.purchase_orders where id = old.purchase_order_id;
    if found and v_po.status <> 'draft' then
      raise exception 'Purchase order % is submitted, so its lines are locked. Ask a System Admin to reopen it first.', v_po.po_number
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.purchase_order_id is distinct from old.purchase_order_id then
      raise exception 'A purchase line cannot be moved to a different purchase order.'
        using errcode = '42501';
    end if;
    if new.pushed_at is distinct from old.pushed_at
       or new.live_remaining_qty is distinct from old.live_remaining_qty then
      raise exception 'Stock fields on a purchase line are maintained automatically and cannot be set directly.'
        using errcode = '42501';
    end if;
  end if;

  select po_number, status into v_po from public.purchase_orders where id = new.purchase_order_id;
  if found and v_po.status <> 'draft' then
    raise exception 'Purchase order % is submitted, so lines cannot be added or changed. Ask a System Admin to reopen it first.', v_po.po_number
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.pushed_at is not null then
    raise exception 'Stock fields on a purchase line are maintained automatically and cannot be set directly.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_guard_purchase_line_workflow on public.purchase_lines;
create trigger trg_00_guard_purchase_line_workflow
  before insert or update or delete on public.purchase_lines
  for each row execute function public.trg_fn_guard_purchase_line_workflow();

-- ------------------------------------------------------------
-- Self-check: all five guards exist, fire before the older triggers on
-- their tables, and the guard functions are NOT security definer (which
-- would silently disable them by making current_user the owner).
-- ------------------------------------------------------------
do $$
declare
  v_expected text[] := array[
    'finished_product_batches:trg_00_guard_fp_batch_workflow',
    'mfr_definitions:trg_00_guard_mfr_definition_workflow',
    'mfr_lines:trg_00_guard_mfr_lines_locked',
    'purchase_orders:trg_00_guard_purchase_order_workflow',
    'purchase_lines:trg_00_guard_purchase_line_workflow'
  ];
  v_item text;
  v_count int;
begin
  foreach v_item in array v_expected loop
    select count(*) into v_count
    from pg_trigger t
    where not t.tgisinternal
      and t.tgrelid = ('public.' || split_part(v_item, ':', 1))::regclass
      and t.tgname = split_part(v_item, ':', 2);
    if v_count <> 1 then
      raise exception '0070 self-check failed: trigger % is missing.', v_item;
    end if;

    select count(*) into v_count
    from pg_trigger t
    where not t.tgisinternal
      and t.tgrelid = ('public.' || split_part(v_item, ':', 1))::regclass
      and (t.tgtype & 2) = 2                        -- BEFORE trigger
      and t.tgname < split_part(v_item, ':', 2);
    if v_count <> 0 then
      raise exception '0070 self-check failed: a BEFORE trigger on % sorts ahead of its guard.', split_part(v_item, ':', 1);
    end if;
  end loop;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('_is_direct_client_write', 'trg_fn_guard_fp_batch_workflow',
                      'trg_fn_guard_mfr_definition_workflow', 'trg_fn_guard_mfr_lines_locked',
                      'trg_fn_guard_purchase_order_workflow', 'trg_fn_guard_purchase_line_workflow')
    and p.prosecdef;
  if v_count <> 0 then
    raise exception '0070 self-check failed: a guard function is SECURITY DEFINER, which would disable it.';
  end if;
end $$;

commit;
