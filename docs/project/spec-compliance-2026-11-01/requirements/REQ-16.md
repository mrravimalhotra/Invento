## REQ-16 — Two rounds by two different people; decisions save only on the state the page showed

> "Two rounds by two different people: Round 1 QC Checker, Round 2 QC Reviewer (System Admin exempt from the same-person rule). Both decisions only save while the record is still in the state the page showed."
> — docs/modules/qc.md · bullet 3

---

**Verdict:** partial · confidence: high

---

**What this demands of an implementation:**
1. Round 1 (`submitted` -> `checker_approved`/`checker_rejected`) needs the Quality Checker role (or System Admin); Round 2 (-> `approved`/`rejected`/send back) needs the QC Reviewer role (or System Admin).
2. The person making Round 2 is not the person who made Round 1, unless they are System Admin. "The person who made Round 1" has to be a fact the decider cannot choose.
3. A Round 1 or Round 2 save is refused if the record's state changed after the page was rendered.

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0126_void_packaging_issue.sql:L58-L87 (latest trg_fn_qc_enforce_review_stages; BEFORE UPDATE, 0054:L120-L122)
if old.status = 'submitted' and new.status in ('checker_approved', 'checker_rejected') then
  if not public.has_any_role('system_admin', 'quality_checker') then raise ...        -- L60-L62
...
if old.status in ('checker_approved', 'checker_rejected') and new.status in ('approved', 'rejected', 'submitted') then
  if not public.has_any_role('system_admin', 'qc_reviewer') then raise ...            -- L82-L84
  if new.checker_by is not null and auth.uid() = new.checker_by and not v_is_admin then -- L85
    raise exception 'The QC Reviewer who makes the final decision must be a different person ...';
```
- Roles: enforced in the database for every client. ✓
- Same-person rule: compares `auth.uid()` with **`new.checker_by`**, the value in the incoming row, and skips the check when it is null. Nothing in the trigger stamps `checker_by := auth.uid()` in Round 1 or freezes it in Round 2; no other trigger on `quality_checks` writes it (triggers listed from supabase/fresh-install.sql: compute_retest_date, sample_pull, review_finished_product, enforce_review_stages, audit, 00_lock_batch_qc, rejected_stock, decision_history, void_finished_product, retest_within_expiry, 00_qc_production_batch_active). `checker_by` is set by the client: lib/actions/qc.ts:L184, and the DB tests write it directly (supabase/tests/part_qr119_qc_results.sql:L37, L43).
- RLS `qc_update` (0001_init.sql:L317-L319) lets quality_checker and qc_reviewer update any column of `quality_checks`; no column grants or `_is_direct_client_write()` guard exist for this table.

App layer: `reviewQcRound2` reads `existing.checker_by` and refuses the same person (lib/actions/qc.ts:L320-L324); the page hides the Round 2 forms from the Round 1 decider (app/(dashboard)/qc/[id]/page.tsx:L164, L248, L256, L276, L293). `sendBackQcRejection` has no app-level same-person check but the trigger covers send-back (0126:L81 includes `'submitted'`).

Stale-state ("the state the page showed"):
- Round 1: update filtered `.eq("status", "submitted")` (qc.ts:L190), empty result -> "Someone else has just made this decision" (L192). The Round 1 form is only shown on `submitted` (page.tsx:L196). ✓
- Send back: `.eq("status", "checker_rejected")` (qc.ts:L364). ✓  Void: `.eq("status", "rejected")` (qc.ts:L389). ✓
- Round 2: the expected status is **re-read inside the action** (qc.ts:L231-L240) and the update filters on that fresh value, `.eq("status", existing.status)` (qc.ts:L339). No form posts the status the page showed (no hidden field in qc-reviewer-form.tsx or qc-rejection-forms.tsx:L47-L65; only `status` = the chosen outcome). ✗ for one path, below.

---

**Paths walked:**
- Ordinary Reviewer, different from Checker, via the app -> passes; same person via the app -> refused at qc.ts:L322 and at 0126:L85. ✓
- System Admin as both -> allowed at qc.ts:L321-L322 and 0126:L85 (`not v_is_admin`). ✓
- A user who holds both `quality_checker` and `qc_reviewer` roles (roles are a set: lib/actions/user-roles.ts:L30 `getAll("roles")`, `set_user_roles` 0073) writes directly to PostgREST with their own session:
  - Round 1 via the app (checker_by = self), then Round 2 as `update quality_checks set status='approved', checker_by=null, review_comments='...', expiry_date=..., retest_period_days=... where id=...`. `new.checker_by is not null` is false at 0126:L85, so the check is skipped; the role check passes; the record is approved by one person. ✗
  - Or Round 1 with `checker_by` set to a colleague's id, then Round 2 normally. ✗
  - What remains: `qc_decision_history.decided_by = auth.uid()` (0127_void_review_fixes.sql:L51-L52) and the audit log record the real actor for both rounds, so it is detectable afterwards, not prevented.
- Round 2 stale page, proposed rejection: Reviewer A opens a `checker_rejected` record (ProposedRejectionForm). Reviewer B sends it back; the Checker re-decides it `checker_approved`. A presses "Yes, reject the batch": the action reads `checker_approved` (qc.ts:L231-L240), `checker_approved` -> `rejected` is legal (0126:L81), and the update matches `existing.status` (L339). If Round 1 recorded results, the confirm form sends none, so `checkResultsAgainstTemplate([], round1, false)` refuses with "The test list does not match the COA template" (lib/qc-results.ts:L53-L55) and nothing saves. If Round 1 has no results (Production raw material, where results are not required, 0126:L32), the rejection saves on a record A never saw approved. ✗
- Round 2 stale page from `checker_approved`: the record cannot leave `checker_approved` except to a final state (0126:L81, L149), so a stale page there is caught by the status filter. ✓
- Void on a stale page: only an A-B-A cycle (void, new Round 1 and Round 2, rejected again) leaves the filter at `rejected` matching a later rejection. Needs a full second decision cycle in between.

---

**Searched:**
- `checker_by` in migrations outside 011x/012x -> 0054 (column, L65; check L110-L111), 0100:L305 and 0101:L190 (opening-stock loaders insert it); no `checker_by := auth.uid()` anywhere (`checker_by\s*:=` -> only the null-resets at 0119:L188/L232, 0126:L98/L142)
- `grant update|revoke update|_is_direct_client_write` with quality_checks -> 0 hits
- `policy.*quality_checks` -> qc_select, qc_insert (0001, 0003), qc_update (0001:L317)
- triggers `on public.quality_checks` in fresh-install.sql -> the 11 listed above; none stamps checker_by
- `checker_by|reviewed_by|.eq("status"` in lib/actions/qc.ts -> L184, L190, L233, L286, L320, L334, L339, L364, L389
- `hidden` in qc-checker-form.tsx, qc-reviewer-form.tsx, qc-rejection-forms.tsx -> only `name="status"` (the outcome) at qc-rejection-forms.tsx:L53; no expected-state field
- `different person|same person|checker_by=null` in supabase/tests -> 0 hits; no DB suite tests the same-person rule

---

**How the verdict was reached:** the role half of "two rounds" and the stale-state guard for Round 1, send-back and void hold. Two gaps keep it from `implemented`:
1. The database same-person rule trusts a column the caller writes. Through the app it holds (the action sets `checker_by` itself and the Round 2 action does not touch it), so it is not `contradicted`; through a direct PostgREST write by a user holding both QC roles it does not. 0054's own comment (L84-L87) states the trigger exists so the rule is "database constraint, not UI convention". Severity **high**: it needs a privileged double role and a direct API call, but it defeats the GMP two-person release control on any batch, and the only mitigation is after-the-fact history.
2. Round 2 checks the state at action time, not the state the page showed; one reachable path (proposed rejection sent back and re-approved while the page is open, on a record without Round 1 results) saves a rejection the Reviewer did not make against what they saw. Medium on its own: needs concurrent users and the outcome is one the Reviewer was entitled to choose; it is voidable.

Fix direction (not applied): in the trigger compare `auth.uid()` with `old.checker_by` (or with the `round1_*` row's `decided_by` in `qc_decision_history`), refuse a Round 2 update that changes `checker_by`, and stamp `new.checker_by := auth.uid()` in Round 1; post the shown status as a hidden field and filter on it in `reviewQcRound2`.

---

**Open questions:**
- Whether any live user holds both `quality_checker` and `qc_reviewer`; the code permits it.
