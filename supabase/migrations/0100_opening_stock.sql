-- 0100: Opening stock for go-live, part 1: foundation, raw material and packaging
--
-- Ravi, 3 Oct 2026 (FB-0054 / B4). Opening stock is loaded from Excel while
-- loading is OPEN; the System Administrator closes it by hand after the agreed
-- cut-off (the app stores no cut-off date). Everyone with a role may load.
-- Batches and Analytical Report numbers that come from the old records are
-- tagged Legacy so they can be told apart from new ones.
--
-- How it fits the existing stock model: raw material and packaging go in as
-- purchase lines on a purchase record per vendor per load (numbered OPN-0001-01,
-- tagged with the load), pushed to the ledger on the day of the load. Nothing in
-- stock, FIFO, QC, labels or reports needs a special case. The oldest-first
-- order follows the batch's real receipt date (purchase_lines.created_at).
--
--  * Approved / Rejected raw material get a closed QC record carrying the old
--    AR number (kept as typed), the approval date, retest date and expiry date.
--    "Retests already done" is carried so the 3-retest limit still holds.
--  * Pending QC raw material gets no QC record; it joins the normal QC queue.
--    Its manufacturer expiry date is kept on the purchase line and offered as
--    the starting value when the Reviewer approves.
--  * Packaging needs no QC.
--
-- Finished product opening stock comes in a following migration.

begin;

-- ------------------------------------------------------------
-- 1. Loading window (one row) and the list of loads
-- ------------------------------------------------------------
create table public.opening_stock_settings (
  id        uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  is_open   boolean not null default true,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id)
);
insert into public.opening_stock_settings (singleton) values (true);
alter table public.opening_stock_settings enable row level security;
create policy opening_stock_settings_select on public.opening_stock_settings
  for select using ((select public.has_app_access()));

create sequence public.opening_load_seq start 1;

create table public.opening_loads (
  id         uuid primary key default gen_random_uuid(),
  load_no    text not null unique,
  kind       text not null check (kind in ('raw', 'packaging', 'finished')),
  row_count  integer not null check (row_count > 0),
  summary    jsonb not null default '{}'::jsonb
);
alter table public.opening_loads enable row level security;
create policy opening_loads_select on public.opening_loads
  for select using ((select public.has_app_access()));

-- who/when stamps and audit, like every other business table (0072)
do $$
declare
  v_tbl text;
begin
  foreach v_tbl in array array['opening_stock_settings', 'opening_loads'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || v_tbl, v_tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_fn_audit_log(%L)',
                   'trg_audit_' || v_tbl, v_tbl, case when v_tbl = 'opening_stock_settings' then 'id' else 'id' end);
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
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Legacy tags
-- ------------------------------------------------------------
alter table public.purchase_orders
  add column opening_load_id uuid references public.opening_loads(id);
alter table public.purchase_lines
  add column is_legacy boolean not null default false;
alter table public.quality_checks
  add column is_legacy boolean not null default false,
  add column legacy_retests_done smallint not null default 0
    check (legacy_retests_done between 0 and 3);

comment on column public.purchase_lines.is_legacy is
  'True for a batch that came in as opening stock (0100): its batch number is the old one, as typed.';
comment on column public.quality_checks.is_legacy is
  'True for a QC record loaded as opening stock (0100): its AR number is the old one, as typed.';
comment on column public.quality_checks.legacy_retests_done is
  'Retests already done before the batch was loaded as opening stock; counted toward the 3-retest limit.';

create index purchase_orders_opening_load_idx on public.purchase_orders (opening_load_id)
  where opening_load_id is not null;

-- ------------------------------------------------------------
-- 3. Open / close (System Administrator)
-- ------------------------------------------------------------
create or replace function public.set_opening_stock_open(p_open boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can close or re-open opening stock loading.' using errcode = 'P0001';
  end if;
  if p_open then
    update public.opening_stock_settings
       set is_open = true, reopened_at = now(), reopened_by = auth.uid()
     where not is_open;
  else
    update public.opening_stock_settings
       set is_open = false, closed_at = now(), closed_by = auth.uid()
     where is_open;
  end if;
end $$;
revoke all on function public.set_opening_stock_open(boolean) from public, anon;
grant execute on function public.set_opening_stock_open(boolean) to authenticated;

-- ------------------------------------------------------------
-- 4. Load raw material or packaging
--    p_rows: array of objects (the app has already checked each row; the
--    checks here are the backstop):
--      item_id, batch_number, quantity, receipt_date, vendor_id, unit_price,
--      gst_pct, expiry_date, qc_status (approved|pending|rejected), old_ar,
--      approval_date, retest_date, retests_done
-- ------------------------------------------------------------
create or replace function public.load_opening_stock(p_kind text, p_rows jsonb)
returns table(load_no text, row_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today       date := (now() at time zone 'Asia/Kolkata')::date;
  v_load_id     uuid;
  v_load_no     text;
  v_vendor_ids  uuid[];
  v_vendor      uuid;
  v_sys_vendor  uuid;
  v_po_id       uuid;
  v_po_seq      integer := 0;
  v_row         jsonb;
  v_idx         integer := 0;
  v_item        record;
  v_batch       text;
  v_qty         numeric;
  v_receipt     date;
  v_expiry      date;
  v_status      text;
  v_ar          text;
  v_appr        date;
  v_retest      date;
  v_retests     integer;
  v_line_id     uuid;
  v_n_app       integer := 0;
  v_n_pen       integer := 0;
  v_n_rej       integer := 0;
begin
  if not public.has_app_access() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed.' using errcode = 'P0001';
  end if;
  if p_kind not in ('raw', 'packaging') then
    raise exception 'Unknown opening stock type "%".', p_kind using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to load.' using errcode = 'P0001';
  end if;

  v_load_no := 'OPN-' || public._pad_seq_code(nextval('public.opening_load_seq')::text, 4);
  insert into public.opening_loads (load_no, kind, row_count)
    values (v_load_no, p_kind, jsonb_array_length(p_rows))
    returning id into v_load_id;

  -- one purchase record per vendor; rows without a vendor use one system vendor
  select vendor_id into v_sys_vendor from (select id as vendor_id from public.vendors where vendor_code = 'V-OPENING') s;
  if v_sys_vendor is null then
    insert into public.vendors (vendor_code, name, address)
      values ('V-OPENING', 'Opening stock (vendor not recorded)', 'System vendor for opening stock')
      returning id into v_sys_vendor;
  end if;

  select array_agg(distinct coalesce(nullif(r->>'vendor_id', '')::uuid, v_sys_vendor))
    into v_vendor_ids
    from jsonb_array_elements(p_rows) r;

  foreach v_vendor in array v_vendor_ids loop
    v_po_seq := v_po_seq + 1;
    insert into public.purchase_orders
      (po_number, vendor_id, invoice_number, invoice_date, status, submitted_at, submitted_by, opening_load_id)
      values (v_load_no || '-' || lpad(v_po_seq::text, 2, '0'), v_vendor, 'OPENING ' || v_load_no, v_today,
              'submitted', now(), auth.uid(), v_load_id)
      returning id into v_po_id;

    v_idx := 0;
    for v_row in select * from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      if coalesce(nullif(v_row->>'vendor_id', '')::uuid, v_sys_vendor) <> v_vendor then
        continue;
      end if;

      select id, item_code, unit, category into v_item
        from public.items
       where id = (v_row->>'item_id')::uuid and active;
      if not found then
        raise exception 'Row %: item not found or inactive.', v_idx using errcode = 'P0001';
      end if;
      if v_item.category is distinct from (case when p_kind = 'raw' then 'raw' else 'packaging' end) then
        raise exception 'Row %: % is not a % item.', v_idx, v_item.item_code,
          case p_kind when 'raw' then 'raw material' else 'packaging' end using errcode = 'P0001';
      end if;

      v_qty := (v_row->>'quantity')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Row %: quantity must be above 0.', v_idx using errcode = 'P0001';
      end if;
      v_receipt := (v_row->>'receipt_date')::date;
      if v_receipt is null or v_receipt > v_today then
        raise exception 'Row %: receipt date is required and cannot be in the future.', v_idx using errcode = 'P0001';
      end if;
      v_expiry := nullif(v_row->>'expiry_date', '')::date;

      v_batch := nullif(btrim(coalesce(v_row->>'batch_number', '')), '');
      if v_batch is null then
        if p_kind = 'raw' then
          raise exception 'Row %: batch number is required.', v_idx using errcode = 'P0001';
        end if;
        v_batch := public.get_next_batch_number(v_item.id);
      elsif left(v_batch, length(v_item.item_code) + 1) = v_item.item_code || '-' and v_batch ~ '/[0-9]{2}$' then
        raise exception 'Row %: batch number "%" looks like a batch number made by the app. Use the number on the container.', v_idx, v_batch
          using errcode = 'P0001';
      end if;
      if exists (select 1 from public.purchase_lines where item_id = v_item.id and batch_number = v_batch) then
        raise exception 'Row %: batch number "%" is already used for % .', v_idx, v_batch, v_item.item_code using errcode = 'P0001';
      end if;

      insert into public.purchase_lines
        (purchase_order_id, item_id, batch_number, quantity, unit, unit_price, gst_pct, expiry_date, is_legacy, created_at)
        values (v_po_id, v_item.id, v_batch, v_qty, v_item.unit,
                nullif(v_row->>'unit_price', '')::numeric, nullif(v_row->>'gst_pct', '')::numeric,
                v_expiry, true, (v_receipt::timestamp at time zone 'Asia/Kolkata') + interval '12 hours')
        returning id into v_line_id;

      insert into public.inventory_ledger
        (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
        values ('push', v_item.id, v_line_id, v_qty, v_item.unit, 'purchase', v_line_id, auth.uid());
      update public.purchase_lines set pushed_at = now() where id = v_line_id;

      if p_kind = 'raw' then
        v_status := coalesce(v_row->>'qc_status', '');
        if v_status not in ('approved', 'pending', 'rejected') then
          raise exception 'Row %: QC status must be Approved, Pending QC or Rejected.', v_idx using errcode = 'P0001';
        end if;
        if v_status = 'pending' then
          v_n_pen := v_n_pen + 1;
        else
          v_ar := nullif(btrim(coalesce(v_row->>'old_ar', '')), '');
          if v_ar is null then
            raise exception 'Row %: the old AR number is required for an Approved or Rejected batch.', v_idx using errcode = 'P0001';
          end if;
          if v_ar ~ '^AR(RM|FP)-[0-9]+/[0-9]{2}$' then
            raise exception 'Row %: AR number "%" looks like a number made by the app. Use the old number.', v_idx, v_ar using errcode = 'P0001';
          end if;
          if exists (select 1 from public.quality_checks where ar_number = v_ar) then
            raise exception 'Row %: AR number "%" is already used.', v_idx, v_ar using errcode = 'P0001';
          end if;
          v_appr := nullif(v_row->>'approval_date', '')::date;
          if v_appr is null or v_appr > v_today then
            raise exception 'Row %: QC approval date is required and cannot be in the future.', v_idx using errcode = 'P0001';
          end if;
          if v_status = 'approved' then
            v_retest := nullif(v_row->>'retest_date', '')::date;
            if v_retest is null or v_retest <= v_appr then
              raise exception 'Row %: retest date is required and must be after the QC approval date.', v_idx using errcode = 'P0001';
            end if;
            if v_expiry is null then
              raise exception 'Row %: expiry date is required for an Approved batch.', v_idx using errcode = 'P0001';
            end if;
            v_retests := coalesce(nullif(v_row->>'retests_done', '')::integer, 0);
            if v_retests not between 0 and 3 then
              raise exception 'Row %: retests already done must be 0 to 3.', v_idx using errcode = 'P0001';
            end if;
            v_n_app := v_n_app + 1;
          else
            v_retest := null;
            v_retests := 0;
            v_n_rej := v_n_rej + 1;
          end if;

          insert into public.quality_checks
            (ar_number, purchase_line_id, item_id, expiry_date, status,
             checker_by, checker_at, checker_comments,
             reviewed_by, reviewed_at, review_comments, retest_period_days,
             is_retest, is_legacy, legacy_retests_done)
            values (v_ar, v_line_id, v_item.id, case when v_status = 'approved' then v_expiry end, v_status,
                    auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours', 'Legacy record, loaded as opening stock ' || v_load_no,
                    auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours', 'Legacy record, loaded as opening stock ' || v_load_no,
                    case when v_status = 'approved' then (v_retest - v_appr) end,
                    false, true, v_retests);
        end if;
      end if;
    end loop;
  end loop;

  update public.opening_loads
     set summary = case when p_kind = 'raw'
                        then jsonb_build_object('approved', v_n_app, 'pending', v_n_pen, 'rejected', v_n_rej)
                        else '{}'::jsonb end
   where id = v_load_id;

  load_no := v_load_no;
  row_count := jsonb_array_length(p_rows);
  return next;
end $$;
revoke all on function public.load_opening_stock(text, jsonb) from public, anon;
grant execute on function public.load_opening_stock(text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 5. Undo a load (System Administrator, while loading is open, and only if
--    nothing from it has been used)
-- ------------------------------------------------------------
create or replace function public.undo_opening_load(p_load_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no   text;
  v_line uuid[];
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can undo an opening stock load.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed. Re-open it to undo a load.' using errcode = 'P0001';
  end if;
  select load_no into v_no from public.opening_loads where id = p_load_id for update;
  if v_no is null then
    raise exception 'Load not found.' using errcode = 'P0002';
  end if;

  select array_agg(pl.id) into v_line
    from public.purchase_lines pl
    join public.purchase_orders po on po.id = pl.purchase_order_id
   where po.opening_load_id = p_load_id;

  if exists (
       select 1 from public.inventory_ledger il
        where il.purchase_line_id = any(v_line)
          and not (il.event_type = 'push' and il.reference_type = 'purchase' and il.reference_id = il.purchase_line_id)) then
    raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
  end if;
  if exists (
       select 1 from public.quality_checks q
        where q.purchase_line_id = any(v_line) and not q.is_legacy) then
    raise exception 'Load % cannot be undone: a QC record has been started on one of its batches.', v_no using errcode = 'P0001';
  end if;

  begin
    delete from public.inventory_ledger where purchase_line_id = any(v_line);
    delete from public.quality_checks where purchase_line_id = any(v_line);
    delete from public.purchase_lines where id = any(v_line);
    delete from public.purchase_orders where opening_load_id = p_load_id;
    delete from public.opening_loads where id = p_load_id;
  exception when foreign_key_violation then
    raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
  end;
end $$;
revoke all on function public.undo_opening_load(uuid) from public, anon;
grant execute on function public.undo_opening_load(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. purge_test_data(): also clears the loads and restarts every counter that
--    the test period used (opening load numbers and the Analytical Report
--    counters, 0099), so the first real number starts at 0001.
-- ------------------------------------------------------------
create or replace function public.purge_test_data()
returns table(table_name text, rows_purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tables text[] := array[
    'bmr_observations', 'bmr_records', 'bmr_weighment_lines', 'coa_records',
    'coa_template_lines', 'coa_templates',
    'dead_stock_items', 'documents', 'environmental_control_readings', 'equipment',
    'finished_product_batches', 'finished_product_components', 'inventory_ledger',
    'item_types', 'items', 'line_clearance_checks', 'mfr_definitions', 'mfr_lines',
    'mfr_procedure_steps', 'packaging_issue_items', 'packaging_issues',
    'production_issue_batches', 'purchase_lines', 'purchase_orders',
    'quality_checks', 'vendors', 'opening_loads'
  ];
  -- feedback_ticket_seq intentionally excluded — page_feedback is kept.
  v_sequences text[] := array[
    'item_code_seq_raw', 'item_code_seq_pkg', 'item_code_seq_fp', 'item_code_seq_pkgfp',
    'item_code_seq_rmfp',
    'vendor_code_seq', 'po_number_seq', 'ar_number_seq', 'mfr_code_seq',
    'coa_number_seq', 'equipment_code_seq', 'dead_stock_code_seq', 'packaging_issue_code_seq',
    'opening_load_seq'
  ];
  v_tbl text;
  v_seq text;
  v_count bigint;
  v_truncate_list text;
  v_ar_seq text;
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only System Admin can purge test data.';
  end if;

  foreach v_tbl in array v_tables loop
    execute format('select count(*) from public.%I', v_tbl) into v_count;
    table_name := v_tbl;
    rows_purged := v_count;
    return next;
  end loop;

  select string_agg(format('public.%I', t), ', ') into v_truncate_list from unnest(v_tables) as t;
  execute format('truncate table %s restart identity cascade', v_truncate_list);

  foreach v_seq in array v_sequences loop
    execute format('alter sequence public.%I restart with 1', v_seq);
  end loop;

  -- Analytical Report counters (0099) are one sequence per type and year; dropping
  -- them makes the next AR of each type start again at 0001.
  for v_ar_seq in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' and c.relname ~ '^ar_(rm|fp)_[0-9]{2}_seq$'
  loop
    execute format('drop sequence public.%I', v_ar_seq);
  end loop;
end $$;

commit;
