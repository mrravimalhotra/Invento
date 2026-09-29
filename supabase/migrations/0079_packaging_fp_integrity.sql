-- ============================================================
-- Packaging and finished-product integrity (accuracy audit ACC-05, ACC-12,
-- ACC-17, ACC-19, ACC-20 — claude/app-accuracy-audit-2026-09-28.md; Ravi,
-- 29 Sept 2026).
--
-- ACC-05  "Unpack"/"Repack" took MORE bulk product and packaging material
--         out instead of returning it. Ravi: "from packaging remove
--         transaction type — by default in packaging everything should be
--         packed — no repack, unpack required". Every packaging issue is now
--         a Pack; the database accepts nothing else for new records.
--
-- ACC-12  A packaging issue was saved in two steps (header, then material
--         lines). The header alone already took the finished product out of
--         stock; if the materials step failed (e.g. "Not enough stock" on
--         jars) the clean-up delete was silently blocked, so the stock stayed
--         deducted — and a retry deducted it again.
--         Now: create_packaging_issue() saves header and materials in ONE
--         transaction — all of it or none of it.
--
-- ACC-17  Same two-step problem for a new finished-product batch: a failed
--         component insert left an empty draft batch behind (and used up a
--         batch number) for anyone who isn't System Admin.
--         Now: create_finished_product_batch() saves batch and components in
--         one transaction.
--
-- ACC-19  A finished-product batch could be packed/issued beyond its OWN
--         yield (the stock check was item-level, so another batch of the
--         same product "covered" it) — breaking batch traceability on
--         packaging records and labels.
--         Now: each packaging issue is checked against what is left of that
--         batch (yield − QC/stability/R&D samples − earlier issues).
--
-- ACC-20  Packaging materials (bottles, jars, labels) came out of item stock
--         but never out of any purchase batch, so every batch still showed
--         its full quantity remaining.
--         Now: materials are drawn from their oldest submitted purchase
--         batches first (FIFO), each batch's remaining quantity goes down,
--         and each stock movement records which batch it came from. (Any
--         part not covered by a batch — e.g. an opening balance with no
--         batch — is still taken from item stock, as before.)
--
-- Both new functions run with the CALLER's rights (security invoker): the
-- same role and row rules apply as before; they only make the two inserts
-- one unit.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- ACC-05: only "pack" from now on
-- ------------------------------------------------------------
alter table public.packaging_issues drop constraint if exists packaging_issues_transaction_type_check;
alter table public.packaging_issues
  add constraint packaging_issues_transaction_type_check check (transaction_type = 'pack') not valid;
alter table public.packaging_issues alter column transaction_type set default 'pack';

-- ------------------------------------------------------------
-- ACC-19: a batch can't be packed/issued beyond what is left of it
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_batch_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch record;
  v_fp_unit text;
  v_factor numeric;
  v_left numeric;
  v_issued numeric;
begin
  if new.fp_qty_consumed is null or new.fp_qty_consumed <= 0 then
    return new;
  end if;

  -- Lock the batch so two issues against it at the same moment are checked
  -- one after the other.
  select fpb.batch_number, fpb.batch_yield, fpb.unit,
         coalesce(fpb.qc_sample_qty, 0) + coalesce(fpb.stability_qty, 0) + coalesce(fpb.rnd_qty, 0) as samples,
         md.finished_product_item_id
    into v_batch
    from public.finished_product_batches fpb
    join public.mfr_definitions md on md.id = fpb.mfr_definition_id
   where fpb.id = new.finished_product_batch_id
     for update of fpb;

  if v_batch.batch_yield is null then
    return new;   -- no yield recorded (older data): item-level check still applies
  end if;

  select unit into v_fp_unit from public.items where id = v_batch.finished_product_item_id;
  -- fp_qty_consumed is in the finished product's stock unit; the batch's
  -- yield is in the batch's unit (0076 keeps these compatible).
  v_factor := coalesce(public.convert_unit(1, v_batch.unit, coalesce(v_fp_unit, v_batch.unit)), 1);

  select coalesce(sum(fp_qty_consumed), 0) into v_issued
    from public.packaging_issues
   where finished_product_batch_id = new.finished_product_batch_id
     and id is distinct from new.id;

  v_left := (v_batch.batch_yield - v_batch.samples) * v_factor - v_issued;

  if new.fp_qty_consumed > v_left + 0.0000001 then
    raise exception 'Batch % has only % % left to pack or issue (yield less samples, less % % already issued). This issue needs % %.',
      v_batch.batch_number, trim_scale(round(greatest(v_left, 0), 6)), coalesce(v_fp_unit, v_batch.unit),
      trim_scale(round(v_issued, 6)), coalesce(v_fp_unit, v_batch.unit),
      trim_scale(round(new.fp_qty_consumed, 6)), coalesce(v_fp_unit, v_batch.unit)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_packaging_batch_balance on public.packaging_issues;
create trigger trg_00_packaging_batch_balance
  before insert on public.packaging_issues
  for each row execute function public.trg_fn_packaging_batch_balance();

-- ------------------------------------------------------------
-- ACC-20: packaging materials drawn FIFO from their purchase batches
-- ------------------------------------------------------------
create or replace function public.trg_fn_packaging_item_pull()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text;
  v_left numeric;
  v_take numeric;
  r record;
begin
  select department into v_department
  from public.packaging_issues
  where id = new.packaging_issue_id;

  perform public.check_sufficient_stock(new.item_id, new.quantity);

  v_left := new.quantity;
  for r in
    select pl.id, pl.live_remaining_qty
      from public.purchase_lines pl
     where pl.item_id = new.item_id
       and pl.active
       and pl.pushed_at is not null
       and pl.live_remaining_qty > 0
     order by pl.created_at, pl.id
       for update
  loop
    exit when v_left <= 0;
    v_take := least(r.live_remaining_qty, v_left);
    update public.purchase_lines set live_remaining_qty = live_remaining_qty - v_take where id = r.id;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('pull', new.item_id, r.id, v_take, new.unit, v_department, 'packaging', new.packaging_issue_id, auth.uid());
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    -- Stock not held in any batch (e.g. an opening balance): taken from the
    -- item as before.
    insert into public.inventory_ledger
      (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
    values
      ('pull', new.item_id, v_left, new.unit, v_department, 'packaging', new.packaging_issue_id, auth.uid());
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- ACC-12: packaging issue + materials in one transaction
-- ------------------------------------------------------------
create or replace function public.create_packaging_issue(p_issue jsonb, p_materials jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  m jsonb;
begin
  insert into public.packaging_issues
    (code, finished_product_batch_id, pack_size, pack_size_qty, pack_size_unit, fp_qty_consumed,
     unit_count, department, transaction_type, qc_qty, stability_qty, rnd_qty)
  values
    (p_issue->>'code',
     (p_issue->>'finished_product_batch_id')::uuid,
     p_issue->>'pack_size',
     nullif(p_issue->>'pack_size_qty', '')::numeric,
     nullif(p_issue->>'pack_size_unit', ''),
     nullif(p_issue->>'fp_qty_consumed', '')::numeric,
     (p_issue->>'unit_count')::numeric,
     p_issue->>'department',
     'pack',
     nullif(p_issue->>'qc_qty', '')::numeric,
     nullif(p_issue->>'stability_qty', '')::numeric,
     nullif(p_issue->>'rnd_qty', '')::numeric)
  returning id into v_id;

  for m in select * from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb))
  loop
    insert into public.packaging_issue_items (packaging_issue_id, item_id, quantity, unit)
    values (v_id, (m->>'item_id')::uuid, (m->>'quantity')::numeric, m->>'unit');
  end loop;

  return v_id;
end $$;

revoke all on function public.create_packaging_issue(jsonb, jsonb) from public, anon;
grant execute on function public.create_packaging_issue(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- ACC-17: finished-product batch + components in one transaction
-- ------------------------------------------------------------
create or replace function public.create_finished_product_batch(p_batch jsonb, p_components jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  c jsonb;
begin
  if jsonb_array_length(coalesce(p_components, '[]'::jsonb)) = 0 then
    raise exception 'A batch needs at least one component.' using errcode = 'P0001';
  end if;

  insert into public.finished_product_batches
    (batch_number, short_batch_no, mfr_definition_id, mfr_version, target_qty, unit, batch_start_date, status)
  values
    (p_batch->>'batch_number',
     p_batch->>'short_batch_no',
     (p_batch->>'mfr_definition_id')::uuid,
     (p_batch->>'mfr_version')::integer,
     (p_batch->>'target_qty')::numeric,
     p_batch->>'unit',
     nullif(p_batch->>'batch_start_date', '')::date,
     'draft')
  returning id into v_id;

  for c in select * from jsonb_array_elements(p_components)
  loop
    insert into public.finished_product_components
      (finished_product_batch_id, item_id, purchase_line_id, production_batch_id, quantity)
    values
      (v_id,
       (c->>'item_id')::uuid,
       nullif(c->>'purchase_line_id', '')::uuid,
       nullif(c->>'production_batch_id', '')::uuid,
       (c->>'quantity')::numeric);
  end loop;

  return v_id;
end $$;

revoke all on function public.create_finished_product_batch(jsonb, jsonb) from public, anon;
grant execute on function public.create_finished_product_batch(jsonb, jsonb) to authenticated;

commit;
