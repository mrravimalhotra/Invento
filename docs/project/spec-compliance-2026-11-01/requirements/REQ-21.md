## REQ-21 — Rejected raw material leaves On hand automatically

> "Rejected raw material leaves On hand automatically."
> — docs/modules/qc.md · bullet 10

**Verdict:** implemented · confidence: high

---

**What this demands of an implementation:** when a raw-material QC record (purchase batch or Production RM-FP
batch) reaches the final `rejected` status, the quantity still held in that batch stops counting in On hand
(`item_position.on_hand`) without anyone posting a movement by hand, on every path that can produce `rejected`.

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0119_qc_results_reasons_rejection.sql:L313-L377 (latest definition; first in 0104:L51-L108)
if new.purchase_line_id is null and new.production_batch_id is null then return new; end if;  -- FP: not in the ledger
select sum(pull - push) into v_net from inventory_ledger where reference_type = 'qc_rejected' and <same batch>;
if new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
  if v_net > 0 then return new; end if;            -- already out
  select live_remaining_qty ... (purchase line must be pushed_at is not null)
  if coalesce(v_remaining, 0) > 0 then
    insert into inventory_ledger ('pull', ..., v_remaining, ..., 'qc_rejected', ...);
elsif (new.status = 'approved' or (UPDATE and old.status = 'rejected' and new.status = 'submitted')) and v_net > 0 then
  insert into inventory_ledger ('push', ..., v_net, ..., 'qc_rejected', ...);   -- comes back on approval / void

create trigger trg_qc_rejected_stock after insert or update of status on public.quality_checks
  for each row when (new.status in ('rejected', 'approved', 'submitted')) execute function public.trg_fn_qc_rejected_stock();
```
- SECURITY DEFINER trigger, so it runs whatever the caller's grants.
- On hand is the ledger sum (`item_position`, latest 0126:L286) and the `qc_rejected` pull is also reported in the
  `rejected` column (0126:L297-L299), so On hand = breakdown still holds.
- `live_remaining_qty` is intentionally not reduced (0104:L27-L29); consumption of the batch is blocked separately by
  the QC gate (`check_batch_qc_approved`).
- Database layer only; no app code posts the movement (the app only reads it).

---

**Paths walked:**
- Round 2 confirms a proposed rejection (`checker_rejected` → `rejected`, `trg_fn_qc_enforce_review_stages`
  0126:L81-L120): UPDATE of status fires the trigger → pull of remaining qty. ✓
- Round 1 proposal (`checker_rejected`): WHEN clause excludes it, stock stays — consistent with "Reviewer confirms
  (stock leaves On hand)" in REQ-15. ✓
- Rejection of a retest record: same path; remaining qty is after the retest stock sample was taken. ✓
- Production RM-FP batch rejected: `production_batch_id` branch reads `production_issue_batches.live_remaining_qty`. ✓
- Opening stock loaded as Rejected (`load_opening_stock`, 0100:L304-L311): INSERT with status `rejected`; the line
  is pushed first (0100:L260), so the pull is posted. ✓ Pre-0104 rejected batches: backfill at end of 0104. ✓
- Purchase line not pushed at rejection (`pushed_at is null` → no pull): not reachable while QC exists, because
  `reopen_purchase_order` (latest 0112) refuses a PO with any QC record on its batches or a `qc_rejected` row. ✓
- Rejection voided (`rejected` → `submitted`) or a rejected batch later approved: push of `v_net` restores On hand. ✓
- Wastage against a rejected batch: returns the quantity then writes it off, On hand unchanged (0104 header L17-L19;
  tested rj104 L49-L51). ✓
- Finished product: returns early (L323-L325); FP rejection is handled by the FP batch status, out of scope here.

---

**Searched:**
- `function public.trg_fn_qc_rejected_stock` → 0104, 0119 (latest).
- `trg_qc_rejected_stock` trigger → 0104:L109-L111, 0119:L370-L375 (latest).
- `qc_rejected` in tests → rejected_materials_0104.sql, stock_statement_0107.sql, stock_statement_labels_0111.sql;
  rj104 L32-L42 (94 on hand → 0 after rejection, one pull of 94, live remaining stays 94). Expected line
  `rj104 38 0`, `qr119 60 0` in supabase/tests/expected.txt.
- `view public.item_position` latest → 0126 (security_invoker, `rejected` column L297-L299).
- `function public.reopen_purchase_order` latest → 0112; refusals at its L30-L34 (rejected) and L62-L67 (QC started).
- "On hand" in app → balance/stock-position, rejected tab, rm-report, stock-integrity: all read `item_position` /
  ledger. The item page's batch table shows `live_remaining_qty` labelled "Remaining now"
  (`app/(dashboard)/inventory/items/[id]/purchase-batches-table.tsx:L59-L62`), not "On hand".

---

**How the verdict was reached:** every path that sets `rejected` on a raw-material QC record goes through the
after-insert/update trigger, which posts the pull in the same transaction, and the reachable no-op branch
(`pushed_at is null`) cannot occur while a QC record exists. Hence `implemented`, not `partial`.

**Open questions:**
- The item page's "Remaining now" column still shows a rejected batch's full quantity (by design, 0104:L27-L29);
  whether readers confuse it with On hand is a documentation/UX question, not a divergence.
