-- Ravi (15 Sept 2026): "we need to update new batch creation process. A
-- finished product can take few days to get completed. Unless it is
-- completed it is not available in inventory for packaging and to be
-- issued to Store/R&D. also only when the batch process is complete
-- 'Expiry Date' can be associated."
--
-- Two things worth recording up front, confirmed by reading the actual
-- trigger code (not assumed) before writing this migration:
--
-- 1. "RM is deducted from inventory, but FP yield is not added until the
--    batch is complete" is *already* the live behavior, and stricter than
--    asked: finished_product_components inserts (at batch creation) pull
--    raw material immediately via trg_fp_component_live_remaining_pull
--    (0029_purchase_line_live_remaining_qty.sql), but the FP item's own
--    inventory_ledger push doesn't happen at Complete Batch time either —
--    it only happens once the batch's QC record is *approved*
--    (trg_fn_qc_review_finished_product, 0030_finished_product_ledger.sql).
--    So a batch sitting "in_process" (or even "submitted_to_qc") already
--    contributes nothing to stock_balance, and Packaging already can't
--    draw against it. No change needed for this part.
-- 2. The "In Process" status Ravi describes is also already the literal
--    stored status value (finished_product_batches.status = 'in_process',
--    0001_init.sql) — no rename needed.
--
-- What was actually missing: (a) a way to record when a batch's
-- production run started, separate from `created_at` (which is a plain
-- audit timestamp, not a business field a user enters/sees), and (b) the
-- app previously collected `expiry_date` up front in Step 1 of "New
-- Finished Product Batch" — before the batch had even been through a
-- single day of processing — which is exactly what Ravi is pointing out
-- doesn't make sense. The batch's real expiry is only knowable once it's
-- actually finished; that's `expiry_month` (a `date` column despite its
-- name — see complete-batch-form.tsx's existing comment on this), already
-- collected at Complete Batch time. Rather than introduce a third date
-- column, the app-layer change (see lib/actions/finished-product.ts) stops
-- collecting `expiry_date` at creation and stops reading it anywhere;
-- `expiry_month` becomes the one live "Expiry date" for a batch. The old
-- `expiry_date` column is left in place, unused going forward, same
-- non-destructive precedent as updateItem() dropping its old sampling
-- defaults and the FP wastage/total_units/net_qty removal (Seventh pass,
-- claude/known-issues.md) — existing historical batches keep whatever
-- value they already had, nothing is deleted.
alter table public.finished_product_batches
  add column if not exists batch_start_date date;

-- Backfill every existing row (including LEG-FP-... legacy batches) with
-- its own created_at date — the best available, non-guessing stand-in for
-- "when this batch's production run started" for batches that predate
-- this column. Purely informational going forward; nothing downstream
-- keys off it.
update public.finished_product_batches
set batch_start_date = created_at::date
where batch_start_date is null;

-- Defense-in-depth for "once the batch is finished, Finish Date and
-- Expiry Date — along with Batch yield and all three sample quantities —
-- are added together, and all of them are mandatory": the app layer
-- (completeFinishedProductBatch) is the real enforcement (this is a
-- workflow-completeness rule, not something a user should be able to
-- work around via direct API access either), so this mirrors it as a
-- `not valid` CHECK, same idiom as wastage_requires_batch
-- (0036_wastage_batch_required.sql) and every other "required together"
-- rule in this project: applies only to new writes going forward, never
-- scans or rejects an existing row. A batch that only ever set
-- finish_date (impossible going forward once the app change ships, but
-- exactly the shape some in-process legacy/test batches are in today) is
-- untouched by this constraint since it's `not valid`.
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
      rnd_qty is not null and rnd_qty > 0
    )
  ) not valid;
