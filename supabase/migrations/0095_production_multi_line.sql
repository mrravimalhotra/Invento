-- ============================================================
-- FB-0052 (Production, 2 Oct 2026, Ravi): the Production issue, like Store and R&D (0093),
-- can carry several lines in one save — each line its own Finished Product batch, quantity
-- to convert and QC / Stability / R&D samples.
--
-- create_production_issues(p_header, p_lines) saves up to 30 lines in ONE transaction (all or
-- nothing). Each line becomes its own packaging_issues row (own PKG-#### code) and, through the
-- existing triggers, its own Raw Material (RM-FP) batch with its own QC cycle — exactly as a
-- single Production issue does today (it calls create_packaging_issue() per line, no
-- packaging materials). Stock rules (per-batch yield, product stock) are unchanged.
--
-- New rule (Ravi): a Finished Product batch may appear on ONE line only per issue:
--   "Line 2: Batch FP-... · Name is already on line 1. A batch can be issued to Production
--    only once per issue."
-- R&D quantity is optional (empty = 0); the app sends 0.
--
-- p_header: {"issue_date": "YYYY-MM-DD"}
-- p_lines : [{"finished_product_batch_id", "pack_size", "fp_qty_consumed", "unit_count",
--             "qc_qty", "stability_qty", "rnd_qty"}, ...]
-- Returns the codes created, in line order. Errors read "Line N: <reason>".
-- ============================================================

begin;

create or replace function public.create_production_issues(p_header jsonb, p_lines jsonb)
returns text[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_date  text := nullif(p_header->>'issue_date', '');
  v_n     int;
  v_i     int := 0;
  v_j     int;
  v_line  jsonb;
  v_codes text[] := '{}';
  v_code  text;
  v_ids   text[] := '{}';
  v_label text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_lines);
  if v_n < 1 then
    raise exception 'Add at least one line.' using errcode = '22023';
  end if;
  if v_n > 30 then
    raise exception 'A packaging issue can have at most 30 lines (you have %).', v_n using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_i := v_i + 1;

    -- One batch, one line.
    v_j := array_position(v_ids, v_line->>'finished_product_batch_id');
    if v_j is not null then
      select fpb.batch_number || coalesce(' · ' || it.name, '')
        into v_label
        from public.finished_product_batches fpb
        left join public.mfr_definitions md on md.id = fpb.mfr_definition_id
        left join public.items it on it.id = md.finished_product_item_id
       where fpb.id = (v_line->>'finished_product_batch_id')::uuid;
      raise exception 'Line %: Batch % is already on line %. A batch can be issued to Production only once per issue.',
        v_i, coalesce(v_label, 'this batch'), v_j using errcode = '22023';
    end if;
    v_ids := v_ids || (v_line->>'finished_product_batch_id');

    begin
      v_code := public.get_next_packaging_issue_code();
      perform public.create_packaging_issue(
        jsonb_build_object(
          'code', v_code,
          'finished_product_batch_id', v_line->>'finished_product_batch_id',
          'pack_size', v_line->>'pack_size',
          'fp_qty_consumed', v_line->>'fp_qty_consumed',
          'unit_count', v_line->>'unit_count',
          'department', 'production',
          'issue_date', v_date,
          'qc_qty', v_line->>'qc_qty',
          'stability_qty', v_line->>'stability_qty',
          'rnd_qty', coalesce(nullif(v_line->>'rnd_qty', ''), '0')),
        '[]'::jsonb);
      v_codes := v_codes || v_code;
    exception when others then
      raise exception 'Line %: %', v_i, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return v_codes;
end $$;

revoke all on function public.create_production_issues(jsonb, jsonb) from public, anon;
grant execute on function public.create_production_issues(jsonb, jsonb) to authenticated;

do $$
begin
  if position('only once per issue' in pg_get_functiondef('public.create_production_issues(jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '0095 self-check failed: create_production_issues missing or incomplete.';
  end if;
end $$;

commit;
