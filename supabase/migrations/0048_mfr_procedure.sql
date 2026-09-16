-- ============================================================
-- Ravi (16 Sept 2026), via a sample "Master Formula Record" Word document
-- (A. Jatamansi Tail Procedure.docx): "suggest a way to input and store
-- 'MANUFACTURING PROCEDURE' against each MFR." The sample is a Sr.No /
-- Stage / Operation table (Cleaning, Pulverisation, Preparation of Kwath,
-- ... Packing), preceded by a "Weigh/measure all raw materials at
-- production level (Batch size X)" intro line and closed by a
-- "Theoretical Yield = 100%, Permissible yield = NLT 98%" line — none of
-- which the MFR module (mfr_definitions/mfr_lines, the *recipe* only) had
-- anywhere to live before this.
--
-- Confirmed via AskUserQuestion before building:
--   - Entered from the MFR Detail page after the MFR already exists, not
--     bundled into /mfr/new — create_mfr_definition()'s signature and the
--     New MFR screen are untouched.
--   - The yield line is stored as two structured numeric percentages
--     (theoretical_yield_pct / permissible_yield_pct) rather than one
--     free-text line — the sample's "NLT 98%" reads as a not-less-than
--     minimum, so permissible_yield_pct is that threshold, printed as
--     "Permissible yield = NLT {value}%".
--   - Unlike the recipe (mfr_lines, locked once approved — see
--     0043_mfr_recipe_edit_lock.sql), the procedure stays editable at any
--     time, before or after approval: it documents how the batch is made,
--     not the signed-off formula itself, so there's no reason a
--     production-time correction should be blocked just because the MFR
--     is already approved and in use. update_mfr_procedure() below
--     deliberately has no "already approved" guard.
--
-- Shape mirrors mfr_lines: a child table keyed to mfr_definitions, a
-- `version` column (default 1, unused beyond that — same "left in place
-- for possible future versioning" reasoning as mfr_lines, see
-- docs/modules/mfr.md's Versioning section), replace-in-place editing via
-- a security definer RPC. All three new mfr_definitions columns are
-- nullable — additive, no backfill: every existing MFR simply has no
-- procedure until one is entered.
-- ============================================================

alter table public.mfr_definitions
  add column procedure_intro text,
  add column theoretical_yield_pct numeric,
  add column permissible_yield_pct numeric;

create table public.mfr_procedure_steps (
  id uuid primary key default gen_random_uuid(),
  mfr_definition_id uuid not null references public.mfr_definitions(id) on delete cascade,
  version integer not null default 1,
  step_no integer not null,
  stage text not null,
  operation text not null
);

alter table public.mfr_procedure_steps enable row level security;
create policy mfr_procedure_steps_select on public.mfr_procedure_steps for select using (public.is_signed_in());
create policy mfr_procedure_steps_write on public.mfr_procedure_steps for all
  using (public.has_any_role('system_admin', 'mfr_manager'))
  with check (public.has_any_role('system_admin', 'mfr_manager'));

-- ------------------------------------------------------------
-- update_mfr_procedure() — replace-in-place, same delete-and-reinsert-in-
-- one-transaction shape as update_mfr_recipe() (0043_mfr_recipe_edit_lock.sql
-- ), but deliberately WITHOUT that function's "refuse once approved" guard
-- — see the header comment above. Unlike the recipe, an empty procedure
-- (p_steps null/empty) is allowed: the procedure is optional, may not
-- have been entered yet, or may be cleared back to nothing.
-- ------------------------------------------------------------
create or replace function public.update_mfr_procedure(
  p_id uuid,
  p_intro text,
  p_theoretical_yield_pct numeric,
  p_permissible_yield_pct numeric,
  p_steps jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step jsonb;
  v_idx int := 0;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to edit an MFR procedure.';
  end if;

  if not exists (select 1 from public.mfr_definitions where id = p_id for update) then
    raise exception 'MFR definition not found.';
  end if;

  if p_theoretical_yield_pct is not null and p_theoretical_yield_pct <= 0 then
    raise exception 'Theoretical yield must be greater than 0.';
  end if;
  if p_permissible_yield_pct is not null and p_permissible_yield_pct <= 0 then
    raise exception 'Permissible yield must be greater than 0.';
  end if;

  update public.mfr_definitions
    set procedure_intro = nullif(trim(both from coalesce(p_intro, '')), ''),
        theoretical_yield_pct = p_theoretical_yield_pct,
        permissible_yield_pct = p_permissible_yield_pct
    where id = p_id;

  delete from public.mfr_procedure_steps where mfr_definition_id = p_id;

  if p_steps is not null and jsonb_typeof(p_steps) = 'array' then
    for v_step in select * from jsonb_array_elements(p_steps)
    loop
      v_idx := v_idx + 1;
      if (v_step->>'stage') is null or v_step->>'stage' = ''
         or (v_step->>'operation') is null or v_step->>'operation' = '' then
        raise exception 'Step %: both stage and operation are required.', v_idx;
      end if;
      insert into public.mfr_procedure_steps (mfr_definition_id, version, step_no, stage, operation)
        values (p_id, 1, v_idx, v_step->>'stage', v_step->>'operation');
    end loop;
  end if;
end $$;

-- No explicit grant needed — 0001_init.sql's `alter default privileges
-- ... grant execute on functions to anon, authenticated` already covers
-- every function created after it (see 0037's/0041's own closing note).
