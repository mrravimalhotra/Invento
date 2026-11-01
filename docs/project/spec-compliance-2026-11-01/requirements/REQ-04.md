## REQ-04 — Voiding a Production issue: RM-FP batch must be unused; batch leaves stock, QC records voided with history

> "A Production issue can be voided only while its RM-FP batch is unused (not in any finished product batch, not written off, no COA); its RM-FP batch then leaves stock and its QC records become `voided`, recorded in the QC decision history."
> — docs/modules/packaging.md · Current behaviour, bullet 1 (Void) + 0127 note (L6)

**Verdict:** implemented · confidence: high

**What this demands of an implementation:**
1. Before a Production issue is voided, refuse if any `production_issue_batches` row it created (a) is a component of any finished product batch, (b) has a write-off, or (c) has a COA on any of its QC records. Refusal must change nothing.
2. On success: the RM-FP batch has nothing on hand (ledger nets to zero for that batch, `live_remaining_qty` = 0) and is out of use.
3. Every QC record of that batch gets status `voided`, and `qc_decision_history` gets a row for it.

**Where enforcement lives:** database only (`void_packaging_issue()`, SECURITY DEFINER; latest definition is 0127). The server action `voidPackagingIssue` (lib/actions/packaging.ts:L430-L445) only checks role and reason and passes the database message through `friendlyDbError`.

```sql
-- supabase/migrations/0127_void_review_fixes.sql:L87-L100
for v_pb in
  select pb.id, pb.batch_number from public.production_issue_batches pb
   where pb.packaging_issue_id = p_id order by pb.id for update
loop
  if exists (select 1 from public.finished_product_components c where c.production_batch_id = v_pb.id)
     or exists (select 1 from public.inventory_ledger l
                 where l.production_batch_id = v_pb.id and (l.event_type = 'wastage' or l.reference_type = 'finished_product'))
     or exists (select 1 from public.coa_records cr join public.quality_checks q on q.id = cr.quality_check_id
                 where q.production_batch_id = v_pb.id) then
    raise exception 'Its RM-FP batch % has already been used. Nothing was changed.', ...
```
- (a) finished product batch: `finished_product_components.production_batch_id` (column and one-source check added in 0050_production_rm_from_packaging.sql:L137-L147), plus any ledger pull with `reference_type = 'finished_product'` (written by `trg_fn_fp_component_pull`, 0050:L210-L217).
- (b) written off: any ledger row with `event_type = 'wastage'` on the batch.
- (c) COA: any `coa_records` row whose QC record belongs to the batch. COAs are always inserted with `quality_check_id` (lib/actions/coa.ts:L193-L208).
- The exception rolls back the whole call, so "Nothing was changed" holds (the raise happens before any write, L97 vs first insert at L119).

```sql
-- 0127_void_review_fixes.sql:L155-L170
if v_rm_batch is not null then
  update public.production_issue_batches set live_remaining_qty = 0, active = false where packaging_issue_id = p_id;
  perform set_config('invento.voiding', 'on', true);
  perform set_config('invento.void_note', v_note, true);
  update public.quality_checks set status = 'voided'
   where production_batch_id in (...) and status <> 'voided';
```
- Leaves stock: the ledger loop (0127:L104-L145) writes one opposite row for every ledger row carrying the batch's `production_batch_id` (QC/stability/R&D sample pulls, `qc_rejected` pulls) and reverses the batch-less `production_rm_yield` push batch by batch (L113-L125, 0127 fix 5). The batch's ledger therefore nets to zero; `live_remaining_qty = 0, active = false` (L157-L159).
- `voided` is an allowed QC status (0126_void_packaging_issue.sql:L24-L27). The QC guard lets `voided` through only when `invento.voiding = 'on'` and freezes a voided record afterwards (0126:L36-L47).
- History: `trg_qc_decision_history` is `after update of status ... when (old.status is distinct from new.status)` (0119_qc_results_reasons_rejection.sql:L276-L279); its latest body (0127:L44-L47) writes event `voided_with_issue` with the void note as reason and `auth.uid()` as `decided_by`; the event is allowed by the history check constraint (0127:L16-L20).
- After the void: a new QC record on the inactive batch is refused (`trg_00_qc_production_batch_active`, 0127:L260-L278), and a new COA on the voided QC record is refused because it is no longer the current approval (`trg_fn_coa_current_approval`, 0082_current_qc_approval.sql:L74-L98).

**Paths walked:**
- Production issue, batch in a finished product batch → L92 true → raise. ✓ (suite `vp126`, part_vp126_void_packaging.sql:L133-L144)
- Batch with a ledger `finished_product` pull but no component row → L93-L94 true → raise. ✓
- Batch with a COA → L95-L96 true → raise. ✓ (no test in vp126/vr127 covers this branch)
- Batch with a wastage row → raise. ✓ in code, but no path in the code base writes one: `record_wastage()` (latest 0104_rejected_materials.sql:L119-L135) takes only a `purchase_line_id` and refuses without one, and no other function writes `event_type = 'wastage'` with a `production_batch_id`. The check is a forward guard; today an RM-FP batch cannot be written off at all. (no test)
- Unused batch → reversal, `live_remaining_qty = 0`, `active = false`, QC `voided`, one `voided_with_issue` history row. ✓ (part_vp126_void_packaging.sql:L121-L127; part_vr127_void_review_fixes.sql:L81-L86)
- Batch whose QC was rejected → its `qc_rejected` pull is reversed by the loop; `trg_qc_rejected_stock` does not fire on `rejected → voided` because its WHEN clause is `new.status in ('rejected','approved','submitted')` (0119:L371-L375), so no extra push is booked. ✓
- Race: FP batch built from the RM-FP batch while the void runs. The void locks the batch rows `for update` (0127:L90). If the FP insert's `live_remaining_qty` update lands first, the void waits and its later EXISTS statements see the committed component → raise. If the void lands first, the FP insert's update (`trg_fn_fp_component_live_remaining_pull`, 0050:L220-L232) waits, then hits `production_live_remaining_not_negative` (0050:L101-L102, `live_remaining_qty >= 0`) and fails. ✓
- Race: COA generated while the void runs. COA insert does not lock the batch row, so a COA committed between the void's EXISTS check and its commit is not seen. ✗ (narrow; see Open questions)

**Searched:**
- `create or replace function public.void_packaging_issue` → 0126:L312 and 0127:L58; 0127 is the highest migration, so it wins.
- `production_batch_id` in migrations, insert/value lines → writers are the Production transform (0068:L295-L309), FP components (0050:L213, L242), retest sample (0080:L272, 0112:L293), `qc_rejected` (0104, 0119:L352/L364) and 0126/0127; none writes `event_type = 'wastage'`.
- `('wastage'` → 7 hits, all in `record_wastage()` versions, all with `p_purchase_line_id` / `v_line.id` and no `production_batch_id`.
- `insert into public.coa_records` in migrations → 0 hits; the one writer is lib/actions/coa.ts:L193-L208, always sets `quality_check_id`.
- `trigger trg_qc_rejected_stock` / `trg_qc_decision_history` → latest definitions in 0119:L371-L375 and L276-L279.
- `production_issue_batches` + `check` → `production_live_remaining_not_negative` (0050:L102).
- Tests: `part_vp126_void_packaging.sql` and `part_vr127_void_review_fixes.sql` → cover the component branch, leaving-stock and QC void/history; no test for the COA or wastage branch.

**How the verdict was reached:** every clause of the sentence has matching database enforcement in the latest definition, on every path walked except a two-user race with COA generation. The race needs two privileged users acting within the same transaction window, so it does not make this `partial`. The wastage branch is unreachable today because no write-off exists for RM-FP batches; the code is stricter than needed, not weaker.

**Open questions:**
- A COA committed concurrently with a void (after the void's EXISTS check at 0127:L95) would leave a COA on a voided QC record. Closing it would need the COA insert to lock the batch row or the void to lock the QC rows before checking. Not tested.
- "Not written off" cannot currently happen for an RM-FP batch (no write-off path). If a write-off for RM-FP batches is added, it must write `event_type = 'wastage'` with `production_batch_id` set, or this check will miss it.
- A cancelled draft FP batch keeps its component rows (`trg_fn_fp_batch_draft_cancel_reversal` returns the stock but does not delete components, 0050:L238-L250), so an RM-FP batch once put in a cancelled draft still counts as used and cannot be voided. This is stricter than the document; it is not clear whether that is intended.
