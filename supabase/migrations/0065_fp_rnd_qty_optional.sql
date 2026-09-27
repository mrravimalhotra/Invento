-- ============================================================
-- FB-0040 (24 Sept 2026): "In Finished Product, at the time of batch
-- completion, the sample shows R&D entry as a mandatory field. Please
-- make it optional, as it is not necessary to take a sample for R&D for
-- every batch."
--
-- fp_completion_fields_required_together (0044_fp_batch_start_date.sql,
-- 15 Sept 2026) currently requires Batch yield, Expiry date, and all
-- three of QC/Stability/R&D sample qty together, non-null and > 0,
-- whenever a batch's Finish date is set — per Ravi's own instruction at
-- the time ("the batch is only truly finished once every one of them is
-- known"). Confirmed with Ravi before this migration: FB-0040 narrows
-- that rule for R&D only. Batch yield, Expiry date, QC sample qty, and
-- Stability sample qty all stay exactly as mandatory as they were —
-- R&D sample qty may now be null, and is only checked to be > 0 when it
-- IS provided.
--
-- No other constraint needs touching: fp_batch_yield_not_negative
-- (0030_finished_product_ledger.sql) already does
-- `coalesce(rnd_qty, 0)`, and trg_fn_qc_review_finished_product's R&D
-- sample pull (same migration) already only fires
-- `if coalesce(rnd_qty, 0) > 0` — both were already written to tolerate
-- a null/zero R&D sample; only this CHECK and the app layer
-- (lib/actions/finished-product.ts, complete-batch-form.tsx) were
-- actually preventing R&D from ever being left empty.
-- ============================================================

alter table public.finished_product_batches
  drop constraint if exists fp_completion_fields_required_together;
alter table public.finished_product_batches
  add constraint fp_completion_fields_required_together
  check (
    finish_date is null or (
      batch_yield is not null and batch_yield > 0 and
      expiry_month is not null and
      qc_sample_qty is not null and qc_sample_qty > 0 and
      stability_qty is not null and stability_qty > 0 and
      (rnd_qty is null or rnd_qty > 0)
    )
  ) not valid;
