-- ============================================================
-- Batch trace, forward and backward (Ravi, 10 Oct 2026: inventory reporting
-- recommendation 3 — "the report that matters most in a recall or inspection").
--
-- trace_batch(kind, id) walks the links the app already records and returns
-- one flat, ordered list (depth-first) of what a batch is made from and where
-- it went. Nothing is stored; nothing changes.
--
--   kind 'purchase'    a bought raw material or packaging material batch
--   kind 'fp'          a finished product batch
--   kind 'production'  a raw material batch made from a production issue
--
-- Backward (what it came from)
--   fp          its components: raw material batches (with vendor, PO, invoice,
--               QC status) and production raw material batches, which are
--               followed back through their packaging issue to the finished
--               product batch they were made from, and so on
--   production  the packaging issue and the finished product batch it was made from
--   purchase    its purchase order and vendor are the origin (shown on the row)
-- Forward (where it went)
--   purchase    finished product batches that used it (and onward), packaging
--               issues that used it (packaging material), samples held, wastage,
--               quantity moved to Rejected
--   fp          QC records, COA, samples held, every packaging issue (Store, R&D,
--               Production) with the packing material batches used and, for
--               Production issues, the raw material batches made and the
--               finished product batches that used them
--   production  finished product batches that used it
-- Depth is capped at 6 steps and a batch is never visited twice on one path.
-- Security invoker: the caller's own read rights apply.
-- ============================================================

begin;

drop type if exists public.trace_row cascade;
create type public.trace_row as (
  depth int,
  direction text,        -- root | backward | forward
  relation text,         -- what links this row to the one above it
  node_kind text,        -- purchase_batch | fp_batch | production_batch | packaging_issue | purchase_order | qc | coa | samples | wastage | rejected
  node_id uuid,
  item_id uuid,
  item_code text,
  item_name text,
  batch_label text,
  ref_code text,         -- PO / PKG / AR / COA number
  quantity numeric,
  unit text,
  remaining numeric,     -- still in the batch today (raw material batches)
  status text,
  ar_number text,
  event_at timestamptz,
  note text
);

-- ---------- one node, described the same way everywhere ----------
create or replace function public._trace_purchase_node(p_id uuid, p_depth int, p_dir text, p_rel text, p_qty numeric)
returns setof public.trace_row language sql stable as $$
  select p_depth, p_dir, p_rel, 'purchase_batch'::text, pl.id, pl.item_id, i.item_code, i.name,
         pl.batch_number, po.po_number, coalesce(p_qty, pl.quantity), pl.unit, pl.live_remaining_qty,
         s.qc_status, s.ar_number, pl.created_at,
         'Vendor: ' || coalesce(v.name, '—') || ' · Invoice ' || coalesce(po.invoice_number, '—')
    from public.purchase_lines pl
    join public.items i on i.id = pl.item_id
    join public.purchase_orders po on po.id = pl.purchase_order_id
    left join public.vendors v on v.id = po.vendor_id
    left join public.purchase_batch_status s on s.purchase_line_id = pl.id
   where pl.id = p_id
$$;

create or replace function public._trace_production_node(p_id uuid, p_depth int, p_dir text, p_rel text, p_qty numeric)
returns setof public.trace_row language sql stable as $$
  select p_depth, p_dir, p_rel, 'production_batch'::text, pb.id, pb.item_id, i.item_code, i.name,
         pb.batch_number, pi.code, coalesce(p_qty, pb.quantity), pb.unit, pb.live_remaining_qty,
         s.qc_status, s.ar_number, pb.created_at,
         'Made in packaging issue ' || pi.code
    from public.production_issue_batches pb
    join public.items i on i.id = pb.item_id
    join public.packaging_issues pi on pi.id = pb.packaging_issue_id
    left join public.production_batch_status s on s.production_batch_id = pb.id
   where pb.id = p_id
$$;

create or replace function public._trace_fp_node(p_id uuid, p_depth int, p_dir text, p_rel text, p_qty numeric)
returns setof public.trace_row language sql stable as $$
  select p_depth, p_dir, p_rel, 'fp_batch'::text, fpb.id, i.id, i.item_code, i.name,
         fpb.batch_number || coalesce(' (' || fpb.short_batch_no || ')', ''), null::text,
         coalesce(p_qty, fpb.batch_yield, fpb.target_qty), fpb.unit, null::numeric,
         fpb.status, q.ar_number, fpb.created_at,
         case when fpb.is_legacy then 'Opening stock (legacy)' end
    from public.finished_product_batches fpb
    join public.mfr_definitions md on md.id = fpb.mfr_definition_id
    left join public.items i on i.id = md.finished_product_item_id
    left join lateral (
      select x.ar_number from public.quality_checks x
       where x.finished_product_batch_id = fpb.id
       order by x.created_at desc, x.id desc limit 1
    ) q on true
   where fpb.id = p_id
$$;

create or replace function public._trace_issue_node(p_id uuid, p_depth int, p_dir text, p_rel text)
returns setof public.trace_row language sql stable as $$
  select p_depth, p_dir, p_rel, 'packaging_issue'::text, pi.id, null::uuid, null::text, null::text,
         pi.pack_size, pi.code, pi.unit_count, 'packs'::text, null::numeric,
         null::text, null::text, pi.created_at,
         initcap(pi.department) || ' · bulk used ' ||
           coalesce(trim_scale(pi.fp_qty_consumed)::text, '—') || ' ' || coalesce(fpb.unit, '')
    from public.packaging_issues pi
    join public.finished_product_batches fpb on fpb.id = pi.finished_product_batch_id
   where pi.id = p_id
$$;

-- ---------- backward ----------
create or replace function public._trace_back(p_kind text, p_id uuid, p_depth int, p_seen uuid[])
returns setof public.trace_row language plpgsql stable as $$
declare
  r record;
begin
  if p_depth > 6 or p_id = any(p_seen) then
    return;
  end if;

  if p_kind = 'fp' then
    for r in
      select c.purchase_line_id, c.production_batch_id, sum(c.quantity) as qty
        from public.finished_product_components c
       where c.finished_product_batch_id = p_id
       group by c.purchase_line_id, c.production_batch_id
       order by min(c.id::text)
    loop
      if r.purchase_line_id is not null then
        return query select * from public._trace_purchase_node(r.purchase_line_id, p_depth, 'backward', 'Raw material used', r.qty);
      else
        return query select * from public._trace_production_node(r.production_batch_id, p_depth, 'backward', 'Production raw material used', r.qty);
        return query select * from public._trace_back('production', r.production_batch_id, p_depth + 1, p_seen || p_id);
      end if;
    end loop;

  elsif p_kind = 'production' then
    for r in
      select pi.id as issue_id, pi.finished_product_batch_id as fp_id
        from public.production_issue_batches pb
        join public.packaging_issues pi on pi.id = pb.packaging_issue_id
       where pb.id = p_id
    loop
      return query select * from public._trace_issue_node(r.issue_id, p_depth, 'backward', 'Made in packaging issue');
      return query select * from public._trace_fp_node(r.fp_id, p_depth + 1, 'backward', 'Bulk finished product used', null);
      return query select * from public._trace_back('fp', r.fp_id, p_depth + 2, p_seen || p_id);
    end loop;
  end if;
  -- 'purchase': the purchase order and vendor are the origin, already on the row
end $$;

-- ---------- forward ----------
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
         where l.purchase_line_id = p_id and l.reference_type = 'packaging' and l.event_type = 'pull'
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

-- ---------- entry point ----------
create or replace function public.trace_batch(p_kind text, p_id uuid)
returns setof public.trace_row language plpgsql stable as $$
begin
  if p_kind not in ('purchase', 'fp', 'production') then
    raise exception 'Batch kind must be purchase, fp or production.' using errcode = 'P0001';
  end if;

  if p_kind = 'purchase' then
    return query select * from public._trace_purchase_node(p_id, 0, 'root', 'Batch', null);
  elsif p_kind = 'production' then
    return query select * from public._trace_production_node(p_id, 0, 'root', 'Batch', null);
  else
    return query select * from public._trace_fp_node(p_id, 0, 'root', 'Batch', null);
  end if;

  return query select * from public._trace_back(p_kind, p_id, 1, '{}'::uuid[]);
  return query select * from public._trace_fwd(p_kind, p_id, 1, '{}'::uuid[]);
end $$;

revoke all on function public.trace_batch(text, uuid) from public, anon;
grant execute on function public.trace_batch(text, uuid) to authenticated;
revoke all on function public._trace_back(text, uuid, int, uuid[]) from public, anon;
revoke all on function public._trace_fwd(text, uuid, int, uuid[]) from public, anon;
grant execute on function public._trace_back(text, uuid, int, uuid[]) to authenticated;
grant execute on function public._trace_fwd(text, uuid, int, uuid[]) to authenticated;
revoke all on function public._trace_purchase_node(uuid, int, text, text, numeric) from public, anon;
revoke all on function public._trace_production_node(uuid, int, text, text, numeric) from public, anon;
revoke all on function public._trace_fp_node(uuid, int, text, text, numeric) from public, anon;
revoke all on function public._trace_issue_node(uuid, int, text, text) from public, anon;
grant execute on function public._trace_purchase_node(uuid, int, text, text, numeric) to authenticated;
grant execute on function public._trace_production_node(uuid, int, text, text, numeric) to authenticated;
grant execute on function public._trace_fp_node(uuid, int, text, text, numeric) to authenticated;
grant execute on function public._trace_issue_node(uuid, int, text, text) to authenticated;

commit;
