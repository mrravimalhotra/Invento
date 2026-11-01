## REQ-03 — A voided issue stays listed as Void, drops out of bulk sums and Batch Trace; item_position nets both ways

> "A voided issue stays on the list struck through with a Void badge; its bulk used moves to `voided_fp_qty`, so every bulk sum skips it; `active = false` hides it from Batch Trace; `item_position` counts each movement type both ways."
> — docs/modules/packaging.md · bullet 1 (Void)

**Verdict:** partial · confidence: high

---

**What this demands of an implementation:**
1. The Packaging list still shows a voided issue, its code struck through, with a "Void" badge.
2. On void, `fp_qty_consumed` is moved to `voided_fp_qty`, and every database view/function and screen that sums bulk used (`packaging_issues.fp_qty_consumed`) leaves the voided issue out.
3. `active = false` on the issue, and Batch Trace shows no voided issue on any path.
4. `item_position` counts each ledger movement type in both directions, so the void's opposite rows reduce the bucket they came from (and Stock Integrity S1 stays balanced).

---

**Where enforcement lives:**

(1) List
- app/(dashboard)/packaging/page.tsx:L28-L38 reads every `packaging_issues` row (paged with `fetchAllRows`, ends with `.order("id")`) with no `active`/`voided_at` filter, so voided issues stay listed.
- packaging-table.tsx:L76: Code cell `line-through` when `voided_at`; L123-L138: `<Badge status="voided">Void</Badge>` with bulk returned, date, voider and reason; L153-L160: the other cells greyed. Excel (L183) and PDF (page.tsx:L63) carry the void text.

(2) Bulk sums
```sql
-- 0127_void_review_fixes.sql:L172-L175
  update public.packaging_issues
     set active = false, voided_at = now(), voided_by = auth.uid(), void_reason = v_reason,
         voided_fp_qty = fp_qty_consumed, fp_qty_consumed = null
   where id = p_id;
```
`fp_qty_consumed` may be null (`packaging_fp_qty_consumed_positive`, 0032:L125; `packaging_sample_qty_not_exceed_consumed` starts with `fp_qty_consumed is null or`, 0068:L72-L78), so the update is allowed. Every sum of the column, at its latest definition:

| Object | Latest | Line | Skips the voided issue? |
|---|---|---|---|
| `fp_bulk_left()` | 0120 | L51-L62 (`sum(pi.fp_qty_consumed)`) | ✓ (null ignored) |
| `trg_fn_packaging_batch_balance()` (issue limit) | 0120 | L456-L459 | ✓ |
| `batch_ageing` view | 0120 | L530-L534 | ✓ |
| `fp_batch_packing_options` view | 0120 | L570-L572 | ✓ |
| `stock_integrity_check()` S7 | 0122 | L116-L117 | ✓ |
| Finished product batch page | app/(dashboard)/finished-product/[id]/page.tsx | L177 (`filter(!voided_at)` and `fp_qty_consumed ?? 0`) | ✓ (both) |
| My Tasks | app/(dashboard)/my-tasks.ts | L45 (`.is("voided_at", null)`) | ✓ |
| Hand-run checks | scripts/sql/live-data-checks.sql | L512, L828, L859, L943 | ✓ (null ignored / `coalesce(...,0) > 0`) |

(3) Batch Trace
```sql
-- 0126_void_packaging_issue.sql:L180-L185 and L237-L240 (latest _trace_fwd)
   where l.purchase_line_id = p_id and l.reference_type = 'packaging' and l.event_type = 'pull' and pi.active
...
      select pi.id from public.packaging_issues pi
       where pi.finished_product_batch_id = p_id and pi.active
```
```sql
-- 0106_batch_trace.sql:L140-L152 (latest _trace_back; never redefined)
  elsif p_kind = 'production' then
    for r in
      select pi.id as issue_id, pi.finished_product_batch_id as fp_id
        from public.production_issue_batches pb
        join public.packaging_issues pi on pi.id = pb.packaging_issue_id
       where pb.id = p_id
    loop
      return query select * from public._trace_issue_node(r.issue_id, p_depth, 'backward', 'Made in packaging issue');
      return query select * from public._trace_fp_node(r.fp_id, p_depth + 1, 'backward', 'Bulk finished product used', null);
```
- `_trace_back('production', …)` has no `pi.active` filter. `_trace_production_node` (0106:L71-L82) and `_trace_issue_node` (0106:L102-L113) have none either, and neither shows a Void marker.

(4) item_position
- 0126_void_packaging_issue.sql:L263-L302: each bucket adds one direction and subtracts the other for its reference type(s): received (purchase), yielded (fp_yield), held_qc (qc, qc_sample), held_stability, held_rnd, consumed_by_fp (finished_product pull / fp_draft_cancelled push), issued_packaging (packaging), consumed_by_packaging (fp_packaging_pull), packaged_yield, issued_store / issued_rnd (packaged_fp_issue by department), production_rm_yield, rejected (qc_rejected). `wastage` is its own event type and one-way. `security_invoker = on` restored at L306. Stock Integrity S1 (0122:L23-L31) uses these buckets.
- Every reference type the void writes (`packaging`, `fp_packaging_pull`, `packaged_fp_yield`, `packaged_fp_issue`, `production_rm_yield`, the three sample types, `qc_rejected`) is in a two-way bucket. ✓

---

**Paths walked:**
- Packaging list after a void → row present, Code struck through, Void badge. ✓
- New packaging issue against the same FP batch → `trg_fn_packaging_batch_balance` sums non-null `fp_qty_consumed` only, so the voided bulk is free again; `fp_batch_packing_options.left_qty` shows the same. ✓
- Ageing, Stock Integrity S7, FP batch page, My Tasks → all skip it. ✓
- Batch Trace from the FP batch (`fp` root) → `_trace_fwd` L237-L240 skips the issue and so its RM-FP batch and materials. ✓ (suite vp126 L112)
- Batch Trace from a packaging-material purchase batch → `_trace_fwd` L180-L185 skips it. ✓ (vp126 L113)
- Batch Trace from the **voided RM-FP batch** itself (`production` root) → the Batch Trace search lists production batches with no `active` filter (app/(dashboard)/inventory/(tabs)/batch-trace/page.tsx:L64-L71); `trace_batch` (0106:L266-L281) calls `_trace_back('production', …)`, which lists the voided issue as "Made in packaging issue", shown with "bulk used —" (its `fp_qty_consumed` is now null, 0106:L108) and no Void marker, then the FP batch and its raw materials. ✗ — the gap.
- Stock Position after a void → buckets net to what they were before the issue; S1 balanced. ✓
- A user with the insert role (System Admin, Inventory Manager, MFR Manager) writes a `packaging_issues` row directly through PostgREST with `voided_at` (and/or `active = false`, `voided_fp_qty`) already set → allowed: `packaging_insert` (0001_init.sql:L568-L569) checks only the role, the before-insert trigger `trg_00_packaging_batch_balance` checks only quantity, and no trigger or constraint stops the void columns being set on insert. The after-insert triggers still take the stock (0068, 0079), `fp_qty_consumed` still counts in every bulk sum, yet the list shows the row struck through as Void, and `void_packaging_issue()` then refuses it as "already void" (0127:L83-L85). ✗ — a second gap. It is not reachable from the app's own screens: the action builds the RPC payload with explicit fields (lib/actions/packaging.ts:L322, L404) and `create_packaging_issue` inserts a fixed column list (0092_packaging_issue_date.sql:L41).

---

**Searched:**
- `fp_qty_consumed` in supabase/migrations → 0032, 0033, 0050, 0063, 0068, 0079, 0092-0095, 0101, 0106, 0110, 0114, 0118, 0120, 0122, 0126, 0127. Summing objects resolved to their latest definitions: `fp_bulk_left` (0120), `trg_fn_packaging_batch_balance` (0079, 0094, 0120 → 0120), `batch_ageing` (0108, 0110, 0120 → 0120), `fp_batch_packing_options` (0114, 0120 → 0120), `stock_integrity_check` (0114, 0118, 0120, 0122 → 0122). None redefined in 0123-0127.
- `fp_qty_consumed` in lib/, app/, components/, scripts/ → actions/packaging.ts:L144, L322, L404 (writes); packaging-table.tsx:L37, L51-L53 (display); packaging/page.tsx:L32 (select); finished-product/[id]/page.tsx:L151, L162, L177, L398-L399; scripts/sql/live-data-checks.sql (6 hits, all null-safe).
- `packaging_issues` in app/ and lib/ → packaging/page.tsx:L30, finished-product/[id]/page.tsx:L161, my-tasks.ts:L45, inventory/items/[id]/page.tsx:L198 (embed only), ledger-enrich.ts:L112 (labels only), actions/packaging.ts:L334 (RPC). No other sum.
- `create or replace function public._trace_*` → `_trace_fwd` 0106, 0126 (latest 0126); `_trace_back`, `_trace_issue_node`, `_trace_production_node`, `_trace_fp_node`, `trace_batch` 0106 only.
- `pi.active` in 0126 → L184, L239 (both in `_trace_fwd`); 0 hits in `_trace_back`.
- `trace_batch(` in supabase/tests/part_vp126_void_packaging.sql → L23, L26, L112, L113: `fp` and `purchase` roots only; no test traces from a `production` root.
- Policies and triggers on `packaging_issues` (fresh-install.sql) → `packaging_select`, `packaging_insert` (L586-L587); triggers `trg_packaging_pull` (L740), `trg_packaging_transform_and_issue` (L3415), `trg_00_packaging_batch_balance` (L11056); audit trigger via 0072:L190. None looks at `voided_at`/`voided_fp_qty`/`active`.
- `revoke insert` on tables → 0075:L110 and 0113:L120 apply to views only; table INSERT for `authenticated` is governed by RLS alone.
- `create or replace view public.item_position` → 0031, 0032, 0050, 0083, 0104, 0126 (latest 0126).

---

**How the verdict was reached:** three of the four clauses hold everywhere they were checked: the list display, every bulk sum (database and screen), and the two-way `item_position`. The Batch Trace clause holds for the `fp` and `purchase` roots, which the regression suite tests, but not for the `production` root, where `_trace_back` never checks `pi.active` and the voided RM-FP batch stays searchable. That makes it `partial`, not `contradicted`. Separately, the Void state is only a set of columns that a direct INSERT can set, so the "Void" badge and "skipped by every bulk sum" are not tied together for rows that did not go through `void_packaging_issue()`.

Severity: medium. The trace gap shows a voided issue as a real origin on a GMP traceability screen, without a Void label (low on its own: it needs someone to trace the voided batch). The insert gap needs a user with an insert role (System Admin, Inventory Manager, MFR Manager) making a direct API call. What they get is a packaging record that shows as Void while its stock movement stands and cannot be reversed with the void function. No stock moves the wrong way, but the record misstates what happened, and the record is what an auditor reads.

---

**Open questions:**
- Whether showing a voided RM-FP batch's origin in a backward trace is intended (it is useful history). If it is, the document should say "hidden from Batch Trace except when tracing the voided RM-FP batch itself", and the trace should label the issue as Void.
- Suggested database fix for the insert gap (not made: read-only run): a before-insert check that `voided_at`, `voided_by`, `void_reason` and `voided_fp_qty` are null and `active` is true, or column-level INSERT privileges.
