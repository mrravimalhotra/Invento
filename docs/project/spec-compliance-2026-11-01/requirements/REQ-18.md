## REQ-18 — Retest cannot extend expiry, expired batches not retested, FP retest cycle, retest within expiry

> "A retest cannot set a later expiry than the batch was last approved with, and an expired batch is not retested. Finished product has the same retest cycle (180 days, 3 retests, last retest only an expiry date, `start_fp_retest()`). A retest period may never run past the expiry date, for every batch type (Round 2 message and trigger `trg_qc_retest_within_expiry`)."
> — docs/modules/qc.md · Current behaviour, bullets 5-6

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. Approving a retest with `expiry_date` later than the `expiry_date` of the batch's latest earlier `approved` QC record is refused.
2. A retest cannot start when the latest approval's `expiry_date < today`.
3. Finished product batches go through the same cycle as raw material: 180-day max period, 3 retests, no period on the last, started by `start_fp_retest()`.
4. For raw material (purchase), Production raw material and finished product, `approval date + retest_period_days <= expiry_date`. The Round 2 action refuses it with a message and the trigger `trg_qc_retest_within_expiry` refuses it in the database.

**Where enforcement lives:**

(1) No later expiry. App only.
```ts
// lib/actions/qc.ts:L274-L295
if (status === "approved" && existing.is_retest) {
  ... .from("quality_checks").select("expiry_date").eq(col, batchId).neq("id", id).eq("status", "approved")
      .order("created_at", { ascending: false }).limit(1);
  if (originalExpiry && expiryRaw > originalExpiry) return { error: "A retest cannot extend the expiry date. ..." };
```
Screen: `app/(dashboard)/qc/[id]/page.tsx:L99-L108` sets `maxExpiry` to the same date, and `qc-reviewer-form.tsx:L119` sets it as the input `max`, with the hint at L124-L126. Database: `supabase/migrations/0112_qc_integrity_and_coa_company.sql:L10-L12` says this rule "is in the app". No trigger checks it.

(2) Expired batches not retested. Database:
```sql
-- 0112_qc_integrity_and_coa_company.sql:L259-L262  (start_retest: purchase + Production RM; latest definition, 0114:L215 only sets timezone)
if v_latest.expiry_date is not null and v_latest.expiry_date < current_date then
  raise exception 'Batch % expired on %, so it can''t be retested. ...' using errcode = 'P0001';
-- 0120_finished_product_retest.sql:L159-L162  (start_fp_retest), same check
```
Both are SECURITY DEFINER RPCs and the only paths that create an `is_retest` record from the app (`lib/actions/qc.ts:L452-L463`). The FP due card view also excludes expired batches (`0120:L379`).

(3) FP cycle. `start_fp_retest()` exists (`0120:L115-L207`): approved + not expired + retest date arrived, sample from stability reserve then bulk. 180 days / 3 retests / final-retest rules come from the shared Round 2 action (`lib/actions/qc.ts:L257-L302`, with `countRetestsDone` reading `finished_product_batch_id`, `lib/qc-retests.ts:L11-L16`) and `startRetest` (L447-L451, called by `startFpRetestQualityCheck` L420-L426). Card: `app/(dashboard)/qc/fp-due-for-retest.tsx`. These are app-only, as in REQ-17 (0120:L6-L7: "applied in the QC screen").

(4) Retest within expiry:
```sql
-- 0120_finished_product_retest.sql:L327-L347
if new.retest_period_days is not null and new.expiry_date is not null then
  v_retest := (coalesce(new.reviewed_at, now()) at time zone 'Asia/Kolkata')::date + new.retest_period_days;
  if v_retest > new.expiry_date then raise exception 'The retest date (%) would fall after the expiry date (%). ...' ...
create trigger trg_qc_retest_within_expiry before update on public.quality_checks for each row
  when (new.status = 'approved' and old.status is distinct from 'approved') ...
```
App: `lib/actions/qc.ts:L303-L312` uses the same message and base date (`todayIst()` vs `reviewed_at` in IST, matching `trg_fn_qc_compute_retest_date`, `0081_india_time_zone.sql:L49-L54`). Screen: `qc-reviewer-form.tsx:L54-L58, L158-L162`.

**Paths walked:**
- Round 2 approval of any batch type through the app: the action refuses a period past the expiry (L305-L311), and the trigger refuses it again on the UPDATE. ✓ Covered by `supabase/tests/part_fr120_fp_retest.sql:L92-L93` (180 days vs 100-day expiry refused, 60 accepted).
- Round 2 retest approval with a later expiry through the app: refused at L290. ✓ Direct PostgREST UPDATE by a QC Reviewer (RLS `qc_update`, `0001_init.sql:L317-L319`): no DB check, accepted. ✗
- Start retest on an expired RM / Production RM / FP batch: raised in the RPC whatever the caller. ✓
- Expiry falls between the last approval and the retest date: the batch is never due for retest because the DB refuses a retest date past the expiry, so (2) and (4) together hold. ✓
- **Edit after approval:** the stage trigger lets a same-status UPDATE through whenever results are unchanged (`0126_void_packaging_issue.sql:L50-L56`). `trg_qc_retest_within_expiry` fires only on the transition *into* `approved` (0120:L346). So a direct `update quality_checks set retest_period_days = 400` (or `expiry_date = <earlier>`, or `expiry_date = <later>`) on an already approved row is accepted, `retest_date` is recomputed past the expiry, and nothing in the database refuses it. ✗ It needs a QC role using the API outside the app; the app has no screen that edits an approved record.
- **Opening stock, raw material** (`load_opening_stock`, only definition `0100_opening_stock.sql:L138`; rows inserted approved at L304-L312): retest date required and after the approval date (L285-L288), expiry required (L289-L291), but **no check that retest date <= expiry**. The trigger is BEFORE UPDATE only, so this INSERT never reaches it. App validator `lib/opening-stock/validate.ts:L201-L204` likewise checks only `retest <= appr`. ✗ A raw-material opening-stock row with a retest date after its expiry is accepted. Only System Admin can load, and only while opening stock is open (`set_opening_stock_open`, 0100:L107).
- Opening stock, finished product (`load_opening_finished_product`, latest `0120:L828`): `v_retest > v_exp` refused (L928-L930); app `validate.ts:L324`. ✓
- Opening stock RM, 3 retests already done: DB requires a retest date for every approved row (0100:L286-L287), so a batch loaded with `retests_done = 3` must carry a further retest date, which contradicts "last retest only an expiry date". The FP loader refuses that combination (0120:L931-L933, `validate.ts:L333-L334`), the RM loader does not. The app then refuses the 4th retest via `startRetest` count (qc.ts L448-L451). ✗ (minor, legacy path)

**Searched:**
- `trg_qc_retest_within_expiry` -> defined only in 0120 L342-L347; test suite `part_fr120_fp_retest.sql`.
- `start_fp_retest|start_retest` in migrations -> start_retest 0080 L180, 0112 L196 (latest body), 0114 L215 (timezone only); start_fp_retest 0120 L115 only.
- `expired on|expiry_date < current_date` in migrations -> 0098 consumption gates L114/L139, 0112 L259, 0120 L84 (block reason) and L159.
- `later expiry|cannot extend|originalExpiry|maxExpiry` -> qc.ts L271-L295, page.tsx L84-L108, qc-reviewer-form.tsx L34/L119/L124; 0112 L11 (comment "in the app"); no SQL check.
- `retest_date|retest_period_days` in `load_opening_stock` (0100) -> L285-L312; no comparison with `v_expiry`.
- `expiry` in `lib/opening-stock/validate.ts` -> L182-L184 (RM expiry vs receipt), L324 (FP retest vs expiry); no RM retest-vs-expiry check.
- Same-status update branch of `trg_fn_qc_enforce_review_stages` (latest 0126 L29) -> L50-L56 returns `new` without inspecting expiry or period.
- `policy .* quality_checks` -> `qc_update` 0001 L317-L319, not redefined.

**How the verdict was reached:** All four clauses hold on every path through the app. Two of them, "expired batch is not retested" and "retest period within expiry" on the approval transition, are enforced in the database as the document says. So it is not `contradicted`. It is `partial` for three reasons. "For every batch type" fails on the raw-material opening-stock loader, which inserts approved records with no retest-vs-expiry check in either layer. The trigger misses any edit of an already approved record. "Cannot set a later expiry" and the FP 180 / 3 / final-retest cycle are app-only, and QC roles can bypass them through direct writes that RLS allows. Severity medium: every gap needs a privileged role (System Admin for opening stock, a QC role for direct writes), and the opening-stock window can be closed. The consequence is a released GMP batch whose next retest falls after its expiry, so it can be consumed until expiry without being due for retest, or whose expiry is extended past what the last approval allowed.

**Document problems:** The parenthetical "(Round 2 message and trigger `trg_qc_retest_within_expiry`)" reads as if the trigger guards every write of a retest period. It guards only the transition into `approved`, and not opening-stock inserts. "Finished product has the same retest cycle (... `start_fp_retest()`)" cites the RPC as if it enforced the cycle, but `start_fp_retest()` checks only approved / not expired / retest date arrived. The 180 / 3 / final-retest rules are in `lib/actions/qc.ts`.

**Open questions:**
- Should `trg_qc_retest_within_expiry` also fire on updates of `expiry_date` / `retest_period_days` on approved rows, and on INSERT (opening stock)? Or should approved QC records be immutable apart from status transitions?
- Is the RM opening-stock loader meant to reject a retest date after the expiry and, like the FP loader, a retest date with 3 retests done? The FP loader (0120) was updated, the RM loader (0100) was not.
