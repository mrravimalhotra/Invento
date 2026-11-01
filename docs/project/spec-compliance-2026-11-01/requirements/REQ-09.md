## REQ-09 — Packaging materials FIFO from purchase batches; batch on every ledger row

> "Packaging materials come out of their purchase batches **oldest first (FIFO)** and every ledger row records its batch."
> — docs/modules/packaging.md · Current behaviour, bullet 6

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. For each packaging-material line, quantity is drawn from that item's purchase batches (`purchase_lines`) in age order, oldest first, reducing each batch's `live_remaining_qty`.
2. Every `inventory_ledger` row the material pull writes carries `purchase_line_id` (the batch).
3. The opposite rows a void writes keep the same batch.

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0079_packaging_fp_integrity.sql:L138-L168 (latest trg_fn_packaging_item_pull)
perform public.check_sufficient_stock(new.item_id, new.quantity);
v_left := new.quantity;
for r in select pl.id, pl.live_remaining_qty from public.purchase_lines pl
  where pl.item_id = new.item_id and pl.active and pl.pushed_at is not null and pl.live_remaining_qty > 0
  order by pl.created_at, pl.id for update
loop
  exit when v_left <= 0;
  v_take := least(r.live_remaining_qty, v_left);
  update public.purchase_lines set live_remaining_qty = live_remaining_qty - v_take where id = r.id;
  insert into public.inventory_ledger (event_type, item_id, purchase_line_id, ...) values ('pull', new.item_id, r.id, v_take, ...);
  v_left := v_left - v_take;
end loop;
if v_left > 0 then
  -- Stock not held in any batch (e.g. an opening balance): taken from the item as before.
  insert into public.inventory_ledger (event_type, item_id, quantity, ...) values ('pull', new.item_id, v_left, ...);   -- no purchase_line_id
end if;
```
- Trigger `trg_packaging_item_pull`, `after insert on packaging_issue_items` (0027:L94-L96); function last defined in 0079 (no later `create or replace`).
- Database only; the screen picks no batch (USER_GUIDE.md:L698 "taken from their purchase batches oldest first").
- Age = `purchase_lines.created_at`; for opening stock this is set to the batch's real receipt date (0100:L12-L13).
- Void: `void_packaging_issue` copies `r.purchase_line_id` onto each opposite row and adds the quantity back to that batch (0127:L127-L135). ✓

---

**Paths walked:**
- Material quantity fully covered by batches: one pull per batch touched, each with `purchase_line_id`, oldest first. ✓ Tested: `supabase/tests/p_packaging.sql` "jars FIFO: J1 30 → 0, J2 100 → 90" and "each jar movement records its batch (30 from J1, 10 from J2)".
- Item stock larger than the sum of batch `live_remaining_qty` (stock pushed to the ledger without a purchase line): `check_sufficient_stock` passes on item stock, the loop runs out, and L161-L168 writes a pull with `purchase_line_id` null. ✗ against "every ledger row records its batch". The module doc's own dated section says so: "Any part not covered by a batch is still taken from item stock" (docs/modules/packaging.md:L529-L531). Whether this branch is reachable today depends on whether any packaging item has ledger stock outside a purchase line; after go-live opening stock goes in as purchase lines (0100:L9-L12), so it is mainly older/test data.
- Batch eligibility: the loop has no QC-status, retest or expiry filter (contrast the raw-material FIFO rule, 0110:L56-L85, which requires `qc_status = 'approved'` and not expired). Packaging needs no QC (0100:L21; docs/modules/qc.md:L225, L302), so this matches intent. But a QC-rejected line keeps its `live_remaining_qty` (0104:L28), and 0127:L136-L143 already handles material returned to a packaging batch "QC has since rejected", so the authors consider a QC record on a packaging line possible. If one exists and is rejected, FIFO draws from it first while the physical stock came from a good batch. Not established as reachable (see open questions).
- Concurrency: `for update` on the candidate purchase lines (L149) serialises two issues of the same item. ✓
- Other ledger rows a Store/R&D issue writes (bulk `fp_packaging_pull`, `packaged_fp_yield`, `packaged_fp_issue`, 0068) carry no batch column; the finished-product batch is reachable only through `reference_id` → `packaging_issues.finished_product_batch_id`. The bullet is about packaging materials, so this is read as out of scope; recorded because the words "every ledger row" are broader.

---

**Searched:**
- `packaging_item_pull` in migrations → 0027:L79 (fn), L94-L96 (trigger), 0033:L106, 0079:L122 (latest). No later definition.
- `fifo` (case-insensitive) in migrations → 0090, 0098, 0110 (`trg_fn_fp_component_fifo`, raw material only, on `finished_product_components`), 0114:L216, 0100:L12; none redefines the packaging pull.
- `trg_fn_qc_rejected_stock` → 0104:L51, 0119:L312 (latest); moves rejected stock out by a `qc_rejected` ledger row, leaves `live_remaining_qty` unchanged (0104:L28).
- `category = 'packaging'` / "needs no QC" refusal on `quality_checks` → 0 hits in migrations (no database rule stopping a QC record on a packaging line).
- `purchase_line_id` on void rows → 0127:L128-L133 copies it. ✓
- Tests: `supabase/tests/p_packaging.sql` L55-L60 (FIFO and batch per row). No test of the uncovered-remainder branch or of a rejected packaging batch.

---

**How the verdict was reached:** FIFO is implemented at the database on every path (trigger on the line insert) and the batch is recorded on every batch-covered row and on void reversals. One branch writes a ledger row with no batch, in the same function, by design; the document's dated section admits it while the current-behaviour bullet says "every". So `partial`, not `contradicted`: the main behaviour holds and the gap is a residual branch. Severity low: the branch only runs when item stock exceeds batch stock, which after go-live opening stock should not happen, and the row is still a correct item-level movement; the consequence is a traceability hole (a pull no batch accounts for), not wrong quantities. The fix is either in the document ("every row covered by a batch records it") or in the code (refuse when batches don't cover the quantity) — Ravi's call.

**Open questions:**
- Can a `quality_checks` row be created for a packaging-material purchase line (screens filter `item_category = 'raw'`, 0077:L17; no database refusal found)? If yes, the packaging FIFO should skip rejected lines as the raw-material rule does.
- Is there any packaging item today whose ledger stock exceeds the sum of its batches' `live_remaining_qty` (would make the no-batch branch live)? A read-only check could go in `scripts/sql/`.
