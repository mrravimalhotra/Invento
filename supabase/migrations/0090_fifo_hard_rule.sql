-- ============================================================
-- B16: oldest stock first (FIFO) is a HARD rule for finished-product batches
-- (Ravi, 30 Sept 2026: "Hard rule").
--
-- Before: the Compose screen picked batches oldest-first, but the database
-- accepted any batch, so a tampered request could consume a newer batch while
-- an older one was still in stock. (Packaging materials were already drawn
-- oldest-first in the database, since 0079.)
--
-- Now: a raw material can only be consumed from a batch if no OLDER batch of
-- the same item is still usable. "Usable" mirrors what the Compose screen
-- offers:
--   * purchase batch: active, purchase order submitted, QC-approved, retest
--     date not reached, quantity left;
--   * production-issued raw material batch: active, QC-approved, retest date
--     not reached, quantity left.
-- "Older" = received earlier (created_at), across both kinds of batch. Batches
-- received at exactly the same moment (bulk loads) are interchangeable.
-- A quarantined, rejected, retest-due, reopened or used-up older batch does not
-- block anything. There is no exception path.
--
-- Also: create_finished_product_batch now saves the components oldest batch
-- first, so a recipe that draws from several batches always satisfies the rule
-- in the order it is written. Consumption of one item is serialised with a
-- lock, so two people composing at once cannot both skip the older batch.
--
-- Not covered on purpose: wastage (a specific damaged batch is chosen) and QC
-- sample pulls (they come from the batch under test).
-- ============================================================

begin;

create or replace function public.trg_fn_fp_component_fifo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created timestamptz;
  v_batch   text;
  v_item    uuid;
  o         record;
  v_name    text;
begin
  if new.purchase_line_id is not null then
    select created_at, batch_number, item_id into v_created, v_batch, v_item
      from public.purchase_lines where id = new.purchase_line_id;
  elsif new.production_batch_id is not null then
    select created_at, batch_number, item_id into v_created, v_batch, v_item
      from public.production_issue_batches where id = new.production_batch_id;
  else
    return new;
  end if;
  if v_item is null or v_created is null then
    return new;
  end if;

  -- One item at a time: a second person composing the same item waits here,
  -- then sees the first person's draw.
  perform pg_advisory_xact_lock(hashtext('fifo-item'), hashtext(v_item::text));

  select x.batch_number, x.remaining, x.unit, x.created_at into o
  from (
    select pl.batch_number, pl.live_remaining_qty as remaining, pl.unit, pl.created_at
      from public.purchase_lines pl
      join public.purchase_batch_status s on s.purchase_line_id = pl.id
     where pl.item_id = v_item
       and pl.active
       and pl.pushed_at is not null
       and pl.live_remaining_qty > 0
       and pl.created_at < v_created
       and pl.id is distinct from new.purchase_line_id
       and s.qc_status = 'approved'
       and (s.retest_date is null or s.retest_date > current_date)
    union all
    select pb.batch_number, pb.live_remaining_qty, pb.unit, pb.created_at
      from public.production_issue_batches pb
      join public.production_batch_status s on s.production_batch_id = pb.id
     where pb.item_id = v_item
       and pb.active
       and pb.live_remaining_qty > 0
       and pb.created_at < v_created
       and pb.id is distinct from new.production_batch_id
       and s.qc_status = 'approved'
       and (s.retest_date is null or s.retest_date > current_date)
  ) x
  order by x.created_at, x.batch_number
  limit 1;

  if found then
    select coalesce(item_code || ' ' || name, name) into v_name from public.items where id = v_item;
    raise exception 'Oldest stock must be used first. Batch % of % (% % still available) is older than batch % and has to be used before it.',
      o.batch_number, v_name, o.remaining, o.unit, coalesce(v_batch, '?')
      using errcode = 'P0001';
  end if;

  return new;
end $$;

-- Named so it runs after the QC gate (trg_fp_component_qc_gate): an unapproved
-- batch is reported as "not QC-Approved" before anything about order.
drop trigger if exists trg_fp_component_z_fifo on public.finished_product_components;
create trigger trg_fp_component_z_fifo
  before insert on public.finished_product_components
  for each row execute function public.trg_fn_fp_component_fifo();

-- Components are saved oldest batch first (ties keep the order sent).
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

  for c in
    select e.value
      from jsonb_array_elements(p_components) with ordinality as e(value, n)
      left join public.purchase_lines pl on pl.id = nullif(e.value->>'purchase_line_id', '')::uuid
      left join public.production_issue_batches pb on pb.id = nullif(e.value->>'production_batch_id', '')::uuid
     order by coalesce(pl.created_at, pb.created_at) nulls last, e.n
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
