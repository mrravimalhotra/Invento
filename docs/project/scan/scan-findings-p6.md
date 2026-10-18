---
title: Scan findings — Phase 6 (packaging and production-issued raw material)
---

# Phase 6 — Packaging and production-issued raw material

Steps done: P6.1 to P6.4 (Phase 6 complete; findings added to the master list Part 1F). Next: P7.1. (Rewritten whole after every step.)

## Findings

### SCAN-P6-01 — A packaging issue made by mistake can never be corrected, reversed or voided
- Severity: Medium
- Kind: Gap (workflow, correction path)
- Where: `packaging_issues` and `packaging_issue_items` policies (insert and select only), `create_packaging_issues()` (0093), `trg_fn_packaging_pull`, `trg_fn_packaging_item_pull`, `trg_fn_packaging_transform_and_issue`
- Finding: An issue takes finished product out of the bulk, takes packaging material out of stock and adds to the batch's packed count, all in one step. The tables have no update or delete policy, there is no void or unpack action (Ravi removed "unpack" and "repack" under ACC-05), and no screen shows a way back. A wrong count, wrong pack size, wrong department or the wrong packaging material therefore stays in the books; the only remedy is a database script. Tested as System Admin: delete and update of an issue were both ignored by the database, and the row was unchanged afterwards. Stock that comes back from Store or R&D (returns, breakage, damaged packs) has the same problem: there is no way to receive it back.
- Evidence: Local database, `claude/scan-evidence-p6.sql` steps K11 and K12 (row still present with its original quantity).
- Suggested fix: A "Void issue" action for a Manager or System Admin with a reason: one transaction that reverses the finished product pull, the packed-count change and the packaging material pulls (new ledger rows, never deletes), and marks the issue Void on the list and register. Optionally a "Return from Store / R&D" action later. Size M.
- Needs decision from Ravi: Yes. Who may void, within how many days, and do returns need a separate action?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P6-02 — Packaging issue rules are on the screen only: an unapproved batch, no material, a raw material as packaging, and a wrong unit count are accepted by the database
- Severity: Medium
- Kind: Hardening (rules not repeated in the database)
- Where: `create_packaging_issue()` (0092), `trg_fn_packaging_item_pull` (0079), `createPackagingIssue` and `parseMaterials` in `lib/actions/packaging.ts`, `packaging/new/page.tsx`
- Finding: The screen lists only Approved finished product batches and only active packaging items, and the action requires at least one material and checks the issue date against the QC approval date. A direct call skips all of that. Tested as an Inventory Manager on the database: an issue against a batch that was only In progress (ALLOWED); an issue with no packaging material at all (ALLOWED); a raw material (RM-T0001) used as a "packaging material" (ALLOWED, and 1 kg of RM-T0001 was taken from stock, which skips the QC approval, retest, expiry and oldest-first rules that apply when raw material goes into a batch); a unit count of 1,000 with only 0.5 kg of product consumed (ALLOWED); a free-text issue code ("XYZ") outside the PKG series (ALLOWED); an issue dated 2020 (ALLOWED). Refused correctly: negative unit count, zero pack size, a user without the packaging role (QC Reviewer), and a batch quantity above what the batch has left (ACC-19). Packaging material is drawn oldest first but, by design, with no QC test.
- Evidence: Local database, `claude/scan-evidence-p6.sql` steps K2 to K6 and K9, with the ledger rows of K4.
- Suggested fix: One migration in the issue functions or a trigger: refuse a batch whose status is not approved; refuse a material whose item is not an active packaging item (and a production issue that names a non-bulk item); require at least one material for Store and R&D; require the unit count to agree with the pack size and quantity consumed (within rounding); generate the code in the database instead of accepting it; refuse an issue date before the batch's QC approval. Size S to M (migration and suite).
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P6-03 — The New packaging issue page reads every batch, every QC record and every packaging issue ever made
- Severity: Low
- Kind: Performance
- Where: `packaging/new/page.tsx`
- Finding: To show how much of each batch is left, the page pages through all finished product batches, all their QC records, and every packaging issue in the database, and adds them up on the server. Cost grows with the plant's history; today it is small. Same pattern as the Labels page (SCAN-P4-16).
- Evidence: Code read (`fetchAllRows` over `packaging_issues` with no filter).
- Suggested fix: Read the left-to-pack quantity per approved batch from one view or function (yield less samples less issued), and list only batches that still have bulk left. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P6-04 — Raw material made from Production can be approved by QC with no sample taken and an expiry date unrelated to the finished product it came from
- Severity: Medium
- Kind: Gap (QC control)
- Where: `createProductionQualityCheck`, `reviewQcRound2`, `qc/[id]/page.tsx`, `production_issue_batches` (no link to the source batch), `production_batch_status`
- Finding: A Production packaging issue turns finished product bulk into a raw material batch that needs its own QC (FB-0043). Two controls are missing. First, the issue form accepts a QC sample of 0 ("enter 0 if none"), the QC record is then created with a sample quantity of 0, and nothing refuses its approval: tested, Round 1 and Round 2 approval of a batch with a 0 sample was ALLOWED, and the batch then drew into a finished product batch. A batch was cleared by QC with no sample ever taken. Second, the Reviewer chooses the expiry date freely (tested: expiry in 2031 accepted) and the QC page does not show the finished product batch the material came from, nor that batch's expiry or retest date, so a derived material can outlive its source and the Reviewer cannot see by how much. The source is reachable only through the packaging issue code.
- Evidence: Local database, `claude/scan-evidence-p6.sql` file `p62_prodrm.sql`, steps Q1 to Q3 and U2 (approved with sample 0, expiry 2031-12-31, then drawn into a batch); code read for the QC page.
- Suggested fix: Refuse to submit a Production batch to QC, or to approve it, when its QC sample is 0 (unless Ravi decides the source batch's QC is enough, in which case drop the QC step and inherit the source approval). Show the source finished product batch, its AR number and expiry on the QC page, and refuse an expiry after the source batch's expiry. Size S to M.
- Needs decision from Ravi: Yes. Does a Production batch need its own sample and QC, or inherit the source batch's approval and expiry as a ceiling?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P6-05 — "Issued to Production on" and the Production RM Intimation slip show the day the record was saved, not the issue date typed on the packaging issue
- Severity: Low
- Kind: Bug (wrong date shown)
- Where: `inventory/items/[id]/page.tsx` (selects `created_at`), `production-batches-table.tsx` column "Issued to Production on", `production-rm-intimation-link.tsx` (`billDate` from `packaging_issues.created_at`)
- Finding: Since 0092 a packaging issue carries its own issue date, which may be earlier than the day it is typed in. The Packaging list correctly shows the issue date, but the item page and the printed slip use the save time. An issue dated 5 October entered on 8 October shows 8 October on the slip handed to QC. The batch number year also follows the save date. Retained Samples uses the same save time (SCAN-P3-14).
- Evidence: Code read (the select reads `packaging_issues(code, created_at)`, not `issue_date`).
- Suggested fix: Select and show `packaging_issues.issue_date` in both places. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P6-06 — Expiry & Retest Ageing shows the wrong "In stock" quantity for finished product, because it subtracts the number of packs from kilograms
- Severity: Medium
- Kind: Bug (wrong figure on a report)
- Where: view `batch_ageing`, finished product part (migration 0108), `inventory/(tabs)/ageing`; the same formula was in the first draft of INV-S8
- Finding: For a finished product batch the view takes "yield less samples less `packaged_qty`". But `packaged_qty` is the count of packs made (each packaging issue adds its unit count: 100 bottles add 100), not the quantity of product packed. A batch of 60 litres packed into 100 bottles of 200 ml shows 60 - 100 = 0 left, while 40 litres are left; a batch of 20 kg packed into six 5 kg drums that used 19.5 kg shows 13.5 kg left when almost nothing is. Tested on the real view with three approved batches: FP-1 (yield 20, 19.5 used, 6 packs) showed 13.5 instead of 0; FP-2 (yield 30, 14.03 used, 44 packs) showed 0 instead of 15.97; FP-3 (yield 30, 8.5 used, 1,010 packs) showed 0 instead of 21.5. Because `packaged_qty` also mixes pack sizes (200 ml packs added to 1 litre packs), it has no meaning as a quantity. Related: unlike raw material, a finished product batch is listed even when nothing is left (the view applies no "more than zero" test to it), although the E42 live check says fully used batches are not listed.
- Evidence: Local database, `claude/scan-evidence-p6.sql` file `p63_ageing.sql` (the view output against the packaging issues for the same batches).
- Suggested fix: Replace `packaged_qty` in the view with the product quantity on the batch's packaging issues (`sum(fp_qty_consumed)`, in the batch unit), i.e. exactly what the packaging balance rule (ACC-19) already uses; decide whether a batch with nothing left is listed. Then drop `packaged_qty` or keep it as a pack count only. Size S (view replaced in one migration with a suite).
- Needs decision from Ravi: Yes (small). Should a finished product batch that is fully packed still appear on Ageing (the packs it made still age in the Store)?
- Confidence: Confirmed (local database)
- Status: New

## Carried to later steps

- Packed quantity is kept on the batch (`packaged_qty`) and the packed item is added and issued in the same step, so packed stock is never held (→ P6.3).
- The void for a packaging issue (SCAN-P6-01) would also have to undo a Production raw material batch, only while it is unused and not yet through QC (→ P6.3 / P6.4).
- PKG codes come from a sequence, so a failed save leaves a gap in the series, the same behaviour as AR numbers (SCAN-P4-07); the register has no void marker (→ P6.3).

## P6.1 — Packaging issues

- Three departments: Store and R&D (pack the bulk into units: pack size, unit count, packaging materials, up to 30 lines saved in one transaction, one PKG code per line); Production (convert bulk into a new raw material batch with QC, Stability and R&D samples).
- On save: finished product is pulled from stock, the batch's packed count rises (Store and R&D), packaging materials are drawn oldest first, the packed item is added and issued in the same step; a batch cannot be packed beyond yield less samples less what is already issued (ACC-19, under a row lock).
- Issue date cannot be in the future (database) and cannot be before the QC approval of the batch (screen only).
- Problems: SCAN-P6-01 to 03.

## Checked and found sound (P6.1)

- Several lines against the same batch in one save are checked together, and any failed line cancels the whole save with "Line N: ..." (all or nothing).
- A batch cannot be packed or issued beyond what it has left; two issues at the same moment queue on a row lock.
- A negative or zero unit count and a zero pack size are refused by the database; a QC Reviewer cannot create an issue (row rules).
- Packaging materials in another unit are converted to the item's unit; a material is taken oldest batch first and only from submitted purchase orders.
- Samples taken in a Production issue cannot exceed the quantity converted.

## Areas read (P6.1)

`lib/actions/packaging.ts` (all), `packaging/new/page.tsx`, `create_packaging_issues` (0093), `create_packaging_issue` (0092, 0079), `trg_fn_packaging_batch_balance`, `trg_fn_packaging_item_pull`, `trg_fn_packaging_pull`, `trg_fn_packaging_transform_and_issue`, `get_next_packaging_issue_code`, constraints and policies on `packaging_issues`; own local-database test `p61_pack.sql` on copy `scanp6`.

## P6.2 — Production raw material batches

- A Production issue pulls finished product bulk, pushes the same quantity into a paired raw material item (created automatically at the first issue; code `RM-FP-nnnnn`), makes a batch (`PROD-nn/yy`) with QC, Stability and R&D samples taken off, and the batch needs its own two-round QC before it can be used (0068).
- Compose, oldest first across bought and production batches, and the database gate (approved, retest, expiry) apply to these batches; retests, the three-retest limit and the Due for Retest list work for them; a rejected one moves to Rejected Materials like a bought batch.
- Where they show: item page table, QC list, Ageing, Retained Samples, Batch Trace.
- Problems: SCAN-P6-04 and 05.

## Checked and found sound (P6.2)

- A production batch with no QC record cannot be drawn into a finished product batch (refused: "not QC-Approved").
- Rejection of a production batch moves the quantity to Rejected Materials and can be reversed in the same way as a bought batch (0104).
- Production batches appear in Ageing (as "production raw"), Retained Samples and Batch Trace, and the item page lists their QC state, retest and expiry.
- Samples cannot exceed the converted quantity; the batch remaining equals the quantity less its samples at creation.

## Areas read (P6.2)

`createProductionQualityCheck`, `startProductionRetestQualityCheck`, `reviewQcRound2`, `trg_fn_packaging_transform_and_issue` (production branch), `production_batch_status`, `check_batch_qc_approved` (production branch), 0104 rejected-material handling, `inventory/items/[id]` page and `production-batches-table.tsx`, `production-rm-intimation-link.tsx`, `qc/[id]/page.tsx` select; own tests `p62_prodrm.sql` on `scanp6`.

## P6.3 — Packed finished product stock

- A Store or R&D pack run pushes the packaged item and issues it in the same step, so a Packaged Finished Product item always has On hand 0 by design (Task F, packaged-fp-redesign); its history shows as Packaged, Store and R&D figures. After the pack run the packs are not tracked by the app (no dispatch or Store receipt).
- Opening stock of packed goods loads as one Store packaging issue per batch, so it behaves the same way; the bulk it used shows as consumed by packaging.
- The batch carries `packaged_qty`, a running count of packs of all sizes; no screen reads it, but the Ageing view and the first draft of INV-S8 did (SCAN-P6-06).
- Problems: SCAN-P6-06. The missing way back (void, return from Store or R&D) is SCAN-P6-01; the missing dispatch end of the trace is SCAN-P3-13.

## Checked and found sound (P6.3)

- The Stock Position breakdown for finished product ("Packaged") and for the packaged item (Packaged, Store, R&D) comes from the ledger and is consistent: packaged item On hand is 0 after every run.
- The Packaging list and its PDF register show the issue date, pack size, count, department and materials per issue, so the packing history of a batch is complete there.
- Opening stock of packed goods records the pack count and reduces the bulk by the same pack run, with the old AR number kept on a closed QC record.

## Areas read (P6.3)

`batch_ageing` and `retained_samples` (0108), `trg_fn_packaging_pull` and `trg_fn_packaging_transform_and_issue` (store and R&D branch), 0101 opening finished product, `item-position-summary.tsx`, `stock-position-table.tsx`, `ageing/page.tsx` and `ageing-view.tsx`; own query `p63_ageing.sql` on `scanp6`. Corrected INV-S8 in `claude/scan-invariants-stock.sql` and the P3 text that relied on the wrong comparison.

## P6.4 — Data invariants, packaging side

Eleven read-only checks in `claude/scan-invariants-packaging.sql` (INV-K1 to INV-K11); each returns rows only when something is wrong, to be run one block at a time in the Supabase SQL editor.

- K1: each issue against the ledger: product pulled equals the quantity consumed; for Store and R&D the packs added and issued equal the unit count; a Production issue has no pack rows.
- K2: packaging materials on each issue equal the packaging pulls in the ledger, per material.
- K3: a batch with more product issued plus samples than its yield.
- K4: the pack count on the batch equals the unit counts of its Store and R&D issues.
- K5: a Production issue has exactly one raw material batch with the same quantity and samples; Store and R&D issues have none.
- K6: an issue against a batch that is not approved, dated before the QC approval, or in the future (SCAN-P6-02).
- K7: issue codes outside the PKG-nnnn form, and numbers missing from the series (informational).
- K8: Store and R&D issues with no packaging material, and materials that are not packaging items (SCAN-P6-02).
- K9: pack size times unit count differs from the product consumed by more than 2% (SCAN-P6-02).
- K10: Production raw material batches approved with no QC sample, or with an expiry after the source batch's (SCAN-P6-04).
- K11: Ageing's finished product quantity against the true bulk left (SCAN-P6-06; clears once the view is fixed).

Tested: all eleven run without error on five local databases and return nothing on the clean install. On the scratch copy holding this phase's test data K6 to K11 each found the planted problem (K6 also lists the hand-staged suite batches, whose approval dates were set by my test insert, so those rows are test artefacts), and K1 to K5 returned nothing, which agrees with the code: the ledger and counts are written by triggers in the same transaction as the issue. No new finding from this step.

## Areas read (P6.4)

`trg_fn_packaging_pull`, `trg_fn_packaging_item_pull`, `trg_fn_packaging_transform_and_issue`, `trg_fn_packaging_batch_balance`, `batch_ageing`; own queries on `scanp6`, `scanz_p`, `scanz_j`, `scanx`, `scanw_db`.
