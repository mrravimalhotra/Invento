-- ============================================================
-- Finished Product — Stability qty / R&D qty capture (2 Sept 2026)
--
-- Raw Material / Packaging has captured QC + Stability + R&D quantity
-- together, per purchase line, since FB-0007/FB-0017. Finished Product
-- never had a Stability/R&D equivalent — finished_product_batches only
-- had `qc_sample_qty`, captured on the Complete Batch screen
-- (complete-batch-form.tsx) with no unit-conversion support at all (it
-- was always assumed to already be in the batch's own `unit`).
--
-- Per direct request ("QC sample quantity will remain in complete batch
-- screen along with Yield, Stability Sample, R&D Sample and sample
-- unit"): two new nullable columns, additive only — no existing data is
-- touched, no backfill, no constraint tightened. Existing batches simply
-- have stability_qty/rnd_qty = null until someone fills them in.
--
-- Same storage convention as purchase_lines.qc_qty/stability_qty/
-- rnd_qty: the app-layer converts whatever "sample unit" the person
-- entered these in down to the batch's own `unit` before saving (see
-- completeFinishedProductBatch() in lib/actions/finished-product.ts,
-- using the same convertUnit() as Purchase/QC) — no separate "as
-- entered" unit column is kept here, deliberately, matching
-- purchase_lines rather than quality_checks (see 0020's comment for why
-- those two tables made opposite choices).
-- ============================================================
alter table public.finished_product_batches
  add column if not exists stability_qty numeric,
  add column if not exists rnd_qty numeric;
