-- 0101: Opening stock for go-live, part 2: finished product (packed and bulk)
--
-- Ravi, 4 Oct 2026 (FB-0054 / B4). Follows 0100 (raw material and packaging).
--
-- An opening finished-product row is one batch from the old records, already
-- QC-approved, with some quantity still in bulk (unpacked) and some already in
-- packs. How it is recorded, so every existing screen works unchanged:
--  * a finished product batch (status approved, no composition, no samples), tagged
--    is_legacy and linked to the load. Its yield = bulk + the bulk that went into the packs.
--  * the batch yield is pushed to the finished product's ledger (reference fp_yield),
--    exactly as QC approval does for a new batch.
--  * a closed, approved QC record with the old AR number as typed (is_legacy).
--  * when packs are in stock, one Store packaging issue for the packs (pull of the bulk,
--    pack count on the batch), tagged with the load. The ledger then shows only the
--    unpacked bulk as finished product stock, as it does for a new batch.
-- Undo (0100) is extended to remove these.

begin;

alter table public.finished_product_batches
  add column is_legacy boolean not null default false,
  add column opening_load_id uuid references public.opening_loads(id);
alter table public.packaging_issues
  add column opening_load_id uuid references public.opening_loads(id);
create index finished_product_batches_opening_load_idx on public.finished_product_batches (opening_load_id)
  where opening_load_id is not null;
create index packaging_issues_opening_load_idx on public.packaging_issues (opening_load_id)
  where opening_load_id is not null;
comment on column public.finished_product_batches.is_legacy is
  'True for a batch loaded as opening stock (0101): its batch number and AR number are the old ones, as typed.';

-- A legacy batch has no sample quantities; everything else about completion stays required.
alter table public.finished_product_batches drop constraint if exists fp_completion_fields_required_together;
alter table public.finished_product_batches add constraint fp_completion_fields_required_together
  check (
    finish_date is null
    or is_legacy
    or (batch_yield is not null and batch_yield > 0 and expiry_month is not null
        and qc_sample_qty is not null and qc_sample_qty > 0
        and stability_qty is not null and stability_qty > 0
        and (rnd_qty is null or rnd_qty > 0))
  ) not valid;

-- ------------------------------------------------------------
-- Load finished product opening stock
--   p_rows: array of objects, already checked by the app (these checks are the backstop):
--     item_id (the finished product item), batch_number, manufacture_date, expiry_date,
--     bulk_qty, packs, pack_size_qty, pack_size_unit, old_ar, approval_date
-- ------------------------------------------------------------
create or replace function public.load_opening_finished_product(p_rows jsonb)
returns table(load_no text, row_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_load_id   uuid;
  v_load_no   text;
  v_row       jsonb;
  v_idx       integer := 0;
  v_item      record;
  v_mfr       record;
  v_batch     text;
  v_mfg       date;
  v_exp       date;
  v_appr      date;
  v_ar        text;
  v_bulk      numeric;
  v_packs     numeric;
  v_psize     numeric;
  v_punit     text;
  v_packed    numeric;   -- bulk in the packs, in the item's unit
  v_total     numeric;   -- bulk + packed, in the item's unit
  v_yield     numeric;   -- same, in the batch unit
  v_batch_id  uuid;
  v_n_bulk    integer := 0;
  v_n_packs   integer := 0;
  v_code      text;
begin
  if not public.has_app_access() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed.' using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No rows to load.' using errcode = 'P0001';
  end if;

  v_load_no := 'OPN-' || public._pad_seq_code(nextval('public.opening_load_seq')::text, 4);
  insert into public.opening_loads (load_no, kind, row_count)
    values (v_load_no, 'finished', jsonb_array_length(p_rows))
    returning id into v_load_id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;

    select i.id, i.item_code, i.unit, i.packaged_item_id, i.category into v_item
      from public.items i where i.id = (v_row->>'item_id')::uuid and i.active;
    if not found or v_item.category <> 'processed' then
      raise exception 'Row %: finished product not found or inactive.', v_idx using errcode = 'P0001';
    end if;
    select md.id, md.version, md.batch_size_unit into v_mfr
      from public.mfr_definitions md where md.finished_product_item_id = v_item.id;
    if not found then
      raise exception 'Row %: % has no MFR.', v_idx, v_item.item_code using errcode = 'P0001';
    end if;

    v_batch := nullif(btrim(coalesce(v_row->>'batch_number', '')), '');
    if v_batch is null then
      raise exception 'Row %: batch number is required.', v_idx using errcode = 'P0001';
    end if;
    if (left(v_batch, length(v_item.item_code) + 1) = v_item.item_code || '-' and v_batch ~ '/[0-9]{2}$')
       or v_batch ~* '^(PR|OR)-[0-9]+/[0-9]{2}$' then
      raise exception 'Row %: batch number "%" looks like a batch number made by the app. Use the number from the old records.', v_idx, v_batch
        using errcode = 'P0001';
    end if;
    if exists (select 1 from public.finished_product_batches where batch_number = v_batch) then
      raise exception 'Row %: batch number "%" is already used.', v_idx, v_batch using errcode = 'P0001';
    end if;

    v_mfg  := nullif(v_row->>'manufacture_date', '')::date;
    v_exp  := nullif(v_row->>'expiry_date', '')::date;
    v_appr := nullif(v_row->>'approval_date', '')::date;
    if v_mfg is null or v_mfg > v_today then
      raise exception 'Row %: manufacture date is required and cannot be in the future.', v_idx using errcode = 'P0001';
    end if;
    if v_exp is null or v_exp <= v_mfg then
      raise exception 'Row %: expiry date is required and must be after the manufacture date.', v_idx using errcode = 'P0001';
    end if;
    if v_appr is null or v_appr > v_today or v_appr < v_mfg then
      raise exception 'Row %: QC approval date is required, cannot be in the future and cannot be before the manufacture date.', v_idx
        using errcode = 'P0001';
    end if;

    v_ar := nullif(btrim(coalesce(v_row->>'old_ar', '')), '');
    if v_ar is null then
      raise exception 'Row %: the old AR number is required.', v_idx using errcode = 'P0001';
    end if;
    if v_ar ~* '^AR(RM|FP)-[0-9]+/[0-9]{2}$' then
      raise exception 'Row %: AR number "%" looks like a number made by the app. Use the old number.', v_idx, v_ar using errcode = 'P0001';
    end if;
    if exists (select 1 from public.quality_checks where ar_number = v_ar) then
      raise exception 'Row %: AR number "%" is already used.', v_idx, v_ar using errcode = 'P0001';
    end if;

    v_bulk  := coalesce(nullif(v_row->>'bulk_qty', '')::numeric, 0);
    v_packs := coalesce(nullif(v_row->>'packs', '')::numeric, 0);
    if v_bulk < 0 or v_packs < 0 or v_packs <> trunc(v_packs) then
      raise exception 'Row %: bulk quantity cannot be negative and packs must be a whole number.', v_idx using errcode = 'P0001';
    end if;
    if v_bulk = 0 and v_packs = 0 then
      raise exception 'Row %: enter the bulk quantity, the packs in stock, or both.', v_idx using errcode = 'P0001';
    end if;

    v_packed := 0;
    if v_packs > 0 then
      v_psize := nullif(v_row->>'pack_size_qty', '')::numeric;
      v_punit := coalesce(nullif(v_row->>'pack_size_unit', ''), v_item.unit);
      if v_psize is null or v_psize <= 0 then
        raise exception 'Row %: pack size is required when packs are in stock.', v_idx using errcode = 'P0001';
      end if;
      if v_item.packaged_item_id is null then
        raise exception 'Row %: % has no packaged item yet, so packs cannot be recorded for it.', v_idx, v_item.item_code
          using errcode = 'P0001';
      end if;
      v_packed := public.convert_unit(v_psize, v_punit, v_item.unit) * v_packs;
      if v_packed is null then
        raise exception 'Row %: pack size unit "%" cannot be converted to %.', v_idx, v_punit, v_item.unit using errcode = 'P0001';
      end if;
    end if;

    v_total := v_bulk + v_packed;
    v_yield := v_total * coalesce(public.convert_unit(1, v_item.unit, v_mfr.batch_size_unit), 1);

    insert into public.finished_product_batches
      (batch_number, mfr_definition_id, mfr_version, target_qty, unit, status, expiry_month, finish_date,
       batch_start_date, batch_yield, is_legacy, opening_load_id, created_at)
      values (v_batch, v_mfr.id, v_mfr.version, v_yield, v_mfr.batch_size_unit, 'approved', v_exp, v_mfg,
              v_mfg, v_yield, true, v_load_id, (v_mfg::timestamp at time zone 'Asia/Kolkata') + interval '12 hours')
      returning id into v_batch_id;

    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, reference_type, reference_id, event_by)
      values ('push', v_item.id, v_total, v_item.unit, 'fp_yield', v_batch_id, auth.uid());

    insert into public.quality_checks
      (ar_number, finished_product_batch_id, expiry_date, status,
       checker_by, checker_at, checker_comments, reviewed_by, reviewed_at, review_comments,
       is_retest, is_legacy)
      values (v_ar, v_batch_id, v_exp, 'approved',
              auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours',
              'Legacy record, loaded as opening stock ' || v_load_no,
              auth.uid(), (v_appr::timestamp at time zone 'Asia/Kolkata') + interval '12 hours',
              'Legacy record, loaded as opening stock ' || v_load_no,
              false, true);

    if v_packs > 0 then
      v_code := public.get_next_packaging_issue_code();
      insert into public.packaging_issues
        (code, finished_product_batch_id, pack_size, pack_size_qty, pack_size_unit, fp_qty_consumed,
         unit_count, department, transaction_type, issue_date, opening_load_id)
        values (v_code, v_batch_id, trim_scale(v_psize)::text || ' ' || v_punit, v_psize, v_punit, v_packed,
                v_packs, 'store', 'pack', v_appr, v_load_id);
      v_n_packs := v_n_packs + 1;
    end if;
    if v_bulk > 0 then
      v_n_bulk := v_n_bulk + 1;
    end if;
  end loop;

  update public.opening_loads
     set summary = jsonb_build_object('with_bulk', v_n_bulk, 'with_packs', v_n_packs)
   where id = v_load_id;

  load_no := v_load_no;
  row_count := jsonb_array_length(p_rows);
  return next;
end $$;
revoke all on function public.load_opening_finished_product(jsonb) from public, anon;
grant execute on function public.load_opening_finished_product(jsonb) to authenticated;

-- ------------------------------------------------------------
-- Undo: now also removes a finished product load (still System Administrator only,
-- only while loading is open, and only if nothing from the load has been used).
-- ------------------------------------------------------------
create or replace function public.undo_opening_load(p_load_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no      text;
  v_kind    text;
  v_line    uuid[];
  v_batch   uuid[];
  v_issue   uuid[];
begin
  if not public.has_any_role('system_admin') then
    raise exception 'Only the System Administrator can undo an opening stock load.' using errcode = 'P0001';
  end if;
  if not (select is_open from public.opening_stock_settings) then
    raise exception 'Opening stock loading is closed. Re-open it to undo a load.' using errcode = 'P0001';
  end if;
  select load_no, kind into v_no, v_kind from public.opening_loads where id = p_load_id for update;
  if v_no is null then
    raise exception 'Load not found.' using errcode = 'P0002';
  end if;

  if v_kind = 'finished' then
    select array_agg(id) into v_batch from public.finished_product_batches where opening_load_id = p_load_id;
    select array_agg(id) into v_issue from public.packaging_issues where opening_load_id = p_load_id;

    -- anything that happened to these batches after the load means the stock has been used
    if exists (select 1 from public.packaging_issues pi
                where pi.finished_product_batch_id = any(v_batch) and pi.opening_load_id is distinct from p_load_id)
       or exists (select 1 from public.inventory_ledger il
                   where il.reference_id = any(v_batch) and il.reference_type <> 'fp_yield')
       or exists (select 1 from public.quality_checks q
                   where q.finished_product_batch_id = any(v_batch) and not q.is_legacy)
       or exists (select 1 from public.coa_records c where c.finished_product_batch_id = any(v_batch)) then
      raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
    end if;

    begin
      delete from public.inventory_ledger where reference_id = any(coalesce(v_issue, '{}') || coalesce(v_batch, '{}'));
      delete from public.packaging_issues where opening_load_id = p_load_id;
      delete from public.quality_checks where finished_product_batch_id = any(v_batch);
      delete from public.finished_product_batches where opening_load_id = p_load_id;
      delete from public.opening_loads where id = p_load_id;
    exception when foreign_key_violation then
      raise exception 'Load % cannot be undone: some of its stock has already been used.', v_no using errcode = 'P0001';
    end;
    return;
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

commit;
