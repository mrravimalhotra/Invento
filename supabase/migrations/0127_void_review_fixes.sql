-- 0127: fixes from the code review of 0126 (P6-01, void a packaging issue), 1 Nov 2026.
--
--  1. A QC record voided with its packaging issue keeps its own fields (an earlier rejection
--     void is no longer overwritten); the decision history gets a "voided_with_issue" row with
--     who, when and the reason.
--  2. Material returned to a purchase batch that QC has since rejected is booked straight back
--     out as QC rejected, so it never shows as usable stock.
--  3. stock_statement() counts each movement type in both directions, like item_position, so a
--     void reduces Packaging / Samples / Produced instead of appearing as Other in / Other out.
--  4. The packed count is reversed with the right sign for a legacy "unpack" issue.
--  5. The RM yield of a Production issue is reversed batch by batch for each batch's quantity.
--  6. The database refuses a new QC record on an inactive (voided) production batch.

begin;

alter table public.qc_decision_history drop constraint if exists qc_decision_history_event_check;
alter table public.qc_decision_history
  add constraint qc_decision_history_event_check
  check (event in ('round1_approved', 'round1_rejected', 'sent_back', 'round2_approved', 'round2_rejected',
                   'voided', 'voided_with_issue'));

create or replace function public.trg_fn_qc_decision_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_event text;
  v_reason text;
  v_results jsonb;
  v_edited boolean := false;
begin
  if old.status = 'submitted' and new.status = 'checker_approved' then
    v_event := 'round1_approved'; v_reason := new.checker_comments; v_results := new.checker_results;
  elsif old.status = 'submitted' and new.status = 'checker_rejected' then
    v_event := 'round1_rejected'; v_reason := new.checker_comments; v_results := new.checker_results;
  elsif old.status = 'checker_rejected' and new.status = 'submitted' then
    v_event := 'sent_back'; v_reason := new.returned_reason;
  elsif old.status in ('checker_approved', 'checker_rejected') and new.status = 'approved' then
    v_event := 'round2_approved'; v_reason := new.review_comments;
    v_results := coalesce(new.reviewer_results, new.checker_results); v_edited := new.reviewer_results is not null;
  elsif old.status in ('checker_approved', 'checker_rejected') and new.status = 'rejected' then
    v_event := 'round2_rejected'; v_reason := new.review_comments;
    v_results := coalesce(new.reviewer_results, new.checker_results); v_edited := new.reviewer_results is not null;
  elsif old.status = 'rejected' and new.status = 'submitted' then
    v_event := 'voided'; v_reason := new.void_reason;
  elsif new.status = 'voided' and old.status is distinct from 'voided' then
    -- 0127: voided with its packaging issue (P6-01); the reason comes from void_packaging_issue().
    v_event := 'voided_with_issue';
    v_reason := coalesce(nullif(current_setting('invento.void_note', true), ''), 'Voided with its packaging issue');
  else
    return new;
  end if;
  insert into public.qc_decision_history (quality_check_id, event, reason, results, results_edited, decided_by)
  values (new.id, v_event, btrim(v_reason), v_results, v_edited, auth.uid());
  return new;
end $$;

alter function public.trg_fn_qc_decision_history() set search_path = public;

create or replace function public.void_packaging_issue(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue public.packaging_issues%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_note text;
  v_pb record;
  v_rm_batch uuid;
  r record;
begin
  if not public.has_any_role('system_admin', 'inventory_manager') then
    raise exception 'Only an Inventory Manager or System Administrator can void a packaging issue.' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Give a reason of at least 3 characters.' using errcode = 'P0001';
  end if;

  select * into v_issue from public.packaging_issues where id = p_id for update;
  if not found then
    raise exception 'Packaging issue not found. Reload the page.' using errcode = 'P0001';
  end if;
  if v_issue.voided_at is not null then
    raise exception 'Packaging issue % is already void.', coalesce(v_issue.code, '') using errcode = 'P0001';
  end if;

  -- Production: the RM-FP batch it made must be unused.
  for v_pb in
    select pb.id, pb.batch_number from public.production_issue_batches pb
     where pb.packaging_issue_id = p_id order by pb.id for update
  loop
    if exists (select 1 from public.finished_product_components c where c.production_batch_id = v_pb.id)
       or exists (select 1 from public.inventory_ledger l
                   where l.production_batch_id = v_pb.id and (l.event_type = 'wastage' or l.reference_type = 'finished_product'))
       or exists (select 1 from public.coa_records cr join public.quality_checks q on q.id = cr.quality_check_id
                   where q.production_batch_id = v_pb.id) then
      raise exception 'Its RM-FP batch % has already been used. Nothing was changed.', v_pb.batch_number using errcode = 'P0001';
    end if;
    v_rm_batch := v_pb.id;
  end loop;

  v_note := left('Void of ' || coalesce(v_issue.code, 'packaging issue') || ': ' || v_reason, 500);

  -- One opposite row for every ledger row the issue (and its RM-FP batch) made.
  for r in
    select l.* from public.inventory_ledger l
     where (l.reference_id = p_id
            and l.reference_type in ('packaging', 'fp_packaging_pull', 'packaged_fp_yield', 'packaged_fp_issue', 'production_rm_yield'))
        or (l.production_batch_id is not null
            and l.production_batch_id in (select pb.id from public.production_issue_batches pb where pb.packaging_issue_id = p_id))
     order by (l.event_type = 'pull') desc, l.seq
  loop
    if r.reference_type = 'production_rm_yield' and r.production_batch_id is null then
      -- The RM yield row carries no batch: reverse it batch by batch, each for its own quantity.
      for v_pb in
        select pb.id, pb.quantity from public.production_issue_batches pb
         where pb.packaging_issue_id = p_id order by pb.id
      loop
        insert into public.inventory_ledger
          (event_type, item_id, production_batch_id, quantity, unit, department,
           reference_type, reference_id, event_by, reason)
        values ('pull', r.item_id, v_pb.id, v_pb.quantity, r.unit, r.department,
                r.reference_type, r.reference_id, auth.uid(), v_note);
      end loop;
      continue;
    end if;
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit, department,
       reference_type, reference_id, event_by, reason)
    values
      (case r.event_type when 'pull' then 'push' else 'pull' end,
       r.item_id, r.purchase_line_id, r.production_batch_id,
       r.quantity, r.unit, r.department, r.reference_type, r.reference_id, auth.uid(), v_note);
    if r.reference_type = 'packaging' and r.event_type = 'pull' and r.purchase_line_id is not null then
      update public.purchase_lines set live_remaining_qty = live_remaining_qty + r.quantity where id = r.purchase_line_id;
      -- Material returned to a batch QC has since rejected stays out of usable stock, the way
      -- a rejection moves it out (trg_fn_qc_rejected_stock).
      if (select q.status from public.quality_checks q where q.purchase_line_id = r.purchase_line_id
           order by q.created_at desc, q.id desc limit 1) = 'rejected' then
        insert into public.inventory_ledger
          (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by, reason)
        values ('pull', r.item_id, r.purchase_line_id, r.quantity, r.unit, 'qc_rejected', r.purchase_line_id, auth.uid(), v_note);
      end if;
    end if;
  end loop;

  -- Packed count on the finished product batch (Store and R&D issues add to it).
  if v_issue.department <> 'production' then
    update public.finished_product_batches
       set packaged_qty = packaged_qty
             - case v_issue.transaction_type when 'unpack' then -v_issue.unit_count else v_issue.unit_count end
     where id = v_issue.finished_product_batch_id;
  end if;

  -- The RM-FP batch leaves stock; its QC records are voided.
  if v_rm_batch is not null then
    update public.production_issue_batches
       set live_remaining_qty = 0, active = false
     where packaging_issue_id = p_id;
    -- The QC record keeps its own fields (an earlier rejection void stays as it was); the
    -- decision history records who voided it, when and why (event voided_with_issue).
    perform set_config('invento.voiding', 'on', true);
    perform set_config('invento.void_note', v_note, true);
    update public.quality_checks
       set status = 'voided'
     where production_batch_id in (select pb.id from public.production_issue_batches pb where pb.packaging_issue_id = p_id)
       and status <> 'voided';
    perform set_config('invento.voiding', '', true);
    perform set_config('invento.void_note', '', true);
  end if;

  update public.packaging_issues
     set active = false, voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
         voided_fp_qty = fp_qty_consumed, fp_qty_consumed = null
   where id = p_id;
end $$;

alter function public.void_packaging_issue(uuid, text) set search_path = public;

create or replace function public.stock_statement(p_from date, p_to date, p_category text default null)
returns table (
  item_id uuid,
  item_code text,
  item_name text,
  category text,
  unit text,
  opening numeric,
  purchased numeric,
  opening_load numeric,
  produced numeric,
  other_in numeric,
  used_in_production numeric,
  packaging numeric,
  samples numeric,
  wastage numeric,
  rejected numeric,
  other_out numeric,
  closing numeric
)
language plpgsql stable as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if p_from is null or p_to is null then
    raise exception 'Choose both a From and a To date.' using errcode = 'P0001';
  end if;
  if p_from > p_to then
    raise exception 'The From date cannot be after the To date.' using errcode = 'P0001';
  end if;
  if p_to > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The To date cannot be in the future.' using errcode = 'P0001';
  end if;
  if p_category is not null and p_category not in ('raw', 'processed', 'packaging', 'packaged_fp') then
    raise exception 'Unknown category.' using errcode = 'P0001';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';

  return query
  with m as (
    select l.item_id,
           sum(case when l.event_at < v_from then (case when l.event_type = 'push' then l.quantity else -l.quantity end) else 0 end) as opening,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and l.reference_type = 'purchase' and po.opening_load_id is null then l.quantity else 0 end) as purchased,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and l.reference_type = 'purchase' and po.opening_load_id is not null then l.quantity else 0 end) as opening_load,
           sum(case when l.event_at >= v_from and l.reference_type in ('fp_yield', 'packaged_fp_yield', 'production_rm_yield') then (case when l.event_type = 'push' then l.quantity else -l.quantity end) else 0 end) as produced,
           sum(case when l.event_at >= v_from and l.event_type = 'push' and coalesce(l.reference_type, '') not in ('purchase', 'fp_yield', 'packaged_fp_yield', 'production_rm_yield', 'qc_rejected', 'packaging', 'fp_packaging_pull', 'packaged_fp_issue', 'qc', 'qc_sample', 'stability_sample', 'rnd_sample') then l.quantity else 0 end) as other_in,
           sum(case when l.event_at >= v_from and l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity else 0 end) as used_in_production,
           sum(case when l.event_at >= v_from and l.reference_type in ('packaging', 'fp_packaging_pull', 'packaged_fp_issue') and l.event_type <> 'wastage' then (case when l.event_type = 'pull' then l.quantity else -l.quantity end) else 0 end) as packaging,
           sum(case when l.event_at >= v_from and l.reference_type in ('qc', 'qc_sample', 'stability_sample', 'rnd_sample') and l.event_type <> 'wastage' then (case when l.event_type = 'pull' then l.quantity else -l.quantity end) else 0 end) as samples,
           sum(case when l.event_at >= v_from and l.event_type = 'wastage' then l.quantity else 0 end) as wastage,
           sum(case when l.event_at >= v_from and l.reference_type = 'qc_rejected' then (case when l.event_type = 'pull' then l.quantity else -l.quantity end) else 0 end) as rejected,
           sum(case when l.event_at >= v_from and l.event_type = 'pull'
                     and coalesce(l.reference_type, '') not in ('finished_product', 'packaging', 'fp_packaging_pull', 'packaged_fp_issue', 'qc', 'qc_sample', 'stability_sample', 'rnd_sample', 'qc_rejected', 'fp_yield', 'packaged_fp_yield', 'production_rm_yield')
                    then l.quantity else 0 end) as other_out
      from public.inventory_ledger l
      left join public.purchase_lines pl on pl.id = l.purchase_line_id and l.event_type = 'push' and l.reference_type = 'purchase'
      left join public.purchase_orders po on po.id = pl.purchase_order_id
     where l.event_at < v_to
     group by l.item_id
  )
  select i.id, i.item_code, i.name, i.category, i.unit,
         m.opening, m.purchased, m.opening_load, m.produced, m.other_in,
         m.used_in_production, m.packaging, m.samples, m.wastage, m.rejected, m.other_out,
         m.opening + m.purchased + m.opening_load + m.produced + m.other_in
           - m.used_in_production - m.packaging - m.samples - m.wastage - m.rejected - m.other_out
    from m
    join public.items i on i.id = m.item_id
   where (p_category is null or i.category = p_category)
     and (m.opening <> 0 or m.purchased <> 0 or m.opening_load <> 0 or m.produced <> 0 or m.other_in <> 0
          or m.used_in_production <> 0 or m.packaging <> 0 or m.samples <> 0
          or m.wastage <> 0 or m.rejected <> 0 or m.other_out <> 0)
   order by i.item_code, i.id;
end $$;

alter function public.stock_statement(date, date, text) set search_path = public, extensions;

-- 6. No QC record on a production batch that has left stock.
create or replace function public.trg_fn_qc_production_batch_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.production_batch_id is not null
     and not exists (select 1 from public.production_issue_batches pb
                      where pb.id = new.production_batch_id and pb.active) then
    raise exception 'This RM-FP batch was voided with its packaging issue, so it takes no QC.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.trg_fn_qc_production_batch_active() from public, anon, authenticated;
drop trigger if exists trg_00_qc_production_batch_active on public.quality_checks;
create trigger trg_00_qc_production_batch_active
  before insert on public.quality_checks
  for each row execute function public.trg_fn_qc_production_batch_active();

do $$
begin
  if position('voided_with_issue' in pg_get_functiondef('public.trg_fn_qc_decision_history()'::regprocedure)) = 0 then
    raise exception '0127 self-check failed: decision history lacks voided_with_issue.';
  end if;
  if position('qc_rejected' in pg_get_functiondef('public.void_packaging_issue(uuid,text)'::regprocedure)) = 0 then
    raise exception '0127 self-check failed: void does not keep rejected material out.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('trg_fn_qc_decision_history', 'void_packaging_issue', 'stock_statement', 'trg_fn_qc_production_batch_active')
                and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')) then
    raise exception '0127 self-check failed: a function has no search_path.';
  end if;
end $$;

commit;
