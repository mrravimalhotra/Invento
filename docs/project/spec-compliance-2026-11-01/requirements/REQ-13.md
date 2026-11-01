## REQ-13 — Round 1 results on the COA template; reason of at least 3 characters everywhere

> "Round 1 types the result of every test on the COA template (raw material from a vendor and finished product; not Production raw material) into `checker_results`; approving needs every result and a COA template to exist, a rejection needs only the reason. Every decision in both rounds needs a reason of at least 3 characters (screen, action and `trg_fn_qc_enforce_review_stages`)."
> — docs/modules/qc.md · bullet 2 (0119)

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. Scope: a QC record on a purchase line (vendor raw material) or a finished product batch records results; a QC record on a production batch (RM-FP) does not.
2. Round 1 approval (`submitted -> checker_approved`) requires a COA template to exist and a non-blank result for every one of its tests, stored in `quality_checks.checker_results`.
3. Round 1 rejection (`submitted -> checker_rejected`) needs only the reason; results optional.
4. Every decision in both rounds (Round 1 approve/reject, Round 2 approve/reject/confirm, and by the same bullet's wording also send-back and void) needs a trimmed reason of at least 3 characters, enforced in three layers: screen, server action, and the trigger `trg_fn_qc_enforce_review_stages`.

---

**Where enforcement lives:**

Latest trigger definition is `supabase/migrations/0126_void_packaging_issue.sql:L29-L150` (0119 and 0054 earlier versions are superseded; no later migration redefines it). Trigger is `before update` only (`supabase/migrations/0054_qc_two_round_review.sql:L120-L122`).

```sql
-- supabase/migrations/0126_void_packaging_issue.sql:L33, L59-L78
v_needs_results boolean := (new.purchase_line_id is not null or new.finished_product_batch_id is not null);
...
if old.status = 'submitted' and new.status in ('checker_approved', 'checker_rejected') then
  ...
  if length(btrim(coalesce(new.checker_comments, ''))) < 3 then
    raise exception 'A reason is required for the first QC decision.';
  if new.status = 'checker_approved' and v_needs_results
     and not public._qc_results_valid(new.checker_results, true) then
    raise exception 'Enter the result of every test on the COA template before approving.';
```
- Reason length >= 3 after trim: Round 1 L63-L65, send-back L94-L96, Round 2 approve/reject L106-L108, void L128-L130. All four decision kinds covered in the database.
- Results: `_qc_results_valid(p, true)` (`supabase/migrations/0119_qc_results_reasons_rejection.sql:L69-L82`) checks only shape: non-empty array of objects, non-blank `test` and `specification`, every `result` non-blank and <= 500 chars. It does **not** compare the list with the COA template, and does **not** check that a COA template exists.
- Results can change only with a decision (L49-L56); Round 1 cannot set `reviewer_results` (L74-L76).

```ts
// lib/actions/qc.ts:L141-L176 (reviewQcRound1)
const reasonProblem = reasonError(checkerComments, "A reason");          // L141
const template = await loadQcTemplate(supabase, existing);               // L156
if (template.needsResults) { ...
  if (status === "checker_approved") {
    if (template.lines.length === 0) return { error: "This item has no COA template yet..." }  // L162-L166
    const checked = checkResultsAgainstTemplate(submitted, template.lines, true);              // L167
```
- `reasonError` (`lib/qc-results.ts:L11-L15`) trims and requires `MIN_REASON_CHARS = 3` (`lib/qc-results.ts:L7`). Used for Round 1 (`lib/actions/qc.ts:L141`), Round 2 (L215), send-back (L356), void (L381).
- `loadQcTemplate` (`lib/qc-template.ts:L19-L46`): `needsResults` is true for a purchase line or FP batch, false otherwise (production batch) — L35, L45.
- `checkResultsAgainstTemplate` (`lib/qc-results.ts:L48-L72`) requires same length, same seq/test/specification in order, non-blank results when `requireAll`; stores the template's own test/spec text.
- Rejection: results kept only if any typed (`lib/actions/qc.ts:L170-L175`), otherwise `checker_results` null.

Screen:
- `app/(dashboard)/qc/[id]/qc-checker-form.tsx:L38-L40` blocks approve when the template is missing or any result is blank; L48-L62 shows the grid / the "no COA template" notice with a link to `addHref`; L80-L88 reason textarea `required minLength={MIN_REASON_CHARS}`; L39, L112, L118 disable submit when `reason.trim()` is short.
- Round 2: `app/(dashboard)/qc/[id]/qc-reviewer-form.tsx:L59, L100-L110, L185, L191`.
- Confirm / send-back / void: `app/(dashboard)/qc/[id]/qc-rejection-forms.tsx:L55-L57, L75-L83`, void form from L91.

---

**Paths walked:**
- Screen → `reviewQcRound1` → UPDATE → trigger, vendor raw material, approve with all results: template loaded, checked, stored; trigger shape-check passes. ✓
- Same, no COA template: screen blocks (checker-form L40), action refuses (qc.ts L162). Trigger would refuse only because the action sends `checker_results: null` (empty array fails `_qc_results_valid`). ✓ via app.
- Same, reject with reason only: action L170 leaves results null; trigger L70 skips the check when null. ✓
- Production RM-FP record: `needsResults` false (qc-template.ts L35), `v_needs_results` false (0126 L33); approve with reason only. ✓
- Reason < 3 chars, any decision, any layer: refused in screen, action, and trigger (L63, L94, L106, L128). ✓
- Direct client UPDATE (PostgREST, as a `quality_checker`, allowed by `qc_update` policy `supabase/migrations/0001_init.sql:L317-L319`) with `status='checker_approved'` and an arbitrary non-empty list (e.g. one invented test) on a vendor raw material whose item has **no** COA template, or whose list does not match the template: trigger accepts (shape only). ✗ — "a COA template to exist" and "every test on the COA template" are application-only.
- Direct client INSERT into `quality_checks` with `status='checker_approved'` / `'approved'` and no reason or results: the review-stage trigger is `before update` only; the INSERT triggers (`trg_00_lock_batch_qc`, `trg_qc_compute_retest_date`, `trg_qc_sample_pull`, `trg_00_qc_production_batch_active`, `trg_qc_rejected_stock`) do not check status, and `qc_insert` (`supabase/migrations/0003_fixes.sql:L12-L13`) checks only role. ✗ — no database rule stops a record being born past Round 1 (see Open questions; this also bears on REQ-16).

---

**Searched:**
- `create or replace function public.trg_fn_qc_enforce_review_stages` → 3 definitions: 0054:L91, 0119:L132, 0126:L29 (latest; none in 0127)
- `trg_qc_enforce_review_stages` trigger → 0054:L120 `before update` only
- `_qc_results_valid` → defined only in 0119:L69; used only in 0126 (and superseded 0119 trigger)
- `checker_results|reviewer_results` in lib/app/migrations → `lib/qc-results.ts`, `lib/actions/qc.ts`, `lib/actions/coa.ts`, `app/(dashboard)/qc/[id]/page.tsx`, `app/(dashboard)/coa/new/page.tsx`, migrations 0119/0126/0127
- `coa_template` references in the trigger → 0 hits (no template-existence or template-match check in the database)
- triggers `on public.quality_checks` in `supabase/fresh-install.sql` → 12; INSERT-firing ones: lock_batch_qc, compute_retest_date, sample_pull, production_batch_active, rejected_stock, audit; none raises on status
- `policy qc_insert` → 0001:L315, 0003:L12 (latest, role only); `policy qc_update` → 0001:L317 only
- `revoke insert ... quality_checks` / column grants → 0 hits (revokes in 0075/0113/0114 are views only)
- `MIN_REASON_CHARS|reasonError` → `lib/qc-results.ts:L7,L11`; used in qc.ts L141/L215/L356/L381 and the three form files
- DB tests: `supabase/tests/part_qr119_qc_results.sql` L35-L47 (Round 1 reason and results), L129 (FP results required), L107-L116 (Production / pre-0119 records) — all via UPDATE; no INSERT-with-decided-status case

---

**How the verdict was reached:** The reason rule holds exactly as written in all three layers for every decision type, and the scope rule (vendor RM and FP, not production RM) is identical in the action and the trigger. The results rule holds on every app path. It is `partial`, not `implemented`, because the document's "approving needs every result and a COA template to exist" is enforced against the template only in the action; the database checks the list's shape, not that a template exists or that the list is the template's. It is not `contradicted` because no app path produces a non-compliant record. Severity medium: reaching the gap needs a QC role and a hand-made API call (gated), but in a GMP system it lets a Round 1 approval carry results that do not correspond to the specification; the certificate then treats them as stale (`lib/actions/coa.ts:L169-L180`) and lets results be typed, so the damage is to the QC record, not silently to the COA.

**Open questions:**
- The INSERT path: can `authenticated` insert `quality_checks` with `status` other than `submitted`? Based on the searches above nothing refuses it; a one-line DB test (insert as `quality_checker` with `status='approved'`) would settle it. If confirmed, it bypasses both rounds, not just this requirement.
- The document says "both rounds"; send-back and void are not "rounds" strictly, but they are covered anyway, so no ambiguity in effect.
