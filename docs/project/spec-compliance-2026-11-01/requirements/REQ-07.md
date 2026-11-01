## REQ-07 — Packaging issue saved in one step; limited to what is left of the batch

> "An issue and its packaging-material lines are saved in **one step** (`create_packaging_issue()`); an issue is limited to what is left of that batch (yield less samples, less earlier issues)."
> — docs/modules/packaging.md · Current behaviour, bullet 4

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. One step: a packaging issue header (`packaging_issues`) and its material lines (`packaging_issue_items`) are written in one transaction, all or nothing, and no issue exists with only part of its lines.
2. Batch limit: for each new issue, `fp_qty_consumed` ≤ (`batch_yield` − QC − stability − R&D samples) × unit factor − sum of `fp_qty_consumed` of earlier issues on the same finished-product batch.

---

**Where enforcement lives:**

One step (latest definitions):
```sql
-- supabase/migrations/0092_packaging_issue_date.sql:L24-L66  (latest create_packaging_issue)
insert into public.packaging_issues (...) values (...) returning id into v_id;
for m in select * from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) loop
  insert into public.packaging_issue_items (packaging_issue_id, item_id, quantity, unit) values (v_id, ...);
end loop;
```
- One plpgsql function = one transaction; an error in any material line (e.g. `check_sufficient_stock` in `trg_fn_packaging_item_pull`, 0079:L138) rolls back the header too.
- `security invoker` (0092:L27): the caller's RLS applies.
- Wrappers the app actually calls: `create_packaging_issues` (Store/R&D, 0093:L24-L78, ≤30 lines, each line via `create_packaging_issue`) and `create_production_issues` (Production, 0095:L25-L93, ≤30 lines, no materials). Both loop inside one function, so all lines are one transaction. Neither is redefined later (grep below).
- Server action: `lib/actions/packaging.ts:L334` (`rpc("create_packaging_issues")`) and `:L413` (`rpc("create_production_issues")`); no direct `.from("packaging_issues").insert` anywhere in `lib/` or `app/`.

Batch limit (latest definition):
```sql
-- supabase/migrations/0120_finished_product_retest.sql:L437-L469 (trg_fn_packaging_batch_balance)
select ..., coalesce(qc_sample_qty,0)+coalesce(stability_qty,0)+coalesce(rnd_qty,0)+coalesce(retest_sample_qty,0) as samples
  ... for update of fpb;
if v_batch.batch_yield is null then return new; end if;
select coalesce(sum(fp_qty_consumed),0) into v_issued from packaging_issues
 where finished_product_batch_id = new.finished_product_batch_id and id is distinct from new.id;
v_left := (batch_yield - samples) * v_factor - v_issued;
if new.fp_qty_consumed > v_left + 0.0000001 then raise exception 'Not enough stock for batch % ...' using errcode='P0001';
```
- Trigger `trg_00_packaging_batch_balance` is `before insert on packaging_issues` (0079:L114-L117), so it runs on every insert path, the RPCs and a direct insert alike.
- Row lock on the FP batch (L445) serialises concurrent issues; lines in one save see each other (tested, `supabase/tests/p_packaging.sql` "two lines that fit alone but not together").
- Updates of `fp_qty_consumed` are not re-checked, but clients cannot update: `packaging_issues` has only select and insert policies (0001_init.sql:L567-L569); the only writer that updates it is `void_packaging_issue` (0127:L172-L175), which sets `fp_qty_consumed = null` (moved to `voided_fp_qty`), so a voided issue drops out of `v_issued`.
- Additionally (beyond the document): retest samples are subtracted (0120:L439), and an expired / retest-overdue / retest-open batch is refused (0120:L430-L433).
- Screen/action layer: the New page shows the free quantity from `fp_batch_packing_options` (0114:L177) and the action pre-checks the batch (`lib/actions/packaging.ts:L145-L205`), but the database is the binding check.

---

**Paths walked:**
- Store/R&D form → `createPackagingIssue` → `saveStoreRndIssues` → `create_packaging_issues` → `create_packaging_issue` per line → header insert (batch-balance trigger) → item inserts (FIFO pull trigger). One transaction. ✓
- Production form → `saveProductionIssues` → `create_production_issues` → `create_packaging_issue` with `'[]'` materials. One transaction. ✓
- Direct PostgREST `insert into packaging_issues` by a `system_admin` / `inventory_manager` / `mfr_manager` (policy `packaging_insert`, 0001:L568-L569). Batch-balance trigger fires ✓; but a header is saved with no material lines, i.e. not "one step" with its materials. ✗ (Tests themselves insert headers directly as `authenticated`: `supabase/tests/part_fr120_fp_retest.sql:L124`.)
- Direct PostgREST `insert into packaging_issue_items` for any existing `packaging_issue_id` by the same roles (policy `packaging_issue_items_insert`, 0027:L27-L28). No trigger checks the parent: only `trg_00_unit_packaging_item` (0076:L262-L265, unit conversion) and `trg_packaging_item_pull` (0027:L94-L96 → 0079:L122-L170, stock pull). Materials can be added to an issue saved days earlier, or to a **voided** issue; `void_packaging_issue` refuses a second void (0127:L83-L85), so those later pulls are never reversed. ✗
- Batch limit with `batch_yield is null` (0120:L447-L449): skipped. Reachable only for legacy rows; submitting a FP batch to QC requires a yield (0099:L90), and only approved batches are offered. Acceptable, recorded.

---

**Searched:**
- `create_packaging_issue` in migrations → defined 0079:L175, 0092:L24 (latest); called from 0093:L58, 0095:L73. No later redefinition.
- `create_packaging_issues|create_production_issues` → only 0093 and 0095.
- `packaging_batch_balance` → 0079:L60 (fn), L114-L117 (trigger), 0094:L37, 0120:L409 (latest fn). Trigger never redefined after 0079.
- `on public.packaging_issue_items` → 0027 policies L24/L27, trigger L95; 0076:L262-L264 unit trigger; 0087 indexes. No guard on the parent's state.
- `packaging_issue_items` in 011x–012x migrations → 0115:L126 (item-category guard), 0116:L49/L85 (quantity limit). None about voided or existing parents.
- `_is_direct_client_write` with `packag` → 0 hits (no direct-write guard on packaging tables).
- `revoke.*on public.packaging_issue` → 0 hits (table grants untouched).
- Policies on `packaging_issues` in `fresh-install.sql` → L586 select, L587 insert only; no update/delete policy.
- App writes: `from("packaging_issues")` in `lib/`, `app/` → only `app/(dashboard)/packaging/page.tsx:L30` (select). No direct insert.
- Tests: `supabase/tests/p_packaging.sql` covers all-or-nothing (500 jars refused, nothing left behind), over-yield refusal, exact remainder, 30-line cap. No test of a direct material-line insert onto an existing or voided issue.

---

**How the verdict was reached:** The batch limit is implemented at the database on every insert path (and goes further: retest samples, block reasons). The one-step property holds on every path the app uses, but the database does not require it: RLS lets the three write roles insert a header alone or add material lines to any existing issue, including a voided one, where the stock taken is never put back by the void. That makes it `partial`, not `contradicted` (the documented function does what is said) and not `implemented` (the guarantee the bullet gives, "an issue and its lines are saved in one step", is a property of one function, not of the data). Severity medium: it needs one of three internal write roles and a hand-made API call; nothing in the app reaches it; the consequence (stock pulled against a closed or voided issue, never reversed by a void) is real but auditable in the ledger.

**Open questions:**
- Should `packaging_issue_items` refuse inserts outside `create_packaging_issue` (e.g. a `_is_direct_client_write()` guard, or refuse when the parent is voided or not created in the same transaction)? Changing who can write is a core-behaviour decision for Ravi.
- The document names `create_packaging_issue()`; the screens call the wrappers `create_packaging_issues` / `create_production_issues`. Accurate in substance; the doc could name the wrappers.
