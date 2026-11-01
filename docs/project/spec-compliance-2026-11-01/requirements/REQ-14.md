## REQ-14 — Reviewer result edits stored in `reviewer_results`, final, and used by the certificate

> "The QC Reviewer may edit the results: any change is stored whole in `reviewer_results` and is final, no change leaves Round 1's results standing; the certificate uses `reviewer_results` when present."
> — docs/modules/qc.md · bullet 2 (0119)

**Verdict:** partial · confidence: high

**What this demands of an implementation:**
1. At Round 2 the QC Reviewer can change Round 1 results.
2. If any result differs, the full list (all tests, not a diff) is written to `quality_checks.reviewer_results`; `checker_results` stays.
3. If nothing differs, `reviewer_results` stays null and `checker_results` are the final results.
4. "Final": once decided, neither list changes.
5. The Certificate of Analysis takes `reviewer_results` when not null, else `checker_results`.

---

**Where enforcement lives:**

```ts
// lib/actions/qc.ts:L245-L253 (reviewQcRound2)
let reviewerResults: QcResultLine[] | null = null;
const round1 = (existing.checker_results ?? null) as QcResultLine[] | null;
if (round1 && existing.status === "checker_approved") {
  const submitted = parseResultLines(String(formData.get("results") || "[]"));
  ...
  const checked = checkResultsAgainstTemplate(submitted, round1, status === "approved");
  if (!checked.ok) return { error: checked.error };
  if (resultsDiffer(checked.lines, round1)) reviewerResults = checked.lines;
}
```
- Compared against Round 1's own list (same seq/test/specification, `lib/qc-results.ts:L48-L72`), so the stored list is whole and test/spec text cannot be changed. `resultsDiffer` (`lib/qc-results.ts:L75-L78`) compares trimmed results; no difference → null. Written at `lib/actions/qc.ts:L331`.
- `finalResults` (`lib/qc-results.ts:L81-L86`): `reviewer_results ?? checker_results`.

```sql
-- supabase/migrations/0126_void_packaging_issue.sql:L49-L56, L109-L119 (latest definition)
if new.status = old.status then
  if new.checker_results is distinct from old.checker_results
     or new.reviewer_results is distinct from old.reviewer_results then
    raise exception 'Test results can only be saved together with a QC decision.';
...
if new.reviewer_results is not null then
  if old.checker_results is null then raise exception 'This record has no first-round results to edit.';
  if not public._qc_results_valid(new.reviewer_results, new.status = 'approved') then ...
  if jsonb_array_length(new.reviewer_results) <> jsonb_array_length(old.checker_results) then ...
```
- Finality: results cannot change without a status change (L49-L56); `approved` has no outgoing transition (falls to L149 "cannot move"); Round 1 cannot set `reviewer_results` (L74-L76). The only transitions that touch the lists afterwards are send-back (L98-L99) and void of a rejection (L143), which clear both — both are on non-approved records and the history keeps them.
- History: `trg_fn_qc_decision_history` (`supabase/migrations/0127_void_review_fixes.sql:L38, L41`) stores `coalesce(reviewer_results, checker_results)` with `results_edited = reviewer_results is not null`.

Certificate:
```ts
// lib/actions/coa.ts:L169-L180 (generateCoaCertificate)
const qcFinal = finalResults(qc);
const qcMatchesTemplate = !!qcFinal && qcFinal.length === templateLines.length && qcFinal.every(... same seq/test/spec ...);
if (qcMatchesTemplate && qcFinal) {
  for (...) if (resultLines[i].result.trim() !== qcFinal[i].result.trim())
    return { error: `The result for "..." comes from the QC record and cannot be changed here...` };
```
- Page pre-fills and locks the same list: `app/(dashboard)/coa/new/page.tsx:L84-L95` (`finalResults`, stale check), `app/(dashboard)/coa/new/generate-coa-form.tsx:L53, L96-L107, L130`.
- QC page shows "Final test results" from `finalResults` with Round 1 values beside changed ones: `app/(dashboard)/qc/[id]/page.tsx:L161, L338-L348`.
- Screen edit grid: `app/(dashboard)/qc/[id]/qc-reviewer-form.tsx:L42, L61, L67-L78` (shown only when Round 1 results exist).

---

**Paths walked:**
- Reviewer approves `checker_approved` record, edits one result → full list in `reviewer_results`; trigger checks shape + count. ✓
- Reviewer approves, edits nothing → `reviewer_results` null; certificate uses `checker_results`. ✓
- Reviewer rejects a `checker_approved` record with edits → stored (requireAll false). ✓
- Reviewer confirms a proposed rejection (`checker_rejected`) → action skips the edit block (L247 requires `checker_approved`); no edit possible on screen (`qc-rejection-forms.tsx` has no grid). Document says "may edit" without restricting; a rejected batch never gets a COA, so no consequence. ✓ (narrower than wording, harmless)
- Record approved before 0119 (no `checker_results`) → no edit; trigger refuses an edit (L110-L112); certificate types results. ✓ (documented)
- COA generated for approved record, final results match the current template → locked to `reviewer_results ?? checker_results`. ✓
- COA generated after the COA template was changed since QC (`qcMatchesTemplate` false) → results typed freely; `reviewer_results` not used. ✗ against the qc.md wording; this exception is stated in `docs/modules/coa.md:L7` and on screen (`generate-coa-form.tsx:L102-L107`), but not in qc.md.
- Direct client INSERT into `coa_records` (policy `coa_insert`, `supabase/migrations/0001_init.sql:L609-L610`, roles system_admin / quality_checker / qc_reviewer) with any `result_lines`: the only insert trigger, `trg_fn_coa_current_approval` (`supabase/fresh-install.sql:L11680-L11704`), checks current approval only. ✗ — "the certificate uses `reviewer_results`" is enforced only in the server action.
- Direct client UPDATE as `qc_reviewer` approving with a `reviewer_results` list of the right length but different test/specification text, or identical to `checker_results`: trigger accepts (count and shape only). The certificate then sees a mismatch → stale → typed results; or records `results_edited = true` with no change. ✗ (application-only rule)

---

**Searched:**
- `reviewer_results` → app: `lib/qc-results.ts`, `lib/actions/qc.ts` (L233 select, L331 write), `lib/actions/coa.ts` (L82, L90), `app/(dashboard)/qc/[id]/page.tsx` (L44, L344, L348), `app/(dashboard)/coa/new/page.tsx` (L86-L89); migrations 0119, 0126, 0127
- `finalResults` → `lib/qc-results.ts:L81`; used in `lib/actions/coa.ts:L169`, `app/(dashboard)/coa/new/page.tsx:L89`, `app/(dashboard)/qc/[id]/page.tsx:L161`
- `resultsDiffer` → `lib/qc-results.ts:L75`, `lib/actions/qc.ts:L252`
- triggers / policies on `coa_records` → `coa_select`, `coa_insert` (0001:L608-L610, role only), `trg_coa_current_approval` (before insert, current-approval only); no update policy; 0 hits comparing `result_lines` with `quality_checks`
- `result_lines` in migrations vs `checker_results` → 0 joint references
- DB tests: `supabase/tests/part_qr119_qc_results.sql` L52-L58 (edit stored, both kept, history `results_edited`), L116 (no edit without Round 1 results)
- `template changed|earlier version` in docs → `docs/modules/coa.md:L7` (exception documented); not in `docs/modules/qc.md`

---

**How the verdict was reached:** Every app path behaves exactly as written: whole-list storage, null on no change, immutability after the decision (database-enforced), and the certificate locked to `reviewer_results ?? checker_results`. It is `partial` because (a) "the certificate uses `reviewer_results`" and "no change leaves Round 1's results standing" are enforced only in server actions, so a QC-role user calling PostgREST directly can issue a COA with other results or store a no-op/renamed `reviewer_results`; and (b) the stale-template path deliberately skips `reviewer_results`, which qc.md omits. Not `contradicted`: no normal path diverges. Severity medium: gated by a QC role and a hand-made API call, but the COA is the released GMP record, and nothing in the database ties it to the QC results.

**Open questions:**
- Is it intended that a template change after QC lets the COA ignore QC's final results? If yes, qc.md should say so (as coa.md does); if no, the certificate should refuse instead of falling back to typing.
- Should a Reviewer be able to edit results when confirming a proposed rejection? Today he cannot; the document does not say.
