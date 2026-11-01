## REQ-02 — Void writes an opposite ledger row per movement and puts bulk, materials and packed count back

> "`void_packaging_issue()` writes one opposite ledger row per movement (reason "Void of PKG-…: …") and puts the bulk, materials and packed count back."
> — docs/modules/packaging.md · bullet 1 (Void)

**Verdict:** implemented · confidence: high

---

**What this demands of an implementation:**
- For every `inventory_ledger` row the issue created (and, for a Production issue, every row on the RM-FP batch it created), one row of the opposite direction with the same item, batch, quantity, unit, department, reference type and reference id.
- Each such row carries `reason = 'Void of <code>: <reason>'`.
- Bulk back: the finished product's ledger On hand rises by the issue's `fp_qty_consumed`, and the batch's "left to pack" figure rises by the same.
- Materials back: the item ledger and each purchase batch's `live_remaining_qty` rise by what was drawn from it.
- Packed count back: `finished_product_batches.packaged_qty` falls by the issue's `unit_count` (Store/R&D issues; Production issues never added to it).

Ledger rows an issue makes (latest definitions):
- `fp_packaging_pull` pull of the FP item, `reference_id = issue.id` — trg_fn_packaging_transform_and_issue, 0068_production_rm_full_qc.sql:L268-L272 (Production) and L324-L329 (Store/R&D).
- Store/R&D: `packaged_fp_yield` push and `packaged_fp_issue` pull, `reference_id = issue.id` — 0068 after L329.
- Production: `production_rm_yield` push with **no** `production_batch_id` (0068:L274-L277); a `production_issue_batches` row (L284-L291); `qc_sample` / `stability_sample` / `rnd_sample` pulls with `production_batch_id` set (L293-L313).
- Materials: `packaging` pulls, FIFO per purchase batch with `purchase_line_id`, `reference_id = packaging_issue_id`, plus one batch-less pull for any remainder — trg_fn_packaging_item_pull, 0079_packaging_fp_integrity.sql:L122-L170 (latest definition), which also lowers `live_remaining_qty` (L154).
- Packed count: trg_fn_packaging_pull adds `±unit_count` to `packaged_qty` for non-Production issues — 0050_production_rm_from_packaging.sql (latest definition).

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0127_void_review_fixes.sql:L102-L145
  v_note := left('Void of ' || coalesce(v_issue.code, 'packaging issue') || ': ' || v_reason, 500);
  for r in
    select l.* from public.inventory_ledger l
     where (l.reference_id = p_id
            and l.reference_type in ('packaging', 'fp_packaging_pull', 'packaged_fp_yield', 'packaged_fp_issue', 'production_rm_yield'))
        or (l.production_batch_id is not null
            and l.production_batch_id in (select pb.id from public.production_issue_batches pb where pb.packaging_issue_id = p_id))
     order by (l.event_type = 'pull') desc, l.seq
  loop
    if r.reference_type = 'production_rm_yield' and r.production_batch_id is null then
      -- reverse it batch by batch, each for its own quantity (pb.quantity)
      ...
      continue;
    end if;
    insert into public.inventory_ledger (...) values
      (case r.event_type when 'pull' then 'push' else 'pull' end,
       r.item_id, r.purchase_line_id, r.production_batch_id,
       r.quantity, r.unit, r.department, r.reference_type, r.reference_id, auth.uid(), v_note);
    if r.reference_type = 'packaging' and r.event_type = 'pull' and r.purchase_line_id is not null then
      update public.purchase_lines set live_remaining_qty = live_remaining_qty + r.quantity where id = r.purchase_line_id;
      if (<latest QC record of that purchase line>) = 'rejected' then
        insert ... ('pull', ..., 'qc_rejected', r.purchase_line_id, auth.uid(), v_note);
      end if;
    end if;
  end loop;
```
```sql
-- 0127:L147-L153  packed count
  if v_issue.department <> 'production' then
    update public.finished_product_batches
       set packaged_qty = packaged_qty
             - case v_issue.transaction_type when 'unpack' then -v_issue.unit_count else v_issue.unit_count end
     where id = v_issue.finished_product_batch_id;
  end if;
-- 0127:L172-L175  bulk sums
  update public.packaging_issues
     set active = false, voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
         voided_fp_qty = fp_qty_consumed, fp_qty_consumed = null
   where id = p_id;
```
- The selection covers every reference type the issue triggers write with `reference_id = issue.id`, plus every row on the RM-FP batch (samples, later QC samples, `qc_rejected` moves), so nothing the issue made is left unreversed. A row matching both conditions is returned once.
- Same item, batch, quantity, unit, department, reference type and reference id are copied (L131-L133); only the direction, `event_by` and `reason` change.
- Order: pulls are reversed first (L111), so the packaged-FP push/pull pair and the RM-FP yield never take an item below zero mid-transaction.
- Reason text: `'Void of ' || code || ': ' || reason`, cut at 500 characters (L102), on every inserted row (L123, L133, L142).
- Everything runs in one function call, so it is all-or-nothing.

---

**Paths walked:**
- Store / R&D issue with batch-linked materials: `packaging` pulls → pushes, `live_remaining_qty` restored (L134-L135); `fp_packaging_pull` → push (bulk back in the ledger); `packaged_fp_issue` → push, then `packaged_fp_yield` → pull (net 0 packaged stock, as before the issue); `packaged_qty -= unit_count` (L148-L153); `fp_qty_consumed` → null so `fp_bulk_left`, `fp_batch_packing_options`, `trg_fn_packaging_batch_balance` give the bulk back (REQ-03). ✓
- Material remainder drawn with no purchase batch (0079:L163-L168): reversed as a batch-less push (L127-L133); no `live_remaining_qty` to restore. ✓
- Material returned to a purchase batch QC has since rejected: push + `live_remaining_qty` restored, then an extra `qc_rejected` pull of the same quantity (L138-L143), so it does not reappear as usable On hand. Stock Integrity S2 excludes `qc_rejected` rows (0122_integrity_s9_net_receipt.sql:L36), and trg_fn_qc_rejected_stock never lowers `live_remaining_qty` on rejection (0119:L312-L369), so this stays consistent; a later rejection void pushes back the whole `qc_rejected` net (0119:L355-L367). ✓ (one extra row, see verdict)
- Production issue: `fp_packaging_pull` → push (bulk back); sample pulls on the RM-FP batch → pushes; the batch-less `production_rm_yield` push → one pull per RM-FP batch for `pb.quantity` (L113-L125). 0068:L277 and L288 write the yield and `pb.quantity` with the same value (`fp_qty_consumed`), so the RM item nets to 0. No `packaged_qty` change (Production never added to it). RM-FP batch set to `live_remaining_qty = 0, active = false` (L156-L159). ✓
- Legacy `unpack` issue: the original trigger subtracted `unit_count`; the void adds it back (L151). `repack`/`pack` subtract. ✓
- Production issue whose RM-FP batch was used → refused before any write (L88-L100; REQ-04). ✓
- Opening-stock packaging issue (0101): same rows, same reversal; a later `undo_opening_load` deletes ledger rows by `reference_id` (0104_rejected_materials.sql:L348), which includes the void rows, so it stays consistent. ✓

---

**Searched:**
- `'packaging'` ledger inserts → 0002:L68, 0027:L91, 0033:L120, 0079:L157, L167: all use `reference_id` = the issue id. Latest `trg_fn_packaging_item_pull` = 0079.
- `fp_packaging_pull|packaged_fp_yield|packaged_fp_issue|production_rm_yield` inserts → latest `trg_fn_packaging_transform_and_issue` = 0068 (also 0032/0033/0050/0063, superseded). All use `reference_id = new.id`.
- `create or replace function public.trg_fn_packaging_pull` → 0002, 0027, 0050 (latest).
- `inventory_ledger_reference_type_check` → latest 0104:L39-L47; every type the void writes is in it.
- Triggers on `inventory_ledger` → audit (0072:L252-L258, update/delete only) and `trg_00_unit_ledger` (0076:L294-L296, unit check; the void copies the original unit). No trigger lowers `live_remaining_qty` on insert, so the manual restore at L135 is not doubled.
- `ledger_no_direct_write` (0001:L368): clients cannot insert ledger rows; the SECURITY DEFINER void can.

---

**How the verdict was reached:** every movement the issue made is selected and reversed with the same attributes and the required reason, and bulk (ledger and per-batch figure), materials (ledger and purchase batch remaining) and packed count are each put back on every department path, including legacy and opening-stock issues. Two departures from "one opposite row per movement" are deliberate and correct: the batch-less RM yield row is reversed per RM-FP batch (one row today, since an issue makes one batch), and a since-rejected purchase batch gets an extra `qc_rejected` row. The same bullet's 0127 note describes the second ("material returned to a since-rejected batch is booked back out as QC rejected"). Neither is a behaviour gap, so the verdict is `implemented`, not `stronger-than-spec`.

---

**Open questions:**
- The rejected check reads only the latest QC record of the purchase line (0127:L138-L139). If a newer non-rejected record (for example a retest started in `submitted`) sits on top of an earlier rejection, the returned material would count as usable. Whether a rejected purchase line can get a newer QC record was not established here.
- If the FP batch has since stopped being `approved` (for example a rejected FP retest, 0120), the bulk goes back to the FP item's ledger On hand while Stock Integrity S7 counts only approved batches (0122:L110-L124). Finished product is "never in the ledger" for `qc_rejected` (0119:L324-L326), so this follows the existing model, but it was not tested.
