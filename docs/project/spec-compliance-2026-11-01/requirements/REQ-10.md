## REQ-10 — New packaging issue page reads `fp_batch_packing_options`, same figure the database enforces

> "The New packaging issue page reads one database view, `fp_batch_packing_options`: approved batches with product name, unit and the quantity still free to pack or issue (the same figure the database enforces)."
> — docs/modules/packaging.md · bullet 8

**Verdict:** implemented · confidence: high

**What this demands of an implementation:**
1. `app/(dashboard)/packaging/new/page.tsx` gets its batch list from the view `fp_batch_packing_options` alone (no per-batch reads of batches, quality checks and issues).
2. The view returns only approved batches, with product name, product unit and a "left" quantity.
3. That left quantity equals what the save-time guard (`trg_fn_packaging_batch_balance`, latest definition) allows: `(batch_yield − qc_sample − stability − rnd − retest_sample) × unit factor − Σ fp_qty_consumed of other issues`, in the finished product's unit, with voided issues excluded on both sides.

**Where enforcement lives:**

```sql
-- supabase/migrations/0120_finished_product_retest.sql:L552-L574 (latest definition of the view)
create or replace view public.fp_batch_packing_options with (security_invoker = on) as
select fpb.id, fpb.batch_number, fpb.short_batch_no, fpb.status, fpb.is_legacy,
       it.name as fp_name, it.unit as fp_unit,
       case when fpb.batch_yield is null then null
            else greatest((fpb.batch_yield - qc_sample - stability - rnd - retest_sample)
                   * coalesce(convert_unit(1, fpb.unit, coalesce(it.unit, fpb.unit)), 1)
                   - coalesce(iss.issued, 0), 0) end as left_qty
  ... left join (select finished_product_batch_id, sum(fp_qty_consumed) as issued from packaging_issues group by 1) iss ...
 where fpb.active and fpb.status = 'approved' and public.fp_batch_block_reason(fpb.id) is null;
```

```sql
-- supabase/migrations/0120_finished_product_retest.sql:L430-L469 (latest trg_fn_packaging_batch_balance; earlier 0079, 0094)
v_block := case when new.opening_load_id is null then public.fp_batch_block_reason(new.finished_product_batch_id) end;  -- L430
... samples := qc_sample_qty + stability_qty + rnd_qty + retest_sample_qty ...                                         -- L438-L439
v_factor := coalesce(public.convert_unit(1, v_batch.unit, coalesce(v_fp_unit, v_batch.unit)), 1);                       -- L454
select coalesce(sum(fp_qty_consumed), 0) into v_issued ... and id is distinct from new.id;                              -- L456-L459
v_left := (v_batch.batch_yield - v_batch.samples) * v_factor - v_issued;                                                -- L461
if new.fp_qty_consumed > v_left + 0.0000001 then raise exception 'Not enough stock for batch % ...'                     -- L463-L468
```

- The view's formula and the trigger's formula are term-for-term the same: same four sample columns, same unit factor, same sum over `packaging_issues.fp_qty_consumed`. The view clamps at 0 (`greatest(…, 0)`); the trigger's message also clamps (`greatest(v_left, 0)`, L466).
- Voided issues: `void_packaging_issue()` sets `voided_fp_qty = fp_qty_consumed, fp_qty_consumed = null` (0126:L402; latest definition 0127_void_review_fixes.sql:L174), so both sums skip a voided issue without either being rewritten.
- Blocked batches: the view hides a batch for which `fp_batch_block_reason()` is non-null (expired, past retest date, retest in progress; 0120:L65-L91); the trigger refuses the same batches (L430-L433). The page therefore never offers a batch the database would refuse for that reason.
- Access: `security_invoker = on`; `packaging_issues`, `finished_product_batches` and `items` all have `for select using (public.is_signed_in())` (fresh-install.sql:L586, L513, L179), so the caller's RLS cannot hide issues and inflate `left_qty`. `anon` has no right; `authenticated` has select only (0120:L576-L578).

**Screen layer:**
- `app/(dashboard)/packaging/new/page.tsx:L24-L32` reads only `fp_batch_packing_options` (id, batch_number, short_batch_no, is_legacy, fp_name, fp_unit, left_qty), paged with `fetchAllRows` and ending `.order("id")`. The other reads on the page are packaging-material items and their `stock_balance` (L33-L51), not batch data.
- `left_qty` is passed through unchanged (L63) and used as the live limit in `packaging-lines-editor.tsx:L119-L120` (Store/R&D, subtracting earlier lines on the same batch) and `packaging-production-lines-editor.tsx:L76` (Production). These are advisory; the trigger is the guard.

**Paths walked:**
- Store/R&D save → `create_packaging_issues` (0093) → `create_packaging_issue` per line → insert into `packaging_issues` → `trg_00_packaging_batch_balance` (before insert) → same formula as view. ✓ Lines on the same batch are checked one after another inside one transaction, which the screen mirrors by subtracting earlier lines.
- Production save → `create_production_issues` (0095) → `create_packaging_issue` per line → same trigger. ✓
- Batch with `batch_yield is null`: view returns `left_qty = null`; trigger returns without a batch check (L447-L449); screen treats null as "no limit". Consistent. ✓
- Batch not approved or inactive: absent from the view. Approval itself is enforced elsewhere (REQ-06), not by this trigger.

**Searched:**
- `fp_batch_packing_options` in `supabase/migrations/*.sql` → 3 files: 0114 (first definition), 0120 (latest, L552), 0126 (comment only, L11).
- `fp_batch_packing_options` in app/lib/components → 1 file, `app/(dashboard)/packaging/new/page.tsx` (L20 comment, L27 read).
- `function public.trg_fn_packaging_batch_balance` → 0079, 0094, 0120; 0120 is latest.
- `voided_fp_qty|fp_qty_consumed` in 0126/0127 → void moves bulk to `voided_fp_qty` (0126:L402, 0127:L174).
- RLS select policies on `packaging_issues`, `finished_product_batches`, `items` in fresh-install.sql → all `is_signed_in()`, no later replacement found.
- `left_qty` in app → page.tsx, packaging-lines-editor.tsx, packaging-production-lines-editor.tsx only.
- Tests: `supabase/tests/part_rl114_reliability.sql:L91-L105` (name/unit, 20 − 0.5 − 5 = 14.5, issue 14.5 → 0, not-approved hidden, privileges); `part_fr120_fp_retest.sql:L67` (blocked batch hidden), `L122` (retest samples taken off: 54.5 L).

**How the verdict was reached:** the page reads exactly one view for its batch list, the view's columns are those named, and its quantity formula matches the save-time trigger term for term, including how voided issues and blocked batches are handled. Regression tests pin the figure. The view is stricter than the bullet's literal "approved batches" (it also drops expired/retest-due/retest-in-progress and inactive batches), but those are batches the database would refuse anyway and docs/modules/packaging.md:L573 records it, so this is not stronger-than-spec.

**Document problem:** the module doc cites "migration 0114" for the view; the definition in force is 0120 (adds `retest_sample_qty` and the block-reason filter). Low; fix belongs in the doc.

**Open questions:**
- None blocking. The trigger skips the block check for opening-stock rows (`opening_load_id is not null`, L430); those rows are not created from this page.
