# Finished product retest (SCAN-P4-04) — plan and progress

Ravi, 12 Oct 2026: "QC and Retest of Finished product will have same retest cycles as of Raw material."
Decisions (AskUserQuestion): Blocking = packaging and labels; Opening stock = add a "Retests already done" column;
Retest vs expiry = refuse it (RM and FP); Packed stock = bulk only (a rejected retest marks only the bulk rejected).

## Findings from the code read (before building)
- `quality_checks_fp_batch_unique unique (finished_product_batch_id)` (0015) allows only ONE QC record per FP batch.
  It must become a "pending decision" partial unique index like the raw material one (0119).
- `trg_fn_qc_review_finished_product` (0030) pushes the batch yield and the sample pulls into the ledger on approval.
  A retest approval must NOT push again: it only sets the batch status. Its WHEN clause (0119) also has to know retests.
- Bulk left of an FP batch is a formula (yield - qc - stability - R&D - packaging issued), repeated in 0094 (packaging
  check trigger), 0110 (ageing), 0114 (fp_batch_packing_options), 0118 (S7). A retest sample taken from bulk needs a
  new column `finished_product_batches.retest_sample_qty` and these four places must subtract it. Ledger: a pull
  (reference qc_sample, reason "Retest sample") per stock sample.
- FP stability reserve = stability_qty - sum(stability_reserve_used of its retests). No ledger effect (already pulled at first approval).
- A rejected FP retest: pull the bulk still in stock from the ledger (reason qc_rejected); void brings it back (like RM, 0119).

## Slices
1. [x] Migration 0120 + suite `part_fp_retest.sql` + expected line + fresh-install
2. [x] Server action + QC page card "Finished product due for retest" + Start retest form
3. [x] Round 2 rules (180 days / 3 retests / final retest / never extends expiry / retest date not after expiry) for RM and FP, action + trigger
4. [x] Blocking: packaging (`resolveFpBatch` + DB trigger) and FP labels
5. [x] Opening stock: "Retests already done" column on the FP template and loader
6. [x] QC detail page, results grid, COA for FP retest; rejected page TS; docs; user guide + PDF
7. [x] Verify (tsc, eslint, suites, build), patch, deliver
LW-11 (S9 false alarm) not folded in unless Ravi agrees.

Slice 1 done: migration 0120 + suite part_fr120 (fr120 54 0), all suites OK. Branch fpretest22 (cloud clone). Generator for the migration: /home/claude/out/gen0120.py

## Delivered (12 Oct 2026)
Branch fpretest22, commit 36c82f0 on b9edc35. Patch fpretest22.patch + 0120_finished_product_retest.sql sent to C:\MyApps\Invento\invento-v2\. 39 DB suites OK (fr120 67 0), tsc, eslint, next build clean.
Waiting for Ravi: run the SQL first, then git am, push, screenshot. Then close out (deployment log, known issues Pass 84, master list).
Live checks to do after: FP batch with retest date passed -> QC card -> Start Retest; packaging/label refused; Round 2 retest period past expiry refused.
Not done / parked: LW-11 (S9 false alarm) not folded in. Batch Trace does not list the retest sample quantity as its own row (the retest QC record shows).
