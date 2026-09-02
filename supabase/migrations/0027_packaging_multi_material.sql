-- "In packaging allow selection of multiple packaging materials such as
-- bottles, caps etc. Each material can have a different unit/quantity."
-- (Ravi, 3 Sept 2026) — packaging_issues (0001_init.sql) modeled one issue
-- as exactly one packaging_item_id + packaging_qty_used, so a single "Pack"
-- event could never record e.g. bottles AND caps AND labels together; the
-- old flow needed a separate issue per material, with no shared context
-- tying them to the same packing run.
--
-- New child table, same header/lines shape already used for MFR recipe
-- lines and Finished Product composition (finished_product_components):
-- packaging_issues stays the one row per packing event (FP batch, pack
-- size, unit count, department, transaction type); packaging_issue_items
-- becomes one row per material actually used on that event, each with its
-- own quantity and unit.
create table public.packaging_issue_items (
  id uuid primary key default gen_random_uuid(),
  packaging_issue_id uuid not null references public.packaging_issues(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now()
);
alter table public.packaging_issue_items enable row level security;
create policy packaging_issue_items_select on public.packaging_issue_items for select using (public.is_signed_in());
-- Same write-role set as packaging_insert (packaging_issues) — a material
-- line is only ever created alongside its parent issue by the same action.
create policy packaging_issue_items_insert on public.packaging_issue_items for insert
  with check (public.has_any_role('system_admin','inventory_manager','mfr_manager'));

-- Backfill every existing packaging_issues row into the new shape as its
-- own one-material line, so history isn't lost. There was never a captured
-- unit for packaging_qty_used (trg_fn_packaging_pull's ledger insert below
-- didn't set one either — see the fix in that function) — the item's own
-- Item Master unit is the closest available truth and is used here as a
-- best-effort default; it does not change what was actually recorded, only
-- how it's now represented.
insert into public.packaging_issue_items (packaging_issue_id, item_id, quantity, unit, created_at)
select pi.id, pi.packaging_item_id, pi.packaging_qty_used, coalesce(it.unit, 'count'), pi.created_at
from public.packaging_issues pi
join public.items it on it.id = pi.packaging_item_id
where pi.packaging_item_id is not null and pi.packaging_qty_used is not null;

-- packaging_issues.packaging_item_id / packaging_qty_used are no longer
-- written by the app going forward (material lines live in the new table
-- instead) — dropped to nullable rather than dropped outright, so every
-- existing row keeps its original single-material value on file untouched.
-- packaging_qty_used_positive (0016_quantity_check_constraints.sql, "> 0")
-- needs no change: a CHECK constraint passes automatically on a null value.
alter table public.packaging_issues alter column packaging_item_id drop not null;
alter table public.packaging_issues alter column packaging_qty_used drop not null;

-- trg_fn_packaging_pull (0002_transactions.sql) used to do two things off
-- one packaging_issues row: pull packaging_item_id/packaging_qty_used from
-- stock, and bump finished_product_batches.packaged_qty. With material
-- lines now living in their own table (and there possibly being several
-- per issue), the stock pull moves to a new trigger on
-- packaging_issue_items — one pull per material line — while the
-- packaged_qty bump stays here, still exactly once per issue regardless of
-- how many materials it has.
create or replace function public.trg_fn_packaging_pull()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.finished_product_batches
    set packaged_qty = packaged_qty +
      case new.transaction_type when 'unpack' then -new.unit_count else new.unit_count end
    where id = new.finished_product_batch_id;
  return new;
end $$;
-- trg_packaging_pull (after insert on packaging_issues) already points at
-- this function by name — create or replace alone picks up the new body,
-- no trigger redefinition needed.

-- New trigger: one ledger 'pull' per packaging_issue_items row, using that
-- row's own item/quantity/unit. Also closes a pre-existing gap in the
-- function this replaces: the old ledger insert never set a `unit` at all
-- (packaging_issues had no unit column to read one from) — every packaging
-- pull's ledger row has always had unit = null. That's now fixed for every
-- new pull, since packaging_issue_items.unit is not null.
create or replace function public.trg_fn_packaging_item_pull()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_department text;
begin
  select department into v_department
  from public.packaging_issues
  where id = new.packaging_issue_id;

  insert into public.inventory_ledger
    (event_type, item_id, quantity, unit, department, reference_type, reference_id, event_by)
  values
    ('pull', new.item_id, new.quantity, new.unit, v_department, 'packaging', new.packaging_issue_id, auth.uid());
  return new;
end $$;
create trigger trg_packaging_item_pull
  after insert on public.packaging_issue_items
  for each row execute function public.trg_fn_packaging_item_pull();
