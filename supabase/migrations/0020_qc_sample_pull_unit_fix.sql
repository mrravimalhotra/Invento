-- ============================================================
-- Bugfix (2 Sept 2026) — QC sample pull wrote inventory_ledger in the
-- SAMPLE unit, not the item's own unit, silently corrupting stock_balance.
--
-- Found live by Ravi: Jatamansi (RM-00002) showed -32.75 kg on hand
-- ("stock should never go negative"). Root cause traced to
-- trg_fn_qc_sample_pull() (0002_transactions.sql, part B): it inserts
-- new.sample_qty / new.sample_unit into inventory_ledger verbatim, with NO
-- conversion into the item's own tracked unit. stock_balance
-- (0001_init.sql) is a plain `sum(quantity)` over inventory_ledger — it
-- has no idea what `unit` means, it just adds/subtracts the raw number.
-- Every OTHER event-writing trigger already only ever writes in the
-- item's/line's own unit (push: purchase_lines.unit; FP/packaging pulls:
-- the consuming table's own quantity, already in that unit) — QC sample
-- pull was the one place this could drift, and it only actually bit today
-- because FB-0018/0019/0020/0021's QC sample-unit auto-populate
-- (qc-assign-form.tsx) made picking a genuinely different, smaller sample
-- unit than the line's own unit the normal case rather than a rare one.
--
-- The immediate trigger for today's -32.75: one QC record was saved with
-- sample_qty=50, sample_unit='gm' — 'gm' is not a canonical unit
-- (lib/constants/units.ts only knows 'g'; 'gm' is a common free-text
-- variant a person would naturally type). The Sample unit field on
-- qc-assign-form.tsx has always been a free-text <Input>, not a <Select>
-- restricted to a known unit — that gap is fixed in the same app deploy as
-- this migration (Sample unit is now a <Select> over compatibleUnits(),
-- same pattern Purchase's own Sample unit field already used per FB-0017).
-- This migration is the DB-side half: even with the UI fixed, the trigger
-- itself should never again be able to write a ledger row in anything but
-- the item's own tracked unit — belt and suspenders, matching how every
-- other ledger-writing trigger already behaves.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SQL-side unit conversion, mirroring lib/constants/units.ts exactly
--    (weight family mg/g/kg, volume family ml/ltr; every other unit is its
--    own one-member family — count/bottle/pack can only convert to
--    themselves). Returns null when the two units aren't in the same
--    family, exactly like the TS convertUnit() contract, so callers can
--    detect and handle an incompatible pair rather than getting a wrong
--    number silently. from = to always short-circuits to the input value
--    unchanged, even for a unit string outside the two known families —
--    this matters below, where a null/legacy sample_unit is treated as
--    "already in the target unit" and must pass through as-is.
-- ------------------------------------------------------------
create or replace function public.convert_unit(p_value numeric, p_from text, p_to text)
returns numeric language plpgsql immutable as $$
declare
  v_factor_from numeric;
  v_factor_to numeric;
begin
  if p_from = p_to then
    return p_value;
  end if;

  v_factor_from := case p_from
    when 'mg' then 0.001 when 'g' then 1 when 'kg' then 1000
    when 'ml' then 1 when 'ltr' then 1000
    else null
  end;
  v_factor_to := case p_to
    when 'mg' then 0.001 when 'g' then 1 when 'kg' then 1000
    when 'ml' then 1 when 'ltr' then 1000
    else null
  end;

  -- Both units must resolve to a factor AND belong to the same family
  -- (weight factors are grams-per-unit, volume factors are ml-per-unit —
  -- comparing across families would silently produce a nonsense number,
  -- so require both to be in {mg,g,kg} or both in {ml,ltr}).
  if v_factor_from is null or v_factor_to is null then
    return null;
  end if;
  if (p_from in ('mg','g','kg')) <> (p_to in ('mg','g','kg')) then
    return null;
  end if;

  return (p_value * v_factor_from) / v_factor_to;
end $$;

-- ------------------------------------------------------------
-- 2. Fix the trigger: convert into the purchase line's own unit (the same
--    unit its corresponding 'push' row used) before writing to
--    inventory_ledger, instead of writing sample_unit verbatim.
--    quality_checks.sample_qty/sample_unit themselves are UNCHANGED by
--    this fix and keep recording exactly what was actually sampled, in
--    whatever unit was convenient at the time (e.g. a QC certificate
--    legitimately says "50 g sample taken") — that's a deliberate
--    difference from Purchase's qc_qty (which stores already-converted,
--    with no separate "as entered" unit kept at all). Only the ledger
--    write — which must share one consistent per-item unit for
--    stock_balance's raw sum to mean anything — needs converting.
--    A null/legacy sample_unit falls back to "already in the line's own
--    unit" (matches the pre-FB-0021 behavior, when sample_unit always
--    equaled the line's unit and no conversion was ever needed). A
--    genuinely incompatible pair now fails loudly instead of silently
--    corrupting the ledger.
-- ------------------------------------------------------------
create or replace function public.trg_fn_qc_sample_pull()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_line_unit text;
  v_from_unit text;
  v_converted numeric;
begin
  if new.purchase_line_id is not null and coalesce(new.sample_qty, 0) > 0 then
    select unit into v_line_unit from public.purchase_lines where id = new.purchase_line_id;
    v_from_unit := coalesce(new.sample_unit, v_line_unit);
    v_converted := public.convert_unit(new.sample_qty, v_from_unit, v_line_unit);
    if v_converted is null then
      raise exception 'Cannot record QC sample pull: sample unit "%" is not convertible to this batch''s unit "%".',
        v_from_unit, v_line_unit;
    end if;

    insert into public.inventory_ledger
      (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
    values
      ('pull', new.item_id, new.purchase_line_id, v_converted, v_line_unit, 'qc', new.id, auth.uid());
  end if;
  return new;
end $$;

-- ------------------------------------------------------------
-- 3. One-time data correction for the single QC record already affected
--    (AR record for purchase_line_id 1bfc6a85-4e61-4c1e-8c49-66e54bc35a60,
--    Jatamansi RM-00002, batch RM-01/26). The original ledger row
--    (id 8bf46f6a-afa5-4ebe-96e6-0226c5f03eae, quantity 50, unit 'gm') is
--    left exactly as it was written — inventory_ledger is an append-only
--    audit trail, never edited/deleted, same principle as Reopen's
--    compensating pull in 0019. Instead, a new compensating 'push' entry
--    cancels its wrong effect on stock_balance's unit-blind raw sum: the
--    bad row was counted as -50 (raw), when the true pull was -0.05 kg
--    (50 gm); +49.95 kg brings the running total back to the correct
--    5.5 + 11.80 - 0.05 - 0.05 = 17.20 kg. Timestamped now() (when this
--    correction is actually applied), not backdated — an honest new
--    entry, not a rewrite of history. event_by is left null: this runs as
--    a migration, not inside an authenticated request, so auth.uid() has
--    nothing to resolve.
-- ------------------------------------------------------------
insert into public.inventory_ledger
  (event_type, item_id, purchase_line_id, quantity, unit, reference_type, reference_id, event_by)
select
  'push',
  i.id,
  '1bfc6a85-4e61-4c1e-8c49-66e54bc35a60'::uuid,
  49.95,
  'kg',
  'qc',
  '8bf46f6a-afa5-4ebe-96e6-0226c5f03eae'::uuid,
  null
from public.items i
where i.item_code = 'RM-00002'
  and exists (
    select 1 from public.inventory_ledger bad
    where bad.id = '8bf46f6a-afa5-4ebe-96e6-0226c5f03eae'::uuid
      and bad.quantity = 50 and bad.unit = 'gm'
  )
  and not exists (
    -- Idempotency guard: never double-apply this specific correction if
    -- the migration is somehow run twice.
    select 1 from public.inventory_ledger existing
    where existing.item_id = i.id
      and existing.quantity = 49.95
      and existing.unit = 'kg'
      and existing.reference_id = '8bf46f6a-afa5-4ebe-96e6-0226c5f03eae'::uuid
  );
