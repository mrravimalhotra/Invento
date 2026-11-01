## REQ-06 — Only approved finished-product batches can be issued; departments production, R&D, store

> "Only **approved** finished-product batches can be issued. Departments: production, R&D, store."
> — docs/modules/packaging.md · Current behaviour, bullet 3 (L8)

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. A `packaging_issues` row can be created only when its `finished_product_batch_id` is in status `approved` (the batch's own status, which `trg_qc_review_finished_product` syncs from its latest QC record, 0120_finished_product_retest.sql:L245-L247).
2. `department` is one of `production`, `rnd`, `store`, and nothing else.

**Where enforcement lives:**

Departments: database, action and screen.
```sql
-- supabase/migrations/0001_init.sql:L558
department text not null check (department in ('production','rnd','store')),
```
- Never dropped or replaced (no `packaging_issues_department` hit in any later migration). `create_packaging_issues()` further limits the multi-line path to `store`/`rnd` (0093_packaging_multi_line.sql:L39-L41); `create_production_issues()` hard-codes `production` (0095_production_multi_line.sql:L80).
- Action: `DEPARTMENTS = ["production", "rnd", "store"]` (lib/constants/units.ts:L79), checked at lib/actions/packaging.ts:L216; the form lists the same constant (app/(dashboard)/packaging/packaging-form.tsx:L64-L68).

Approved only: screen and action; the database enforces it only for a batch that is already `approved`.
```sql
-- 0120_finished_product_retest.sql:L552-L573 (fp_batch_packing_options, read by app/(dashboard)/packaging/new/page.tsx:L27)
 where fpb.active and fpb.status = 'approved'
   and public.fp_batch_block_reason(fpb.id) is null;
```
```ts
// lib/actions/packaging.ts:L172-L178 (resolveFpBatch, called for every line: L299 Store/R&D, L366 Production)
const { data: blockReason } = await supabase.rpc("fp_batch_block_reason", { p_batch: fpBatchId });
if (blockReason) return { error: blockReason as string };
if (resolveDisplayStatus(fpBatch.status, latestQcRow) !== "approved") {
  return { error: "Packaging can only be issued against an Approved finished product batch." };
}
```
```sql
-- 0120_finished_product_retest.sql:L65-L73 (fp_batch_block_reason, called by trg_fn_packaging_batch_balance at L429-L433)
select batch_number, status into b from public.finished_product_batches where id = p_batch;
if not found or b.status <> 'approved' then
  return null;   -- other states are refused by their own checks
end if;
```
- The only database guard that looks at the batch (`trg_00_packaging_batch_balance`, latest body 0120:L409-L468) refuses an approved batch that is expired, past retest or under retest, and refuses more than the batch's yield left. For a batch in any other status `fp_batch_block_reason` returns null, and nothing else checks status: the comment "other states are refused by their own checks" has no matching check.
- The three triggers on `packaging_issues` (fresh-install.sql:L741 `trg_packaging_pull`, L3416 `trg_packaging_transform_and_issue`, L11057 `trg_00_packaging_batch_balance`) — none reads `finished_product_batches.status`. `trg_fn_packaging_transform_and_issue` (latest 0068_production_rm_full_qc.sql:L216-L330) checks only item-level stock (`check_sufficient_stock(v_fp_item_id, ...)`, L270).

**Paths walked:**
- Screen → action → RPC with an approved batch → accepted. ✓
- Screen with a non-approved batch → not listed by the view. ✓
- Action with a forged non-approved batch id → refused at lib/actions/packaging.ts:L174. ✓
- Department outside the three → refused by the CHECK (0001:L558) and the action (L216). ✓
- Direct RPC `create_packaging_issue` / `create_packaging_issues` / `create_production_issues` (all SECURITY INVOKER, granted to `authenticated`: 0092:L68-L69, 0093:L80-L81, 0095), or a direct `insert` under `packaging_insert` (0001:L568-L569, roles system_admin, inventory_manager, mfr_manager), with a batch whose status is `draft`, `in_process`, `complete_awaiting_qc`, `submitted_to_qc`, `rejected` or `cancelled` (status set from 0047_fp_batch_complete_awaiting_qc.sql:L58-L59) → `fp_batch_block_reason` returns null; the yield check passes if the batch has a `batch_yield` with bulk left, or is skipped when `batch_yield` is null (0120:L443-L445); item-level stock passes if other approved batches of the same product hold stock → row saved, stock moved, and for Production an RM-FP batch created. ✗ — the gap.
- Concrete case: a batch approved, then rejected on retest. Its yield went into finished-product stock at approval (0120:L249-L262) and finished-product rejections never move ledger stock (`trg_fn_qc_rejected_stock` returns early for finished product, 0119_qc_results_reasons_rejection.sql:L324-L326). A direct call can pack or issue the rejected batch up to its remaining yield.
- `fpb.active = false` batches: excluded by the view, but neither the action (`resolveFpBatch` reads no `active`, L150-L171) nor the database checks it. Not demanded by this sentence; noted only.

**Searched:**
- `create trigger ... on public.packaging_issues` in fresh-install.sql → 3 triggers (L741, L3416, L11057); `update on|delete on|for each` variants → none more.
- `status <> 'approved'|!= 'approved'|distinct from 'approved'|not approved|be approved` in migrations → hits concern purchase-line consumption (0026, 0050, 0068, 0075, 0078, 0098), FP QC sync (0030, 0120:L249) and `fp_batch_block_reason` (0120:L72, L81); none on a packaging insert path for a non-approved batch.
- `approved` with `pack` in migrations → 0050 comment, `check_batch_qc_approved` (purchase lines), 0114/0120 view, 0120:L64 block reason; no status guard on packaging.
- `_is_direct_client_write` in migrations → 0070, 0086, 0109, 0112; none for `packaging_issues`.
- `policy` on `packaging_issues` → `packaging_select`, `packaging_insert` (role only) in 0001; never replaced.
- `packaging_issues_department|alter table public.packaging_issues` → no change to the department CHECK after 0001.
- `approved` in supabase/tests/p_packaging.sql, part_vp126, part_vr127 → set-up rows only; no test that the database refuses a non-approved batch (the action-only rule has no database test).

**How the verdict was reached:** the department half is fully enforced, by the database first. The approved-only half holds on every path through the app (view + action), and the database refuses approved batches that are expired or under retest, but the database accepts any batch that is not `approved` at all. It is `partial`, not `contradicted`, because the documented screen and action behave as written; the gap is the missing database guard that CLAUDE.md's model (workflow guards are triggers) expects. Severity medium: it needs a packaging role and a hand-made API call outside the app, and the action is a second mechanism on the normal path; but the consequence (packing a rejected or untested batch) is the GMP control the sentence exists for, and the in-code comment at 0120:L72 claims a guard that does not exist, so the next reader will believe it does.

**Open questions:**
- Should `trg_fn_packaging_batch_balance` (or `fp_batch_block_reason`) refuse any batch whose status is not `approved`, except opening-stock loads (`opening_load_id` set)? This is a safety fix to a workflow rule, so per CLAUDE.md it needs Ravi's decision.
- Should an inactive (`active = false`) batch also be refused by the action and the database, as the view already does?
