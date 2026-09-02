-- "Only QC Approved batches can be used for making finished product" (Ravi,
-- 3 Sept 2026) — check_batch_qc_approved() (0001_init.sql) already gates
-- both finished_product_components (Finished Product composition) and
-- bmr_weighment_lines (BMR weighment) on the batch being QC-Approved, but it
-- never checked whether that approval's retest date has since passed. A
-- batch sitting in "Awaiting Retest" (quality_checks.retest_date <= today,
-- see 0025_qc_retest_workflow.sql) was still, silently, fully usable.
--
-- Extends the same trigger function both consumption points already share,
-- so this one change closes the gap identically everywhere it applies —
-- consistent with this app's existing "not just discouraged, impossible"
-- enforcement style (DESIGN.md §7.2). Separate exception messages for the
-- two rejection reasons, rather than one generic message, so a blocked
-- attempt tells the operator which of the two problems it actually is.
create or replace function public.check_batch_qc_approved()
returns trigger language plpgsql as $$
declare
  v_status public.purchase_batch_status%rowtype;
begin
  select * into v_status
  from public.purchase_batch_status
  where purchase_line_id = new.purchase_line_id;

  if v_status.qc_status is distinct from 'approved' then
    raise exception 'Batch (purchase_line_id=%) is not QC-Approved and cannot be consumed', new.purchase_line_id;
  end if;

  if v_status.retest_date is not null and v_status.retest_date <= current_date then
    raise exception 'Batch (purchase_line_id=%) is due for retest (retest date %) and cannot be consumed until it is re-approved',
      new.purchase_line_id, v_status.retest_date;
  end if;

  return new;
end $$;
-- Both trg_fp_component_qc_gate (finished_product_components) and
-- trg_bmr_weighment_qc_gate (bmr_weighment_lines) already point at this
-- function by name — no trigger changes needed, `create or replace` alone
-- picks this up for both.
