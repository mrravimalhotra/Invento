-- ============================================================
-- Ravi (14 Sept 2026), following up on the deferred-approval change
-- (0041_mfr_deferred_approval.sql): "before MFR is approved there should
-- be option to edit recipe 1. Currently An MFR should only have one
-- approved recipe. We will add recipe versioning if required but right
-- now lets not have this as standard feature." — then, scoped further via
-- AskUserQuestion: "for now MFR edit option should only available before
-- approval. Post approval edit should be not allowed. We will revisit if
-- required."
--
-- Two behavior changes from updateMfrLines()'s original design
-- (DESIGN.md §7.4, docs/modules/mfr.md "Versioning — the gap fix"):
--
-- 1. Editing no longer bumps mfr_definitions.version or keeps the
--    previous lines around under an old version number. There is just
--    one current recipe per MFR now — editing replaces it in place. This
--    was already slightly wrong before an MFR had ever been approved
--    (bumping straight to "version 2" for a draft that was never
--    version 1 of anything approved), and Ravi's now saying not to build
--    out the full version-history feature as standard behavior at all,
--    for either case, until/unless it's actually needed later. The
--    `version` column on both tables is left in place (schema-compatible,
--    always 1 going forward) rather than dropped, so real versioning can
--    be turned back on later without another migration.
-- 2. Editing is now blocked entirely once an MFR is approved — not
--    "allowed, but clears the approval," just refused outright. An
--    approved recipe is locked; the only way to change it is to
--    deactivate that MFR and create a new one. This is a tighter rule
--    than before (previously any edit was allowed, at the cost of
--    silently clearing approval) and matches Ravi's explicit
--    "post-approval edit should be not allowed."
--
-- update_mfr_recipe() replaces updateMfrLines()'s old two-step
-- (optimistic-locked version bump, then insert new lines, with a
-- best-effort revert if the insert failed) with one real transaction: a
-- `for update` row lock (blocks a concurrent Approve from landing mid-edit
-- and vice versa — same real-lock upgrade 0041 gave
-- approve_mfr_definition()), the "not approved" guard, then a delete +
-- re-insert of mfr_lines that either both happen or neither does. The old
-- design's failure mode — insert fails after the old lines were already
-- deleted, leaving an empty recipe — is no longer possible.
-- ============================================================

create or replace function public.update_mfr_recipe(p_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved_by uuid;
  v_line jsonb;
begin
  if not public.has_any_role('system_admin', 'mfr_manager') then
    raise exception 'Not authorized to edit an MFR recipe.';
  end if;

  select approved_by into v_approved_by from public.mfr_definitions where id = p_id for update;
  if not found then
    raise exception 'MFR definition not found.';
  end if;
  if v_approved_by is not null then
    raise exception 'This MFR is already approved — the recipe can no longer be edited. Deactivate it and create a new MFR if the recipe needs to change.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one recipe line.';
  end if;

  delete from public.mfr_lines where mfr_definition_id = p_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if (v_line->>'item_id') is null or (v_line->>'quantity') is null
       or v_line->>'unit' is null or v_line->>'unit' = '' then
      raise exception 'Every recipe line needs an item, quantity, and unit.';
    end if;
    if (v_line->>'quantity')::numeric <= 0 then
      raise exception 'Recipe line quantity must be greater than 0.';
    end if;
    insert into public.mfr_lines (mfr_definition_id, version, item_id, quantity, unit)
      values (p_id, 1, (v_line->>'item_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit');
  end loop;
end $$;
