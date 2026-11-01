## REQ-20 — Start Retest draws a real sample; Legacy batches tagged and count earlier retests

> "Start Retest draws a real sample (stability reserve first, then stock). Legacy (opening-stock) batches carry a Legacy tag and count earlier retests."
> — docs/modules/qc.md · bullet 8

**Verdict:** implemented · confidence: high

---

**What this demands of an implementation:**
1. Starting a retest takes a sample quantity and moves it: first out of the batch's remaining stability reserve
   (stability qty less reserve used by earlier retests), and only the shortfall out of the batch's stock, with a
   stock movement for the stock part; refused if reserve + stock cannot cover it. For raw material (purchase and
   Production batches) and finished product.
2. Batches loaded as opening stock show a Legacy tag on the QC screens.
3. Retests done before the batch was loaded count toward the retest limit (3).

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0112_qc_integrity_and_coa_company.sql:L276-L305  start_retest() (latest create; 0114:L215 only sets timezone)
v_reserve := public.stability_reserve_left(p_purchase_line_id, p_production_batch_id);
v_from_reserve := least(v_reserve, v_qty);
v_from_stock := v_qty - v_from_reserve;
if v_from_stock > coalesce(v_live, 0) + 0.0000001 then raise exception ...
if v_from_stock > 0 then
  update ... set live_remaining_qty = live_remaining_qty - v_from_stock ...
  insert into public.inventory_ledger (... 'pull', ... 'qc_sample', ... 'Retest sample');
insert into public.quality_checks (..., is_retest, stability_reserve_used, stock_sample_used) values (..., true, v_from_reserve, v_from_stock)
```
- `stability_reserve_left()` (0080, only body definition; 0124:L33-L35 revokes it from `authenticated`, which does not
  affect `start_retest`, a SECURITY DEFINER function) = stability_qty − Σ `stability_reserve_used` of retest records.
  Reserve consumption is therefore recorded by the new row's `stability_reserve_used`.
- Sample is converted to the batch unit (`convert_unit`, L270-L274) and must be > 0 (L266-L268).
- Finished product: `start_fp_retest()` `0120_finished_product_retest.sql:L115-L210` — `fp_stability_reserve_left`
  first (L179-L181), rest from bulk (`fp_bulk_left`, L182-L188), stock part raises `retest_sample_qty` and writes a
  `qc_sample` pull "Retest sample" (L190-L198); record stores both parts (L200-L204).
- Stock check uses the stability reserve held outside stock: stock = quantity − qc − stability − R&D samples
  (e.g. 0112:L64, 0120:L53), so a reserve draw does not move On hand and a stock draw does.

App layer: `lib/actions/qc.ts:L435-L476` `startRetest` requires a sample qty and unit (L441-L444), checks the
retest count (L448-L451), then calls `start_fp_retest` or `start_retest`. Cards show reserve and stock left
(`app/(dashboard)/qc/due-for-retest.tsx:L59`, `fp-due-for-retest.tsx:L57`, `production-due-for-retest.tsx:L44`).

Legacy tag: `quality_checks.is_legacy` / `legacy_retests_done` (0100_opening_stock.sql:L89-L92, check 0..3),
`purchase_lines.is_legacy` (0100:L87-L88), set by `load_opening_stock` (0100:L304-L311) and
`load_opening_finished_product` (0120:L989-L991). Shown by `<LegacyTag>` on Awaiting QC
(`awaiting-qc.tsx:L64`), Due for retest (`due-for-retest.tsx:L54`), FP due (`fp-due-for-retest.tsx:L52`), the QC list
(`qc-table.tsx:L63`, L98) and the QC record page (`qc/[id]/page.tsx:L174`, L186). RM cards get the flag from
`getOpeningLineIds` (`lib/opening-stock/legacy-lines.ts`, used at `qc/page.tsx:L140-L147`, L206-L215).

Count of earlier retests: `lib/qc-retests.ts:L7-L23` `countRetestsDone` = number of `is_retest` records +
Σ `legacy_retests_done` of the batch's `is_legacy` records; used to refuse a 4th retest (`lib/actions/qc.ts:L448`)
and to mark the last retest (`qc.ts:L263-L269`, `qc/[id]/page.tsx:L93-L98`).

---

**Paths walked:**
- Purchase RM retest: card → `startRetestQualityCheck` (qc.ts:L410) → `startRetest` → `start_retest`, reserve
  first, stock rest with ledger pull. ✓
- Production RM-FP retest: `startProductionRetestQualityCheck` (qc.ts:L553-L559) → same RPC with
  `p_production_batch_id`; reserve from `production_issue_batches.stability_qty`. ✓ (A voided batch is refused by
  `trg_00_qc_production_batch_active`, 0127:L275-L278.)
- FP retest: `startFpRetestQualityCheck` (qc.ts:L420) → `start_fp_retest`. ✓ (tested: fr120 L77-L78 reserve only,
  On hand unchanged; L104-L106 0.5 from reserve + 1.5 from bulk, ledger "Retest sample".)
- Not enough reserve + stock → exception (0112:L280-L284; 0120:L184-L188). ✓
- Legacy batch with 2 earlier retests: `countRetestsDone` returns 2 + app retests; 4th total refused at
  qc.ts:L449. ✓ (app layer)
- Direct RPC call to `start_retest`/`start_fp_retest` (bypassing `startRetest`): neither function counts retests
  or reads `legacy_retests_done`, so the limit — including the legacy count — is not enforced there. ✗ (app-only)

---

**Searched:**
- `function public.start_retest(` → 0080, 0112 (latest create), 0114 (alter only).
- `function public.start_fp_retest(` → 0120 only.
- `function public.stability_reserve_left` → 0080 (body), 0124 (grant change only).
- `stability_reserve_used` in tests → b_batch_numbers_retests.sql, part_fr120_fp_retest.sql.
- `legacy_retests_done` in migrations → 0100:L91-L98, L307; 0120:L991. No migration reads it (0 hits outside
  column definition and loader inserts).
- `legacy_retests_done|is_legacy` in lib/app → lib/qc-retests.ts:L5-L22 plus display uses listed above.
- `countRetestsDone` → qc.ts:L264, L448; qc/[id]/page.tsx:L93.
- `start_retest|start_fp_retest` in app/lib → qc.ts:L453, L458 only.

---

**How the verdict was reached:** the sample movement is done in the database in one transaction for all three batch
kinds, in the stated order, and recorded on the QC row and the ledger; the Legacy tag is shown on every QC
surface; earlier retests are counted. That meets the sentence as written, so `implemented` rather than `partial`.
The one weakness is layering: counting earlier retests (and the 3-retest limit it feeds, REQ-17) lives only in the
server action, so a QC/inventory role calling the RPC directly could start a retest beyond the limit. That needs a
privileged role and a deliberate bypass; recorded as low.

**Open questions:**
- Should `start_retest`/`start_fp_retest` enforce the retest limit including `legacy_retests_done` (database
  layer)? Would close the RPC bypass; ask Ravi.
- The RM due cards filter on `live_remaining_qty >= MIN_STOCK_QTY` (qc/page.tsx:L201, L303), so a batch with
  reserve but no stock left is not offered for retest, although the RPC would accept a reserve-only sample. Not
  verified whether intended.
