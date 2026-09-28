-- ============================================================
-- Code sequence overflow issue — closes out claude/known-issues.md's
-- Twenty-eighth pass (28 Sept 2026): lpad(input, N, '0') TRUNCATES input
-- down to N characters once it's already >= N chars, instead of skipping
-- padding — confirmed directly: lpad('100', 2, '0') returns '10', not
-- '100'. A generator built as '<PREFIX>-' || lpad(nextval(seq)::text, N,
-- '0') therefore doesn't error or widen once the sequence/count reaches
-- 10^N — it silently renders the same code text as an earlier, shorter
-- value already issued. Already fixed this way three times before
-- (0052 — RM/Purchase batch numbers, 0066 — FP batch numbers, 0067 —
-- packaging issue code, built safe from day one); this migration closes
-- it out for the remaining eleven generators (fifteen functions total,
-- since four of the eleven have a peek_next_*() preview twin that needs
-- the identical fix or the UI's "next code" preview could drift from
-- what actually gets assigned).
--
-- Correction to the count given in known-issues.md's own "New open item"
-- bullet: it says "Ten sequence-based code generators" but actually
-- lists eleven (get_next_feedback_ticket makes eleven, not ten) —
-- confirmed by recounting directly rather than trusting the prior
-- summary. All eleven are fixed here; known-issues.md's wording will be
-- corrected to match once this ships.
--
-- A second gap closed while double-checking for completeness, per Ravi's
-- explicit "make sure ... all scenarios are taken care of": known-
-- issues.md's own review also missed peek_next_vendor_code()
-- (0012_peek_next_codes.sql) — a fourth peek_next_*() preview twin,
-- alongside item/equipment/dead-stock, that nothing in the original pass
-- ever listed. Found by grepping every lpad( call across every migration
-- for its *live* (latest CREATE OR REPLACE) definition, not by trusting
-- the earlier catalog. It's included below.
--
-- Mitigating copy-paste risk across fifteen near-identical edits (Ravi's
-- explicit ask before this was written): the actual fix logic — pad to
-- *at least* N digits instead of *exactly* N — is written exactly ONCE,
-- in the small shared helper _pad_seq_code() below. Every one of the
-- fifteen functions calls it instead of repeating
-- `greatest(N, length(...))` inline fifteen times, so there is exactly
-- one place the real logic can be wrong. Two self-checks are built into
-- this migration itself and will FAIL THE WHOLE MIGRATION — it's wrapped
-- in one explicit transaction, so nothing partially applies — if either
-- the helper's own logic is wrong (self-check A) or if any one of the
-- fifteen functions was missed and left calling the old, unfixed
-- lpad(...) form (self-check B).
--
-- No schema change, no data touched, no app-code change — every one of
-- these functions keeps its exact existing signature and return type
-- (confirmed against each function's current, live definition before
-- writing this, not from memory), so this is a pure CREATE OR REPLACE
-- swap, same as 0052/0066/0067. Every value under a generator's current
-- digit width renders byte-for-byte identical to before (confirmed by
-- self-check A using the same proof values 0052 originally used); only
-- a value at or beyond the width changes, from truncated/colliding to
-- correct.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. The one place the actual fix logic lives.
-- ------------------------------------------------------------
create or replace function public._pad_seq_code(p_n text, p_width int)
returns text language sql immutable as $$
  select lpad(p_n, greatest(p_width, length(p_n)), '0');
$$;

-- Self-check A: the helper itself, against 0052's own original proof
-- values plus the two boundary cases (right at the width, just over it).
do $$
begin
  if public._pad_seq_code('7', 4) <> '0007' then
    raise exception '0069 self-check A failed: _pad_seq_code(''7'', 4) should be ''0007'', got %', public._pad_seq_code('7', 4);
  end if;
  if public._pad_seq_code('9999', 4) <> '9999' then
    raise exception '0069 self-check A failed: _pad_seq_code(''9999'', 4) should stay ''9999'', got %', public._pad_seq_code('9999', 4);
  end if;
  if public._pad_seq_code('10000', 4) <> '10000' then
    raise exception '0069 self-check A failed: _pad_seq_code(''10000'', 4) should widen to ''10000'' (not truncate), got %', public._pad_seq_code('10000', 4);
  end if;
  if public._pad_seq_code('100', 2) <> '100' then
    raise exception '0069 self-check A failed: _pad_seq_code(''100'', 2) should widen to ''100'' — 0052''s own original case, got %', public._pad_seq_code('100', 2);
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Vendor Master — V-#### (0001_init.sql), plus its non-consuming
--    preview twin peek_next_vendor_code() (0012_peek_next_codes.sql) —
--    the gap found while double-checking for completeness, see header.
-- ------------------------------------------------------------
create or replace function public.get_next_vendor_code()
returns text language sql as $$
  select 'V-' || public._pad_seq_code(nextval('public.vendor_code_seq')::text, 4);
$$;

create or replace function public.peek_next_vendor_code()
returns text language sql stable as $$
  select 'V-' || public._pad_seq_code(
    (case when is_called then last_value + 1 else last_value end)::text,
    4
  )
  from public.vendor_code_seq;
$$;

-- ------------------------------------------------------------
-- 3. Purchase Order — PO-#### (0001_init.sql) — Ravi's own "PO-99999" example
-- ------------------------------------------------------------
create or replace function public.get_next_po_number()
returns text language sql as $$
  select 'PO-' || public._pad_seq_code(nextval('public.po_number_seq')::text, 4);
$$;

-- ------------------------------------------------------------
-- 4. QC AR number — AR-###-DDMMYYYY (0001_init.sql)
-- ------------------------------------------------------------
create or replace function public.get_next_ar_number()
returns text language sql as $$
  select 'AR-' || public._pad_seq_code(nextval('public.ar_number_seq')::text, 3) || '-' || to_char(now(), 'DDMMYYYY');
$$;

-- ------------------------------------------------------------
-- 5. COA — COA-####-YYYY (0001_init.sql)
-- ------------------------------------------------------------
create or replace function public.get_next_coa_number()
returns text language sql as $$
  select 'COA-' || public._pad_seq_code(nextval('public.coa_number_seq')::text, 4) || '-' || to_char(now(), 'YYYY');
$$;

-- ------------------------------------------------------------
-- 6. MFR — MFR-#### (0042_mfr_code_prefix.sql; bug carried forward from
--    0001_init.sql's original 'F-' version, cosmetic rename only)
-- ------------------------------------------------------------
create or replace function public.get_next_mfr_code()
returns text language sql as $$
  select 'MFR-' || public._pad_seq_code(nextval('public.mfr_code_seq')::text, 4);
$$;

-- ------------------------------------------------------------
-- 7/8. Item Master — RM-/PKG-/FP-/PKG-FP-##### (0032_packaged_finished_
--      product.sql). get_next_item_code()'s four category branches all
--      share one lpad call site (only the sequence/prefix differ per
--      branch), so one fix covers all four — confirmed by reading the
--      live function before assuming otherwise. This is Ravi's
--      "PF-99999"-style example (real Finished Product prefix is FP-,
--      not PF-, but same risk).
-- ------------------------------------------------------------
create or replace function public.get_next_item_code(p_category text)
returns text language plpgsql as $$
declare v_num int; v_prefix text;
begin
  if p_category = 'packaging' then
    v_num := nextval('public.item_code_seq_pkg'); v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_num := nextval('public.item_code_seq_fp'); v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_num := nextval('public.item_code_seq_pkgfp'); v_prefix := 'PKG-FP';
  else
    v_num := nextval('public.item_code_seq_raw'); v_prefix := 'RM';
  end if;
  return v_prefix || '-' || public._pad_seq_code(v_num::text, 5);
end $$;

create or replace function public.peek_next_item_code(p_category text)
returns text language plpgsql stable as $$
declare
  v_num bigint;
  v_prefix text;
  v_seq regclass;
begin
  if p_category = 'packaging' then
    v_seq := 'public.item_code_seq_pkg'; v_prefix := 'PKG';
  elsif p_category = 'processed' then
    v_seq := 'public.item_code_seq_fp'; v_prefix := 'FP';
  elsif p_category = 'packaged_fp' then
    v_seq := 'public.item_code_seq_pkgfp'; v_prefix := 'PKG-FP';
  else
    v_seq := 'public.item_code_seq_raw'; v_prefix := 'RM';
  end if;

  execute format(
    'select case when is_called then last_value + 1 else last_value end from %s',
    v_seq
  ) into v_num;

  return v_prefix || '-' || public._pad_seq_code(v_num::text, 5);
end $$;

-- ------------------------------------------------------------
-- 9/10. Equipment Master — EQ-#### (0034_equipment_master.sql)
-- ------------------------------------------------------------
create or replace function public.get_next_equipment_code()
returns text language sql as $$
  select 'EQ-' || public._pad_seq_code(nextval('public.equipment_code_seq')::text, 4);
$$;

create or replace function public.peek_next_equipment_code()
returns text language sql stable as $$
  select 'EQ-' || public._pad_seq_code(
    (case when is_called then last_value + 1 else last_value end)::text,
    4
  )
  from public.equipment_code_seq;
$$;

-- ------------------------------------------------------------
-- 11/12. Dead Stock Register — DS-#### (0035_dead_stock_register.sql)
-- ------------------------------------------------------------
create or replace function public.get_next_dead_stock_code()
returns text language sql as $$
  select 'DS-' || public._pad_seq_code(nextval('public.dead_stock_code_seq')::text, 4);
$$;

create or replace function public.peek_next_dead_stock_code()
returns text language sql stable as $$
  select 'DS-' || public._pad_seq_code(
    (case when is_called then last_value + 1 else last_value end)::text,
    4
  )
  from public.dead_stock_code_seq;
$$;

-- ------------------------------------------------------------
-- 13. Production-sourced RM item code — RM-FP-##### (0050_production_
--     rm_from_packaging.sql). Note: this item still lands in items.
--     item_code, which is globally unique — a collision here fails loud
--     (23505), never silent.
-- ------------------------------------------------------------
create or replace function public.get_next_production_rm_item_code()
returns text language sql as $$
  select 'RM-FP-' || public._pad_seq_code(nextval('public.item_code_seq_rmfp')::text, 5);
$$;

-- ------------------------------------------------------------
-- 14. Production batch number — PROD-##/YY (0050_production_rm_from_
--     packaging.sql). count(*)+1 per item/year, not nextval() — narrower
--     blast radius than the others, same bug class, same fix. This is
--     the function behind FB-0043's own live PROD-02/26 batch.
-- ------------------------------------------------------------
create or replace function public.get_next_production_batch_number(p_item_id uuid)
returns text language plpgsql as $$
declare v_year text := to_char(now(), 'YY'); v_n int;
begin
  select count(*) + 1 into v_n from public.production_issue_batches
  where item_id = p_item_id and to_char(created_at, 'YY') = v_year;
  return 'PROD-' || public._pad_seq_code(v_n::text, 2) || '/' || v_year;
end $$;

-- ------------------------------------------------------------
-- 15. Tester Feedback ticket number — FB-#### (0005_feedback_ticket_
--     number.sql)
-- ------------------------------------------------------------
create or replace function public.get_next_feedback_ticket()
returns text language sql as $$
  select 'FB-' || public._pad_seq_code(nextval('public.feedback_ticket_seq')::text, 4);
$$;

-- ------------------------------------------------------------
-- Self-check B: confirm every one of the fifteen functions above
-- genuinely calls the new helper — catches a copy-paste omission (a
-- function accidentally left on the old, unfixed inline lpad(...) form)
-- without touching any real sequence or table, since pg_get_functiondef
-- just reads each function's stored definition text.
-- ------------------------------------------------------------
do $$
declare
  v_fns text[] := array[
    'public.get_next_vendor_code()',
    'public.peek_next_vendor_code()',
    'public.get_next_po_number()',
    'public.get_next_ar_number()',
    'public.get_next_coa_number()',
    'public.get_next_mfr_code()',
    'public.get_next_item_code(text)',
    'public.peek_next_item_code(text)',
    'public.get_next_equipment_code()',
    'public.peek_next_equipment_code()',
    'public.get_next_dead_stock_code()',
    'public.peek_next_dead_stock_code()',
    'public.get_next_production_rm_item_code()',
    'public.get_next_production_batch_number(uuid)',
    'public.get_next_feedback_ticket()'
  ];
  v_fn text;
  v_src text;
begin
  foreach v_fn in array v_fns loop
    select pg_get_functiondef(v_fn::regprocedure) into v_src;
    if v_src not like '%_pad_seq_code%' then
      raise exception '0069 self-check B failed: % does not call _pad_seq_code() — the overflow fix was not applied to this function.', v_fn;
    end if;
  end loop;
end $$;

commit;
