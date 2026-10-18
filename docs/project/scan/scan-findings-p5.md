---
title: Scan findings — Phase 5 (production)
---

# Phase 5 — Production

Steps done: P5.1 to P5.5 (Phase 5 complete; findings added to the master list Part 1F). Next: P6.1. (Rewritten whole after every step.)

## Findings

### SCAN-P5-01 — The person who creates an MFR can approve it, so a Master Formula Record needs no second person
- Severity: Medium
- Kind: Gap (approval control)
- Where: `approve_mfr_definition()` (migration 0063), `approveMfrDefinition`, MFR detail page
- Finding: Approval of an MFR is allowed to System Admin and MFR Manager, and the function does not look at who created the record. Tested: the same user created an MFR and approved it in the same session (`approved_by` equals `created_by`). Approval is also the moment the Finished Product and Packaged Finished Product items are created, and after it the recipe is locked for good (no edit, no versions). A recipe typed wrongly is therefore locked in with no independent review, and the only remedy is to deactivate it and make a new one (which keeps the wrong item pair).
- Evidence: Local database, `claude/scan-evidence-p5.sql` step H: ALLOWED, `approved_by = created_by` true.
- Suggested fix: Refuse approval when `auth.uid()` equals the creator (System Admin included, or with a written override reason). Show "Awaiting approval by another user" on the detail page. Size S.
- Needs decision from Ravi: Yes. Same question as the QC two-person rule (SCAN-P1-09): is the System Admin exempt, and are there enough MFR Managers for a second person?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-02 — Recipe rules are only on the screen: packaging, inactive and repeated items are accepted by the database, and MFR names that differ by spacing count as new
- Severity: Low
- Kind: Hardening (rules not repeated in the database)
- Where: `create_mfr_definition()`, `update_mfr_recipe()` (0041, 0043, 0066), `mfr/new/page.tsx` item list
- Finding: The recipe form lists only active raw materials, but the functions accept any item. Tested as System Admin: a recipe with a packaging item (ALLOWED), a recipe with the same raw material on two lines (ALLOWED), a recipe with an inactive item (ALLOWED). Wrong-unit lines are refused (kg item with litres) and grams are converted correctly to the item's unit (5000 g stored as 5 kg). The duplicate-name check is `name ilike v_name`, so "scan mfr  e" (two spaces) is accepted next to "Scan MFR E" (same weakness as SCAN-P2-03 for items and vendors).
- Evidence: Local database, `claude/scan-evidence-p5.sql` steps A to F.
- Suggested fix: In both functions, refuse an item that is not an active raw material, refuse a repeated item, and compare names after trimming and collapsing spaces. Size S (one migration, suite).
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-03 — An approved MFR's procedure and yield limits can change later with nothing on the printout to show it
- Severity: Low
- Kind: Gap (document control)
- Where: `updateMfrProcedure`, `update_mfr_procedure()`, MFR report and Word document
- Finding: By Ravi's decision (16 Sept 2026) the manufacturing procedure and the theoretical and permissible yield stay editable after approval, while the recipe lines lock. The printed and Word MFR shows the approval name and date and "v1", and nothing about when the procedure or yield limits last changed. Two printouts made a month apart can differ in steps or yield limits while carrying the same approval stamp. The audit log keeps the history, but a printed MFR is what the shop floor and an inspector hold.
- Evidence: Code read: report page and `MfrPdfData` carry approval fields only; no procedure revision field.
- Suggested fix: Print "Procedure last revised on <date> by <name>" on the report and Word document, taken from the procedure's update stamp; or a small revision list for the procedure. Size S.
- Needs decision from Ravi: Yes (small). Only the "last revised" line, or full procedure revisions?
- Confidence: Confirmed (code)
- Status: New

### SCAN-P5-04 — Once a batch is confirmed there is no way to correct a typing mistake or to close a batch that failed
- Severity: Medium
- Kind: Gap (workflow, correction path)
- Where: `completeFinishedProductBatch`, `trg_fn_guard_fp_batch_workflow` (0070), batch detail page
- Finding: A batch moves one way only: Draft, In progress, Complete - Awaiting QC, Submitted to QC. Only a Draft can be cancelled. After "Complete batch" the database refuses every edit ("can no longer be edited"), so a wrong yield, expiry date or sample quantity cannot be fixed by anyone, System Admin included. After "Create Batch" there is no cancel either: a run that is spoiled or abandoned stays "In progress" for ever (and stays on the Dashboard in-progress list), with its raw material consumed and no zero-yield close. The only way out of a mistake is to submit to QC and have it rejected, which is final and uses up the batch number. The Complete screen has a review step, which helps, but it is the only safeguard.
- Evidence: Local database, `claude/scan-evidence-p5.sql` steps F5 (cancel a running batch: REFUSED) and F3 (edit after complete: REFUSED).
- Suggested fix: (a) Let a Manager or System Admin send a "Complete - Awaiting QC" batch back to In progress, with a reason, audited, while no QC record exists. (b) Add "Close batch, no yield" for an In progress batch: reason required, consumed raw material stays consumed (so it also needs the write-off route in SCAN-P3-07), batch shows as Closed. Size M.
- Needs decision from Ravi: Yes. Who may send a completed batch back, and should a failed batch be closed with zero yield or recorded as a loss of material?
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-05 — A batch yield of any size is accepted, so one extra zero adds stock that does not exist
- Severity: Medium
- Kind: Gap (plausibility check) / inventory tightening
- Where: `completeFinishedProductBatch`, `complete-batch-form.tsx`, `fp_yield` push in `trg_fn_qc_review_finished_product` (0030)
- Finding: Batch yield must only be greater than 0 and not smaller than the samples. It is not compared with the batch size or the raw material put in. Tested: a 10 kg batch made from 2 kg of raw material was completed with a yield of 5,000 kg and the database kept it (the yield percentage column simply shows a huge number). When QC approves the batch, that yield is pushed into stock as finished product, and with SCAN-P5-04 it cannot be corrected afterwards. The MFR holds theoretical and permissible yield limits, but the batch screen does not use them.
- Evidence: Local database, `claude/scan-evidence-p5.sql` step F4: ALLOWED.
- Suggested fix: On the Complete screen show the yield as a percentage of the batch size and of the MFR limits; outside the permissible range require a written reason (stored with the batch) and flag it for QC; refuse anything above a hard ceiling such as 150% of the batch size, set by Ravi. Size S to M.
- Needs decision from Ravi: Yes. Warn only, reason required, or hard block; and the ceiling.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-06 — Batch rules are on the screen only: an unapproved or inactive MFR, a future finish date and an expiry before the finish date are all accepted by the database
- Severity: Medium
- Kind: Hardening (rules not repeated in the database)
- Where: `create_finished_product_batch()` (0079), `finished_product_batches` columns and guard trigger, `complete` and `create` actions
- Finding: The Step 1 screen offers only approved and active MFRs, but the Compose page (`/finished-product/new/compose?mfr_definition_id=...`) and `createFinishedProductBatch` never check that the MFR is approved or active, so anyone who can write batches can start a batch, and take raw material, on an unapproved formula by editing the address. The screen also checks the start date against the MFR approval date, and checks finish and expiry dates (Ravi, 3 Oct 2026). A direct call skips all of it. Tested on the database: a draft against an UNAPPROVED MFR (ALLOWED, and it pulls raw material); a draft against a DEACTIVATED MFR (ALLOWED; a draft already open can also be confirmed after its MFR is deactivated); a batch with MFR version 99 when the MFR is version 1; a free-text batch number ("HELLO") and a start date of 2020 (ALLOWED); a finish date in 2031 with expiry 2033 (ALLOWED); an expiry date earlier than the finish date (ALLOWED). While a batch is Draft or In progress its batch number, target quantity, start date and MFR version can be edited directly, and the row is only audited by the generic audit trigger. Also tested and sound: a unit of grams on a kilogram product is converted (10 g stored as 0.01 kg).
- Evidence: Local database, `claude/scan-evidence-p5.sql` steps D1, D3, F2, F3a, F3d, G1 to G3; code read for the Compose page and the action (no MFR status check).
- Suggested fix: One migration: in the guard trigger refuse a new batch unless the MFR is approved and active and the version equals the MFR version, check the batch number format against the generated number, refuse a start date before approval or in the future, and add CHECKs for finish date not in the future and expiry after finish; lock batch number, MFR, version and start date once a batch leaves Draft. Size S (migration and suite).
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-07 — Reserved raw material from a stale draft stays locked until someone opens the batch list or a batch page
- Severity: Low
- Kind: Design limit (accepted in 0046, one gap left)
- Where: `expire_stale_fp_drafts()` (0046), callers `finished-product/page.tsx` and `finished-product/[id]/page.tsx` only
- Finding: Ravi chose a lazy 30-minute auto-cancel because the app has no scheduled job. The cancel works (any signed-in user can trigger it, it is safe to repeat, and it returns both the ledger quantity and the batch remaining quantity: 2.9 kg became 4.9 kg in the test). The gap: until the Batch list or a batch page is opened, a stale draft still holds its raw material. Stock Position, the Dashboard low-stock card, the Stock Statement, Packaging, Wastage and the Compose batch picker all read the reduced figure. If the person who started the draft leaves, the stock stays hidden until the next visit to Finished Product, which may be hours away.
- Evidence: Local database, `claude/scan-evidence-p5.sql` step E: after 40 minutes the draft is still "draft", remaining 2.9 kg; after the call, "cancelled", remaining 4.9 kg.
- Suggested fix: Call the same function when the Compose page and Stock Position load (cheap, one call), or when the hosted Supabase project gets a scheduled job (pg_cron every 5 minutes). Size S.
- Needs decision from Ravi: No (the cron option can wait for the environments work).
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-08 — Quantities are stored with up to 15 decimals, so a batch can be left with a speck of material that blocks the next batch
- Severity: Low
- Kind: Bug (rounding) / inventory tightening
- Where: `compose/page.tsx` (`scaledQuantity`, `allocateFifo`), `compose-form.tsx` (quantity sent unrounded), `finished_product_components.quantity` (plain numeric), `trg_fn_fp_component_fifo`
- Finding: Compose multiplies the recipe quantity by target ÷ batch size in floating point and posts the result as it is (for example 0.058333333333333334 kg), and the database keeps all the digits. When a batch is drawn down in fractions that do not add up exactly, a speck is left. Tested: a 9.5 kg batch drawn three times at 3.16666666666666 kg is left with 0.00000000000002 kg. The next draw from a newer batch is then REFUSED by the oldest-first rule ("Batch OLD-EXP-42 (0.00000000000002 kg still available) is older ... has to be used before it"). The Compose screen copes by adding a line for the speck, so the Batch Record ends with a ghost line of "0.000 kg" from that batch, which also needs its AR number; the speck batch also stays on Ageing and the retest and expiry alerts as stock. About one in five scale combinations tried (recipe quantity, batch size, target) does not come out to three decimals.
- Evidence: Local database, `claude/scan-evidence-p5.sql` file `p53_dust.sql`; a quick calculation over 1,155 scale combinations (248 not clean to three decimals).
- Suggested fix: Round each component quantity to 3 decimals in Compose, give the quantity columns a 3-decimal rule in the database (round on insert), and treat a batch with less than 0.0005 left as empty in the oldest-first rule, the Compose picker, Ageing and the alerts. Clean up existing specks with the invariant INV-S2 style query. Size S.
- Needs decision from Ravi: No. (Three decimals assumed to be the weighing precision; say if grams need one more digit.)
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-09 — A batch component can name a different item from the stock it draws, which takes stock from one item and records it against another
- Severity: Low
- Kind: Hardening (integrity)
- Where: `create_finished_product_batch()`, `finished_product_components` triggers (`trg_fp_component_pull`, `trg_fp_component_live_remaining_pull`)
- Finding: The component's item is not compared with the item of the raw material batch it points to. Tested: a component whose item was the finished product, pointing at a raw material batch of RM-T0001, was ALLOWED. The batch's remaining quantity went down (0.1 kg) while the ledger pull was recorded against the finished product item, which went to minus 0.1 on hand and left the raw material item unchanged. The screen cannot produce this, so it needs a direct call; the damage is a silent mismatch of two items' stock (the stock invariants INV-S2 and INV-S4 would show it). Item-level stock can also go negative; only the batch-level figure is protected.
- Evidence: Local database, `claude/scan-evidence-p5.sql` file `p53_comp.sql`, step T1.
- Suggested fix: In the component insert trigger refuse a component whose item differs from the batch's item, and take the item from the batch instead of trusting the caller. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (local database)
- Status: New

### SCAN-P5-10 — A raw material that was deactivated after the MFR was approved is still offered and still consumed
- Severity: Low
- Kind: Gap (rule undecided)
- Where: `compose/page.tsx` `getCandidateBatches`, `create_finished_product_batch()`
- Finding: Compose does not look at whether an ingredient item is still active, and the database accepts a component of a deactivated item (tested). The recipe form does not let anyone add an inactive item to a new MFR (but the database does, see SCAN-P5-02), and an approved MFR cannot be edited, so deactivating an ingredient later leaves old recipes quietly using it. Whether that is wanted depends on why items are deactivated: a discontinued material with good stock may still need to be used up, a material withdrawn for quality should not.
- Evidence: Local database, `claude/scan-evidence-p5.sql` file `p53_comp.sql`, step T8; code read.
- Suggested fix: Decide the rule. Simple version: Compose shows a clear warning on a line whose item is inactive, and a deactivated item with stock needs a reason. Strict version: refuse it in Compose and in the database. Size S.
- Needs decision from Ravi: Yes. Warn or block?
- Confidence: Confirmed (local database); the rule itself is undecided
- Status: New

### SCAN-P5-11 — The Batch Manufacturing Record leaves out the AR number of raw material that came from Production, and calls the quantity taken from a batch "as per MFR"
- Severity: Low
- Kind: Bug (printed document)
- Where: `finished-product/[id]/page.tsx` (`arByPurchaseLine`), `bmr-docx.ts` column "Qty. as per MFR"
- Finding: AR numbers are looked up only for components that point at a purchase line. Since migration 0068 raw material made from a Production issue also goes through QC and has its own AR number, but the record prints "—" for it (the page comment still says such batches have no QC record). Separately, the column "Qty. as per MFR" prints the quantity actually taken from that raw material batch; when an ingredient is split over two batches each row shows part of the recipe quantity, so the column is not the MFR quantity. The total under the table is correct.
- Evidence: Code read (page query joins `quality_checks` on `purchase_line_id` only; 0068 creates production QC records with `ar_number`).
- Suggested fix: Also read `quality_checks.production_batch_id` for the AR number, and rename the column "Qty. drawn from batch" (or print the MFR quantity in its own column). Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P5-12 — The Batch Manufacturing Record does not name the master formula or carry its procedure, and can only be printed once the batch is complete
- Severity: Low
- Kind: Gap (document control)
- Where: `bmr-docx.ts`, `bmr-download-link.tsx`, `page.tsx` (`bmrEligible`)
- Finding: The record is the legacy front page (Ravi, 15 Sept 2026): product, batch number, size, dates, yield and the raw material table with blank "Dispensed quantity" and "Checked By" columns. It shows no MFR code, MFR version or MFR approval date, no manufacturing procedure and no yield limits, although all are held in the MFR. The link appears only after "Complete batch", but the blank dispensed and checked-by columns, and the line "raw material obtained from store on" the start date, belong to the time production starts, so the sheet cannot be printed to be filled in on the floor. A batch record normally cites the master formula version it was made to.
- Evidence: Code read (`bmrEligible` excludes draft and in-progress; `BmrData` has no MFR fields).
- Suggested fix: Add the MFR code, version and approval date to the header; offer the record from In progress (the quantities are fixed from Create Batch); optionally append the MFR procedure and permissible yield range. Size S to M.
- Needs decision from Ravi: Yes. Print from In progress, and append the procedure page or not?
- Confidence: Confirmed (code); the need is a documentation question
- Status: New

### SCAN-P5-13 — Downloaded file names are built from batch numbers that contain a slash
- Severity: Low
- Kind: Bug (formatting)
- Where: `bmr-download-link.tsx` (`BMR_<code>_<batch>.docx`), `fp-intimation-link.tsx`, the two RM intimation slip links (`purchase-lines-table.tsx`, `production-rm-intimation-link.tsx`); the label PDF already cleans the name (`safeBatch`)
- Finding: Batch numbers look like `PR-03/26` and `RM-T0001-01/26`, and the slash goes straight into the file name. Browsers replace or cut it differently, so the same download can be named `BMR_FP-00001_PR-03_26.docx` in one browser and lose the part before the slash in another, and a saved set of records is not named in one consistent way.
- Evidence: Code read; the label download already works around it.
- Suggested fix: One helper that turns `/` and other unsafe characters into `-`, used by all four downloads. Size S.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

### SCAN-P5-14 — The batch page does not show the samples taken or how much of the bulk is packed or left
- Severity: Low
- Kind: Enhancement (visibility)
- Where: `finished-product/[id]/page.tsx` Batch header and Composition cards
- Finding: After "Complete batch" the page shows yield, finish and expiry, but not the QC, Stability and R&D sample quantities entered (they appear only on the Finish Product Intimation Slip, for QC, and on the Retained Samples report). It also shows nothing about the packed quantity, the bulk still unpacked, or the packing runs that used this batch; that has to be found on the Packaging screens or the Ageing report. The person looking at one batch cannot see its whole life on one page.
- Evidence: Code read; the page query selects the sample columns but only the slip uses them.
- Suggested fix: Add a small "After completion" card: samples taken (with unit), packed quantity, bulk remaining, and a list of packing runs with links. Size S to M.
- Needs decision from Ravi: No.
- Confidence: Confirmed (code)
- Status: New

## Carried to later steps

- The batch record holds only the recipe quantity drawn, not what was actually weighed, who dispensed or verified it, or any deviation (→ P9.1).
- Deactivating an MFR while draft batches are open: done in P5.2 (SCAN-P5-06, a draft can still be confirmed).

## P5.1 — MFR definitions

- Create: name, batch size and unit, market (Domestic/Export, fixed once set), recipe lines, optional COA template; one transaction; MFR code from a sequence; unit conversion on each line (a quantity in grams is stored in the item's own unit; an incompatible unit is refused).
- Approve: System Admin or MFR Manager; one transaction with a row lock; creates the Finished Product and Packaged Finished Product items (names as the MFR, unit from the batch size unit) at approval, not before; a second approval is refused.
- Lock: after approval the recipe lines and every MFR field except Active are locked in the database (direct writes refused); the procedure and yield limits stay editable by design.
- Delete: System Admin only, refused when batches exist; Deactivate retires a recipe from the picker.
- Report and Word document: header, recipe, procedure, yield limits, approval name and date; company details read live (SCAN-P2-13).
- Problems: SCAN-P5-01 to 03.

## Checked and found sound (P5.1)

- An approved MFR cannot be edited or its lines changed, by the screen or by a direct call to the database.
- A new MFR cannot be created already approved, and approval details cannot be set except through Approve.
- Two people approving at once cannot both succeed (row lock); a second approval is refused.
- Recipe lines of zero or negative quantity, and lines with a missing item or unit, are refused.
- A recipe unit that does not convert to the item's unit is refused; grams are stored as kilograms exactly.

## Areas read (P5.1)

`lib/actions/mfr.ts` (all), `create_mfr_definition`, `update_mfr_recipe`, `approve_mfr_definition`, `trg_fn_guard_mfr_definition_workflow`, `trg_fn_guard_mfr_lines_locked`, policies on `mfr_definitions`, `mfr/new/page.tsx` and `mfr/[id]/page.tsx` item lists, `mfr/[id]/report/page.tsx`; own local-database test `p51_mfr.sql`.

## P5.2 — Finished product batch flow

- Create: batch size, unit, start date and components in one transaction (draft); the batch number is the item code plus the next number for the year (highest used plus one, so a deleted number does not break it) and a short number (PR- domestic, OR- export).
- Draft: raw material is taken at once (oldest first, enforced by the database); Create Batch moves it to In progress; Cancel returns the material; a draft older than 30 minutes is cancelled by the lazy check (SCAN-P5-07).
- Complete: batch yield, finish date, expiry date, QC and stability samples (R&D optional) in a sample unit, all together; moves to Complete - Awaiting QC; Submit to QC does the AR number, QC record and status change in one transaction.
- Problems: SCAN-P5-04 to 07.

## Checked and found sound (P5.2)

- The oldest approved raw material batch must be used first, also on a direct database call (a newer batch was refused while an older one had stock).
- A batch cannot skip a step or be approved or rejected directly; a running batch cannot be cancelled by the application path (see P5-04 for the gap this leaves); only draft or cancelled batches can be deleted.
- Samples cannot exceed the batch yield; the completion fields must all be present together.
- The next batch number is the highest used plus one, not a count, so deleting a cancelled batch cannot make two batches collide.
- A unit that differs from the product's unit is converted, not stored as typed.
- Cancelling a draft (by hand or by the 30-minute check) puts the quantity back both in the ledger and in the batch remaining figure.

## Areas read (P5.2)

`lib/actions/finished-product.ts` (create, confirm, cancel, complete, submit to QC), `create_finished_product_batch`, `get_next_fp_batch_number` (0080), `trg_fn_guard_fp_batch_workflow` (0070), `expire_stale_fp_drafts` and reversal trigger (0046), completion constraints (0044, 0065), `complete-batch-form.tsx`, `draft-actions-panel.tsx`, FP list and detail pages; own local-database tests `p52_fp.sql`, `p52_fp2.sql`, `p52_fp3.sql` on copy `scanp5`.

## P5.3 — Compose, FIFO and consumption

- Step 1 picks an approved, active MFR, target quantity (any convertible unit) and start date; Compose scales every recipe line, then draws each ingredient oldest first across QC-approved batches (purchased and production-issued), with no per-batch choice (Ravi, 14 Sept 2026), and blocks the batch if any ingredient is short.
- The database repeats the main rules when material is drawn: QC approved, purchase order submitted, not due for retest, not expired, oldest first (one ingredient at a time under a lock), and not more than the batch holds.
- Problems: SCAN-P5-08 to 10 (and the Compose half of SCAN-P5-06).

## Checked and found sound (P5.3)

- A batch that is not QC approved, due for retest or expired cannot be drawn, on the screen or by a direct call (the retest-date test is the same on both: the retest day itself is already blocked).
- Drawing more than a batch holds is refused; zero and negative quantities are refused.
- Components cannot be edited or deleted directly after the batch is created; the only way back is Cancel on a draft.
- Two people composing the same ingredient at once are made to wait for each other, so the second one sees the first one's draw.
- The same raw material on two recipe lines is not promised the same stock twice (ACC-30).
- A target entered in grams for a kilogram MFR is converted before scaling (ACC-04).

## Areas read (P5.3)

`finished-product/new/page.tsx`, `step1-form.tsx`, `compose/page.tsx`, `compose-form.tsx`, `parseComponents`, `check_batch_qc_approved`, `trg_fn_fp_component_fifo`, `trg_fn_guard_fp_components_locked`, component triggers and policies; own local-database tests `p53_comp.sql`, `p53_dust.sql`.

## P5.4 — Documents and slips

- Batch Manufacturing Record (Word, from Complete - Awaiting QC): header, raw material table with batch and AR number, blank dispensed and checked-by columns, total quantity, chemist signature line. Generated in the browser; nothing is saved.
- Finish Product Intimation Slip (PDF, from submission to QC): two copies on one A4 page, product, batch number, batch and QC sample quantity; dated the QC submission day.
- Company name, address and licence number come from Company Details (SCAN-P2-13 covers the source).
- Problems: SCAN-P5-11 to 14.

## Checked and found sound (P5.4)

- Both documents read the live batch figures; quantities print to three decimals with the unit, and the total under the BMR table adds kilograms to kilograms and litres to litres, not different units together.
- The slip date is the QC submission date, so a reprint later does not change it.
- Cancelled, draft and in-progress batches do not get the Complete-stage documents; the intimation slip appears only when a QC record exists.

## Areas read (P5.4)

`bmr-docx.ts`, `bmr-download-link.tsx`, `fp-intimation-pdf.ts`, `fp-intimation-link.tsx`, `finished-product/[id]/page.tsx` (data building and cards), `fpBatchShort` and `fpBatchBoth` in `lib/utils.ts`, migration 0068 for the production QC record.

## P5.5 — Data invariants, production side

Ten read-only checks in `claude/scan-invariants-production.sql` (INV-P1 to INV-P10); each returns rows only when something is wrong, to be run one block at a time in the Supabase SQL editor.

- P1: components taken equal the ledger pulls less cancel reversals, per batch and source; a cancelled batch nets to zero.
- P2: a component whose item differs from the batch it draws (SCAN-P5-09).
- P3: an approved batch has one yield push equal to the batch yield and sample pulls equal to the sample columns; a batch not approved has none.
- P4: batch status agrees with its latest QC record.
- P5: completion fields present and dates sensible: finish not in the future, expiry after finish, start not before the MFR approval (SCAN-P5-06).
- P6: drafts older than 30 minutes and batches In progress for more than 30 days (SCAN-P5-07).
- P7: batch number shape, short number agreement and repeated short numbers per MFR.
- P8: yield outside 50% to 150% of the batch size (limits to be set by Ravi), samples above yield, packed above what is left (SCAN-P5-05).
- P9: specks below 0.0005 in a raw material batch and components with more than three decimals (SCAN-P5-08).
- P10: batches against an unapproved MFR, a different MFR version, or a deactivated MFR while still open (SCAN-P5-06).

Tested on a scratch database holding the test data from P5.2 and P5.3: P2, P5, P7, P8, P9 and P10 each found the planted problem, P1 found a deleted ledger pull, and P3, P4 and P6 ran and returned rows on the hand-staged databases left by earlier regression suites (their approved batches were seeded directly, so those hits are test artefacts, not real problems). No new finding from this step.

## Areas read (P5.5)

`trg_fn_fp_component_pull`, `trg_fn_fp_component_live_remaining_pull`, `trg_fn_qc_review_finished_product`, `trg_fn_fp_batch_draft_cancel_reversal`, batch columns and constraints; own queries run on `scanp5`, `scanz_p`, `scanz_j`, `scanz_f`.
