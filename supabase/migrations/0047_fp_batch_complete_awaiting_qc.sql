-- ============================================================
-- Ravi (15 Sept 2026), on Finished Product batch completion:
-- "Once I click on complete batch, I should get option to review all
-- information and confirm. In case I want to edit something, there
-- should be a 'Back Button' ... take me to original 'Complete Batch'
-- screen. If Confirmed, the Batch Status should be updated to
-- 'Complete - In QC' from 'In Progress'. Only Once batch is passed
-- QC, it should be marked Complete and available in inventory for
-- packaging."
--
-- Scoped via AskUserQuestion (four open questions):
-- 1. Whether "Complete batch" and "Submit to QC" should merge into one
--    Confirm action — Ravi: keep them separate manual steps, unchanged
--    from today's two-button flow.
-- 2. Whether the new intermediate stage is just a relabel of the
--    existing 'submitted_to_qc' status — Ravi: no, a brand new label,
--    naming it "Complete - Awaiting QC", with the full flow spelled
--    out as Draft -> In Progress -> Complete - Awaiting QC ->
--    Submitted_to_QC -> Complete. So this is a genuinely new, distinct
--    status value sitting between 'in_process' and 'submitted_to_qc',
--    not a display-only rename of either.
-- 3. Whether QC-approved should be relabeled "Complete" in the UI to
--    match the flow diagram's final arrow — Ravi: no, leave it as
--    "approved". (The flow diagram's trailing "-> Complete" is read as
--    describing the FP conceptually becoming complete/available for
--    packaging once QC clears it, not a literal rename of the
--    quality_checks/badge status text — flagged to Ravi in the same
--    reply that ships this migration, per the working agreement to
--    surface scope discoveries rather than silently guess.)
-- 4. What "Back" does on the new review screen — Ravi: keep what was
--    typed (return to the editable Complete Batch form with values
--    intact), never wipe it. This is a client-side-only concern (no
--    review draft is ever persisted to the DB — see completeFinishedProductBatch
--    in lib/actions/finished-product.ts, still only called once, on
--    Confirm) so it needs no schema support here.
--
-- WHAT THIS MIGRATION DOES:
-- Widens finished_product_batches.status to add 'complete_awaiting_qc',
-- inserted in the lifecycle between 'in_process' and 'submitted_to_qc'.
-- Additive only — every existing row's status value is already covered
-- by the pre-existing list, so nothing currently stored changes meaning
-- or needs backfilling. No default change: new batches still start at
-- 'draft' (0046_fp_batch_draft_cancel.sql).
--
-- App-level follow-through (lib/actions/finished-product.ts):
-- completeFinishedProductBatch() now also sets status to
-- 'complete_awaiting_qc' on a successful save (previously it saved the
-- fields but left status untouched at 'in_process'), and
-- submitFinishedProductToQc() now requires status = 'complete_awaiting_qc'
-- instead of 'in_process' to run. The review/confirm screen itself is
-- pure client-side state in complete-batch-form.tsx — nothing about the
-- "Back keeps what was typed" requirement is a database concern.

alter table public.finished_product_batches
  drop constraint if exists finished_product_batches_status_check;

alter table public.finished_product_batches
  add constraint finished_product_batches_status_check
  check (status in ('draft', 'in_process', 'complete_awaiting_qc', 'submitted_to_qc', 'approved', 'rejected', 'cancelled'));
