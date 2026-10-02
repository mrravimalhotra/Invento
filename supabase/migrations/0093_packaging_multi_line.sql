-- ============================================================
-- FB-0052 (1 Oct 2026, Namrata Gaikwad): one Packaging issue should be able to carry
-- several lines — e.g. 200 ml x 50 and 1 ltr x 8 packed from the same Finished Product
-- batch on the same day — instead of one save per pack size.
--
-- create_packaging_issues(p_header, p_lines) saves up to 30 lines for Store or R&D in ONE
-- database transaction (all or nothing). Each line becomes its own packaging_issues row
-- with its own PKG-#### code, exactly as a single issue is saved today (it calls
-- create_packaging_issue() per line), so the Packaging list, reports, stock movements,
-- FIFO and the per-batch yield rule (ACC-19) are unchanged. Because the lines are saved
-- one after another in the same transaction, two lines drawing on the same batch are
-- checked against the batch TOGETHER — the second line sees what the first one used.
--
-- p_header: {"issue_date": "YYYY-MM-DD", "department": "store"|"rnd"}   (shared by all lines)
-- p_lines : [{"finished_product_batch_id", "pack_size", "pack_size_qty", "pack_size_unit",
--             "fp_qty_consumed", "unit_count", "materials": [{"item_id","quantity","unit"}]}, ...]
-- Returns the codes created, in line order. Production issues keep the existing single
-- create_packaging_issue() path (decided with Ravi, 2 Oct 2026; revisited later).
-- A failure is reported as "Line N: <reason>".
-- ============================================================

begin;

create or replace function public.create_packaging_issues(p_header jsonb, p_lines jsonb)
returns text[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dept  text := p_header->>'department';
  v_date  text := nullif(p_header->>'issue_date', '');
  v_n     int;
  v_i     int := 0;
  v_line  jsonb;
  v_codes text[] := '{}';
  v_code  text;
begin
  if v_dept is null or v_dept not in ('store', 'rnd') then
    raise exception 'Several lines can only be saved for Store or R&D.' using errcode = '22023';
  end if;
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
    begin
      v_code := public.get_next_packaging_issue_code();
      perform public.create_packaging_issue(
        jsonb_build_object(
          'code', v_code,
          'finished_product_batch_id', v_line->>'finished_product_batch_id',
          'pack_size', v_line->>'pack_size',
          'pack_size_qty', v_line->>'pack_size_qty',
          'pack_size_unit', v_line->>'pack_size_unit',
          'fp_qty_consumed', v_line->>'fp_qty_consumed',
          'unit_count', v_line->>'unit_count',
          'department', v_dept,
          'issue_date', v_date),
        coalesce(v_line->'materials', '[]'::jsonb));
      v_codes := v_codes || v_code;
    exception when others then
      -- Name the line, keep the original error class so the app still shows the message.
      raise exception 'Line %: %', v_i, sqlerrm using errcode = sqlstate;
    end;
  end loop;

  return v_codes;
end $$;

revoke all on function public.create_packaging_issues(jsonb, jsonb) from public, anon;
grant execute on function public.create_packaging_issues(jsonb, jsonb) to authenticated;

do $$
begin
  if position('Several lines can only be saved' in pg_get_functiondef('public.create_packaging_issues(jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '0093 self-check failed: create_packaging_issues missing or incomplete.';
  end if;
end $$;

commit;
