-- 0126: P6-01, void a packaging issue (Ravi, decided 18 Oct 2026; mockup approved 1 Nov 2026).
--
-- An Inventory Manager or System Admin voids a packaging issue with a reason, at any time.
-- Nothing is deleted: every ledger row the issue made gets an opposite row (same item, batch,
-- unit, department and reference type; reason "Void of PKG-…: …"), batch balances go back,
-- and the issue stays on the list marked Void. A Production issue can be voided only while its
-- RM-FP batch is unused (not in any finished product batch, not written off, no COA); its RM-FP
-- batch then leaves stock and its QC records are marked "voided".
--
-- How sums skip a voided issue: its fp_qty_consumed (bulk used) moves to voided_fp_qty, so every
-- existing sum of bulk used (fp_bulk_left, fp_batch_packing_options, batch_ageing, Stock Integrity
-- S7, the batch page) leaves it out without being rewritten. active = false hides it from Batch
-- Trace. item_position now counts each movement type in both directions, so Stock Position and
-- Stock Integrity S1 stay balanced after the opposite rows.

begin;

alter table public.packaging_issues
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text,
  add column if not exists voided_fp_qty numeric;

alter table public.quality_checks drop constraint if exists quality_checks_status_check;
alter table public.quality_checks
  add constraint quality_checks_status_check
  check (status in ('submitted', 'checker_approved', 'checker_rejected', 'approved', 'rejected', 'voided'));

create or replace function public.trg_fn_qc_enforce_review_stages()
returns trigger language plpgsql as $$
declare
  v_is_admin boolean := public.has_any_role('system_admin');
  v_needs_results boolean := (new.purchase_line_id is not null or new.finished_product_batch_id is not null);
  v_line_wastage boolean;
begin
  -- 0126 (P6-01): a QC record of an RM-FP batch becomes "voided" only through
  -- void_packaging_issue(), which sets invento.voiding for its own transaction.
  -- A voided record never changes again.
  if old.status = 'voided' then
    raise exception 'This QC record was voided with its packaging issue and cannot change.';
  end if;
  if new.status = 'voided' then
    if coalesce(current_setting('invento.voiding', true), '') <> 'on' then
      raise exception 'A QC record can only be voided together with its packaging issue.';
    end if;
    return new;
  end if;

  -- Results can only be saved together with a decision.
  if new.status = old.status then
    if new.checker_results is distinct from old.checker_results
       or new.reviewer_results is distinct from old.reviewer_results then
      raise exception 'Test results can only be saved together with a QC decision.';
    end if;
    return new;
  end if;

  -- Round 1: Awaiting QC -> Approved by checker / Rejection proposed.
  if old.status = 'submitted' and new.status in ('checker_approved', 'checker_rejected') then
    if not public.has_any_role('system_admin', 'quality_checker') then
      raise exception 'Only a Quality Checker (or System Admin) can make the first QC decision.';
    end if;
    if length(btrim(coalesce(new.checker_comments, ''))) < 3 then
      raise exception 'A reason is required for the first QC decision.';
    end if;
    if new.status = 'checker_approved' and v_needs_results
       and not public._qc_results_valid(new.checker_results, true) then
      raise exception 'Enter the result of every test on the COA template before approving.';
    end if;
    if new.status = 'checker_rejected' and new.checker_results is not null
       and not public._qc_results_valid(new.checker_results, false) then
      raise exception 'The test results could not be read.';
    end if;
    if new.reviewer_results is not null then
      raise exception 'Only the QC Reviewer can edit the results.';
    end if;
    return new;
  end if;

  -- Round 2: a QC Reviewer, a different person from the Quality Checker (System Admin exempt).
  if old.status in ('checker_approved', 'checker_rejected') and new.status in ('approved', 'rejected', 'submitted') then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer (or System Admin) can make the final QC decision.';
    end if;
    if new.checker_by is not null and auth.uid() = new.checker_by and not v_is_admin then
      raise exception 'The QC Reviewer who makes the final decision must be a different person from the Quality Checker who made the first one.';
    end if;

    if new.status = 'submitted' then
      -- Send back: only a proposed rejection can be sent back.
      if old.status <> 'checker_rejected' then
        raise exception 'Only a proposed rejection can be sent back to the Quality Checker.';
      end if;
      if length(btrim(coalesce(new.returned_reason, ''))) < 3 then
        raise exception 'A reason is required to send a proposed rejection back.';
      end if;
      -- The record starts again at Round 1; what was recorded stays in the decision history.
      new.checker_by := null; new.checker_at := null; new.checker_comments := null;
      new.checker_results := null; new.reviewer_results := null;
      return new;
    end if;

    if old.status = 'checker_rejected' and new.status = 'approved' then
      raise exception 'A proposed rejection cannot be approved. Confirm the rejection, or send it back to the Quality Checker.';
    end if;
    if length(btrim(coalesce(new.review_comments, ''))) < 3 then
      raise exception 'A reason is required for the final QC decision.';
    end if;
    if new.reviewer_results is not null then
      if old.checker_results is null then
        raise exception 'This record has no first-round results to edit.';
      end if;
      if not public._qc_results_valid(new.reviewer_results, new.status = 'approved') then
        raise exception 'Enter the result of every test before approving.';
      end if;
      if jsonb_array_length(new.reviewer_results) <> jsonb_array_length(old.checker_results) then
        raise exception 'The edited results must list the same tests as the first round.';
      end if;
    end if;
    return new;
  end if;

  -- Void: a final rejection returns to Awaiting QC.
  if old.status = 'rejected' and new.status = 'submitted' then
    if not public.has_any_role('system_admin', 'qc_reviewer') then
      raise exception 'Only a QC Reviewer or System Admin can void a rejection.';
    end if;
    if length(btrim(coalesce(new.void_reason, ''))) < 3 then
      raise exception 'A written reason is required to void a rejection.';
    end if;
    select exists (
      select 1 from public.inventory_ledger l
       where l.event_type = 'wastage'
         and ((new.purchase_line_id is not null and l.purchase_line_id = new.purchase_line_id)
           or (new.production_batch_id is not null and l.production_batch_id = new.production_batch_id))
    ) into v_line_wastage;
    if v_line_wastage then
      raise exception 'Wastage has already been written off against this batch, so its rejection cannot be voided.';
    end if;
    new.voided_by := auth.uid();
    new.voided_at := now();
    new.checker_by := null; new.checker_at := null; new.checker_comments := null;
    new.checker_results := null; new.reviewer_results := null;
    new.reviewed_by := null; new.reviewed_at := null; new.review_comments := null;
    new.expiry_date := null; new.retest_period_days := null; new.retest_date := null;
    return new;
  end if;

  raise exception 'A QC record cannot move from "%" to "%".', old.status, new.status;
end $$;


create or replace function public._trace_fwd(p_kind text, p_id uuid, p_depth int, p_seen uuid[])
returns setof public.trace_row language plpgsql stable as $$
declare
  r record;
  m record;
  v_n numeric;
begin
  if p_depth > 6 or p_id = any(p_seen) then
    return;
  end if;

  if p_kind in ('purchase', 'production') then
    -- finished product batches that used this raw material batch
    for r in
      select c.finished_product_batch_id as fp_id, sum(c.quantity) as qty
        from public.finished_product_components c
       where (p_kind = 'purchase' and c.purchase_line_id = p_id)
          or (p_kind = 'production' and c.production_batch_id = p_id)
       group by c.finished_product_batch_id
       order by c.finished_product_batch_id
    loop
      return query select * from public._trace_fp_node(r.fp_id, p_depth, 'forward', 'Used in finished product batch', r.qty);
      return query select * from public._trace_fwd('fp', r.fp_id, p_depth + 1, p_seen || p_id);
    end loop;

    if p_kind = 'purchase' then
      -- packaging material: the packaging issues that used it
      for r in
        select l.reference_id as issue_id, pi.finished_product_batch_id as fp_id
          from public.inventory_ledger l
          join public.packaging_issues pi on pi.id = l.reference_id
         where l.purchase_line_id = p_id and l.reference_type = 'packaging' and l.event_type = 'pull' and pi.active
         group by l.reference_id, pi.finished_product_batch_id
         order by l.reference_id
      loop
        return query select * from public._trace_issue_node(r.issue_id, p_depth, 'forward', 'Used in packaging issue');
        return query select * from public._trace_fp_node(r.fp_id, p_depth + 1, 'forward', 'Packed finished product batch', null);
      end loop;

      -- samples, wastage, rejected
      select pl.qc_qty, pl.stability_qty, pl.rnd_qty, pl.unit into m from public.purchase_lines pl where pl.id = p_id;
      if coalesce(m.qc_qty, 0) + coalesce(m.stability_qty, 0) + coalesce(m.rnd_qty, 0) > 0 then
        return next row(p_depth, 'forward', 'Samples held', 'samples', null, null, null, null, null, null,
                        coalesce(m.qc_qty, 0) + coalesce(m.stability_qty, 0) + coalesce(m.rnd_qty, 0), m.unit, null, null, null, null,
                        'QC ' || trim_scale(coalesce(m.qc_qty, 0)) || ' · Stability ' || trim_scale(coalesce(m.stability_qty, 0)) || ' · R&D ' || trim_scale(coalesce(m.rnd_qty, 0)))::public.trace_row;
      end if;
      select coalesce(sum(l.quantity), 0) into v_n from public.inventory_ledger l
       where l.purchase_line_id = p_id and l.event_type = 'wastage';
      if v_n > 0 then
        return next row(p_depth, 'forward', 'Written off as wastage', 'wastage', null, null, null, null, null, null,
                        v_n, m.unit, null, null, null, null, null)::public.trace_row;
      end if;
      select coalesce(sum(case l.event_type when 'pull' then l.quantity else -l.quantity end), 0) into v_n
        from public.inventory_ledger l where l.purchase_line_id = p_id and l.reference_type = 'qc_rejected';
      if v_n > 0 then
        return next row(p_depth, 'forward', 'Rejected by QC (out of stock)', 'rejected', null, null, null, null, null, null,
                        v_n, m.unit, null, null, null, null, null)::public.trace_row;
      end if;
    end if;

  elsif p_kind = 'fp' then
    -- QC records and certificates
    for r in
      select q.id, q.ar_number, q.status, coalesce(q.reviewed_at, q.created_at) as at, q.is_retest
        from public.quality_checks q
       where q.finished_product_batch_id = p_id
       order by q.created_at, q.id
    loop
      return next row(p_depth, 'forward', case when r.is_retest then 'QC retest' else 'QC record' end, 'qc', r.id, null, null, null,
                      null, r.ar_number, null, null, null, r.status, r.ar_number, r.at, null)::public.trace_row;
      for m in select c.id, c.coa_number, c.issued_at from public.coa_records c where c.quality_check_id = r.id order by c.issued_at loop
        return next row(p_depth + 1, 'forward', 'COA issued', 'coa', m.id, null, null, null,
                        null, m.coa_number, null, null, null, null, null, m.issued_at, null)::public.trace_row;
      end loop;
    end loop;

    select fpb.qc_sample_qty, fpb.stability_qty, fpb.rnd_qty, fpb.unit into m from public.finished_product_batches fpb where fpb.id = p_id;
    if coalesce(m.qc_sample_qty, 0) + coalesce(m.stability_qty, 0) + coalesce(m.rnd_qty, 0) > 0 then
      return next row(p_depth, 'forward', 'Samples held', 'samples', null, null, null, null, null, null,
                      coalesce(m.qc_sample_qty, 0) + coalesce(m.stability_qty, 0) + coalesce(m.rnd_qty, 0), m.unit, null, null, null, null,
                      'QC ' || trim_scale(coalesce(m.qc_sample_qty, 0)) || ' · Stability ' || trim_scale(coalesce(m.stability_qty, 0)) || ' · R&D ' || trim_scale(coalesce(m.rnd_qty, 0)))::public.trace_row;
    end if;

    -- packaging issues (Store, R&D, Production) and what went into them
    for r in
      select pi.id from public.packaging_issues pi
       where pi.finished_product_batch_id = p_id and pi.active
       order by pi.created_at, pi.id
    loop
      return query select * from public._trace_issue_node(r.id, p_depth, 'forward', 'Packed');
      for m in
        select l.purchase_line_id, sum(l.quantity) as qty
          from public.inventory_ledger l
         where l.reference_type = 'packaging' and l.reference_id = r.id and l.event_type = 'pull' and l.purchase_line_id is not null
         group by l.purchase_line_id
         order by l.purchase_line_id
      loop
        return query select * from public._trace_purchase_node(m.purchase_line_id, p_depth + 1, 'forward', 'Packing material used', m.qty);
      end loop;
      for m in
        select pb.id from public.production_issue_batches pb where pb.packaging_issue_id = r.id order by pb.created_at, pb.id
      loop
        return query select * from public._trace_production_node(m.id, p_depth + 1, 'forward', 'Became production raw material', null);
        return query select * from public._trace_fwd('production', m.id, p_depth + 2, p_seen || p_id);
      end loop;
    end loop;
  end if;
end $$;


create or replace view public.item_position as
select
  i.id as item_id,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'purchase' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'purchase' then -l.quantity
                    else 0 end), 0) as received,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'fp_yield' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'fp_yield' then -l.quantity else 0 end), 0) as yielded,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type in ('qc', 'qc_sample') then l.quantity
                    when l.event_type = 'push' and l.reference_type in ('qc', 'qc_sample') then -l.quantity
                    else 0 end), 0) as held_qc,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'stability_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'stability_sample' then -l.quantity
                    else 0 end), 0) as held_stability,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'rnd_sample' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'rnd_sample' then -l.quantity
                    else 0 end), 0) as held_rnd,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'finished_product' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'fp_draft_cancelled' then -l.quantity
                    else 0 end), 0) as consumed_by_fp,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaging' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'packaging' then -l.quantity else 0 end), 0) as issued_packaging,
  coalesce(sum(case when l.event_type = 'wastage' then l.quantity else 0 end), 0) as wastage,
  coalesce(sum(case l.event_type when 'push' then l.quantity when 'wastage' then -l.quantity else -l.quantity end), 0) as on_hand,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'fp_packaging_pull' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'fp_packaging_pull' then -l.quantity else 0 end), 0) as consumed_by_packaging,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'packaged_fp_yield' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'packaged_fp_yield' then -l.quantity else 0 end), 0) as packaged_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'packaged_fp_issue' and l.department = 'store' then -l.quantity else 0 end), 0) as issued_store,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'packaged_fp_issue' and l.department = 'rnd' then -l.quantity else 0 end), 0) as issued_rnd,
  coalesce(sum(case when l.event_type = 'push' and l.reference_type = 'production_rm_yield' then l.quantity
                    when l.event_type = 'pull' and l.reference_type = 'production_rm_yield' then -l.quantity else 0 end), 0) as production_rm_yield,
  coalesce(sum(case when l.event_type = 'pull' and l.reference_type = 'qc_rejected' then l.quantity
                    when l.event_type = 'push' and l.reference_type = 'qc_rejected' then -l.quantity
                    else 0 end), 0) as rejected
from public.items i
left join public.inventory_ledger l on l.item_id = i.id
group by i.id;


-- Recreating the view resets its options: keep it a security-invoker view (RLS of the caller).
alter view public.item_position set (security_invoker = on);

-- 0124 gave every function a fixed search_path; create or replace drops it, so set it again.
alter function public.trg_fn_qc_enforce_review_stages() set search_path = public, extensions;
alter function public._trace_fwd(text, uuid, int, uuid[]) set search_path = public, extensions;

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
    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, production_batch_id, quantity, unit, department,
       reference_type, reference_id, event_by, reason)
    values
      (case r.event_type when 'pull' then 'push' else 'pull' end,
       r.item_id, r.purchase_line_id,
       coalesce(r.production_batch_id, case when r.reference_type = 'production_rm_yield' then v_rm_batch end),
       r.quantity, r.unit, r.department, r.reference_type, r.reference_id, auth.uid(), v_note);
    if r.reference_type = 'packaging' and r.event_type = 'pull' and r.purchase_line_id is not null then
      update public.purchase_lines set live_remaining_qty = live_remaining_qty + r.quantity where id = r.purchase_line_id;
    end if;
  end loop;

  -- Packed count on the finished product batch (Store and R&D issues add to it).
  if v_issue.department <> 'production' then
    update public.finished_product_batches
       set packaged_qty = packaged_qty - v_issue.unit_count
     where id = v_issue.finished_product_batch_id;
  end if;

  -- The RM-FP batch leaves stock; its QC records are voided.
  if v_rm_batch is not null then
    update public.production_issue_batches
       set live_remaining_qty = 0, active = false
     where packaging_issue_id = p_id;
    perform set_config('invento.voiding', 'on', true);
    update public.quality_checks
       set status = 'voided', void_reason = v_note
     where production_batch_id in (select pb.id from public.production_issue_batches pb where pb.packaging_issue_id = p_id)
       and status <> 'voided';
    perform set_config('invento.voiding', '', true);
  end if;

  update public.packaging_issues
     set active = false, voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
         voided_fp_qty = fp_qty_consumed, fp_qty_consumed = null
   where id = p_id;
end $$;

revoke all on function public.void_packaging_issue(uuid, text) from public, anon;
grant execute on function public.void_packaging_issue(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'packaging_issues' and column_name = 'voided_fp_qty') then
    raise exception '0126 self-check failed: packaging_issues.voided_fp_qty missing.';
  end if;
  if position('invento.voiding' in pg_get_functiondef('public.trg_fn_qc_enforce_review_stages()'::regprocedure)) = 0 then
    raise exception '0126 self-check failed: QC stage guard lacks the void branch.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('trg_fn_qc_enforce_review_stages', '_trace_fwd', 'void_packaging_issue')
                and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')) then
    raise exception '0126 self-check failed: a redefined function has no search_path.';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'item_position'
                    and 'security_invoker=on' = any(coalesce(c.reloptions, '{}'))) then
    raise exception '0126 self-check failed: item_position is not security_invoker.';
  end if;
  if position('pi.active' in pg_get_functiondef('public._trace_fwd(text,uuid,integer,uuid[])'::regprocedure)) = 0 then
    raise exception '0126 self-check failed: batch trace does not skip voided issues.';
  end if;
end $$;

commit;
