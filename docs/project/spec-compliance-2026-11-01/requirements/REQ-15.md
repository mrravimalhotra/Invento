## REQ-15 — Proposed rejection, confirm / send back, rejection void, decision history, on-screen confirmations

> "A Round 1 rejection is only proposed (`checker_rejected`); the Reviewer confirms it (-> `rejected`, stock leaves On hand) or sends it back (-> `submitted`, Round 1 cleared). A final rejection can be voided by a QC Reviewer or System Admin with a written reason (-> `submitted`; stock restored by `trg_qc_rejected_stock`, finished product batch back to `submitted_to_qc`); refused once wastage exists. Every decision, send-back and void is written to `qc_decision_history`. Reject, void and send-back ask for confirmation on screen."
> — docs/modules/qc.md · bullet 2 (0119)

---

**Verdict:** partial · confidence: high

---

**What this demands of an implementation:**
1. Round 1 can only move `submitted` -> `checker_rejected` (never straight to `rejected`).
2. From `checker_rejected` the Reviewer can go to `rejected` (stock pulled from On hand) or back to `submitted` (Round 1 fields cleared); not to `approved`.
3. `rejected` -> `submitted` (void) only by QC Reviewer / System Admin, with a reason, refused when a `wastage` ledger row exists for the batch; RM stock pushed back by `trg_qc_rejected_stock`; FP batch status back to `submitted_to_qc`.
4. Each of these transitions inserts a `qc_decision_history` row, and the history cannot be skipped or written by clients.
5. The screens ask for a second confirmation before reject (both rounds), void and send-back.

---

**Where enforcement lives:**

```sql
-- supabase/migrations/0126_void_packaging_issue.sql:L58-L149 (latest trg_fn_qc_enforce_review_stages; bound BEFORE UPDATE by 0054:L120-L122)
if old.status = 'submitted' and new.status in ('checker_approved', 'checker_rejected') then ...   -- L59
if old.status in ('checker_approved', 'checker_rejected') and new.status in ('approved', 'rejected', 'submitted') then  -- L81
  if new.status = 'submitted' then  -- send back, L89-L100: only from checker_rejected, returned_reason >= 3, Round 1 fields nulled
  if old.status = 'checker_rejected' and new.status = 'approved' then raise ...  -- L103-L105
if old.status = 'rejected' and new.status = 'submitted' then  -- void, L124-L147
  has_any_role('system_admin','qc_reviewer'); void_reason >= 3; wastage exists -> raise (L131-L139)
raise exception 'A QC record cannot move from "%" to "%".'  -- L149: every other transition refused
```
- The state machine is enforced in the database for every client (actions and direct PostgREST writes). `submitted` -> `rejected` falls through to L149 and is refused, so a Round 1 rejection can only be a proposal.
- Wastage check (L131-L136) looks for `inventory_ledger.event_type = 'wastage'` on the purchase line or production batch. Wastage is only written by `record_wastage()` (0104_rejected_materials.sql:L119, L188), which requires a purchase line, so finished product batches cannot have wastage and the refusal is never reachable for them.

```sql
-- supabase/migrations/0119_qc_results_reasons_rejection.sql:L312-L374 (latest trg_fn_qc_rejected_stock)
```
- On `rejected` it pulls `live_remaining_qty` out with `reference_type = 'qc_rejected'`; on `rejected` -> `submitted` it pushes the net back. Returns at once for finished product (L324-L326).

```sql
-- supabase/migrations/0120_finished_product_retest.sql:L293-L322 (latest trg_fn_qc_void_finished_product; trigger 0119:L303-L307)
```
- First FP record: batch `rejected` -> `submitted_to_qc` (L318-L320). FP retest: batch -> `approved` and bulk pushed back by this trigger, not `trg_qc_rejected_stock` (L300-L316).

```sql
-- supabase/migrations/0127_void_review_fixes.sql:L22-L54 (latest trg_fn_qc_decision_history; trigger 0119:L276-L279, AFTER UPDATE OF status)
```
- Events round1_approved, round1_rejected, sent_back (L34), round2_approved, round2_rejected, voided (L42), voided_with_issue; `decided_by = auth.uid()` (L51-L52). SECURITY DEFINER; `qc_decision_history` has only a SELECT policy (0119:L100-L103), so clients cannot insert, edit or delete rows.

Server actions (lib/actions/qc.ts): `reviewQcRound1` accepts only `checker_approved`/`checker_rejected` (L136-L139); `reviewQcRound2` refuses approving a proposed rejection (L240-L242); `sendBackQcRejection` (L352-L374) writes `status: 'submitted', returned_reason` with `.eq("status","checker_rejected")`; `voidQcRejection` (L377-L405) role `qc_void_rejection` = system_admin, qc_reviewer (lib/constants/roles.ts:L38), `.eq("status","rejected")`. Saved messages `qc_sent_back` / `qc_voided` (lib/saved-messages.ts:L15-L16).

Screens (app/(dashboard)/qc/[id]/):
- Round 1 reject: red "Yes, propose rejection" box, qc-checker-form.tsx:L98-L110. ✓
- Round 2 reject (from checker_approved): red "Yes, reject the batch" box, qc-reviewer-form.tsx:L171-L182. ✓
- Confirm a proposed rejection: `ConfirmThenSubmit`, qc-rejection-forms.tsx:L47-L65, L138-L174. ✓
- Void: `ConfirmThenSubmit`, qc-rejection-forms.tsx:L92-L112. ✓
- Send back: `SendBackForm` qc-rejection-forms.tsx:L67-L90 has a plain `type="submit"` "Send back" button (L83-L85); no confirmation step. ✗
- Decision history shown on the record page: page.tsx:L148-L160.

---

**Paths walked:**
- Round 1 reject via action -> `checker_rejected` (0126:L59-L78). ✓ Direct write `submitted` -> `rejected` -> L149 refuses. ✓
- Confirm: `checker_rejected` -> `rejected` (0126:L81-L121) -> `trg_qc_rejected_stock` pull (0119:L335-L354). ✓
- Send back: `checker_rejected` -> `submitted`, Round 1 cleared (0126:L89-L100); `checker_approved` -> `submitted` refused (L91-L93). ✓ History `sent_back` (0127:L34). ✓
- Approve a proposed rejection: refused in action (qc.ts:L240-L242) and trigger (0126:L103-L105). ✓
- Void RM: role + reason + wastage check (0126:L124-L139), decision fields cleared (L140-L146), stock pushed back (0119:L355-L366), history `voided` (0127:L42). ✓
- Void with wastage present: raise at 0126:L137-L139; covered by supabase/tests/part_qr119_qc_results.sql:L90-L96. ✓
- Void FP first record: batch -> `submitted_to_qc` (0120:L318-L320). ✓
- Void FP retest: batch -> `approved`, bulk restored by `trg_qc_void_finished_product` (0120:L300-L316). Differs from the document's wording (see below); behaviour is the intended retest one per the 0120 comment (L291-L292).
- Void while another open QC record exists for the batch: unique index (0119:L56-L64) raises 23505, mapped to a message in qc.ts:L392-L394. ✓
- Send back on screen: one click submits (qc-rejection-forms.tsx:L83). ✗

---

**Searched:**
- `checker_rejected|qc_decision_history|void_qc_rejection|send_back|trg_qc_rejected_stock|trg_fn_qc_enforce_review_stages` in migrations -> 0054, 0104, 0119, 0120, 0126, 0127
- `create or replace function` in 0119/0120/0126/0127 -> latest enforce_review_stages = 0126:L29; decision_history = 0127:L22; rejected_stock = 0119:L312; void_finished_product = 0120:L293
- `policy.*qc_decision_history` -> one SELECT policy only (0119:L102)
- `create or replace function public.record_wastage` -> latest 0104:L119; wastage inserts `values ('wastage'` -> only 0104:L188 (purchase line)
- `voidQcRejection|sendBackQcRejection|reviewQcRound2|reviewQcRound1|qc_decision_history` in app/ -> qc/[id]/page.tsx, qc-checker-form.tsx, qc-reviewer-form.tsx, qc-rejection-forms.tsx, audit/audit-diff.ts
- `hidden|confirm|Yes,|ConfirmThenSubmit|danger` in qc-checker-form.tsx, qc-reviewer-form.tsx -> confirmation boxes at the lines above; SendBackForm has none
- `checker_rejected|void_reason` in supabase/tests -> part_qr119_qc_results.sql, part_fr120_fp_retest.sql, part_vp126_void_packaging.sql, part_vr127_void_review_fixes.sql

---

**How the verdict was reached:** every database clause holds and is enforced by triggers for all clients. Two divergences keep it from `implemented`: (1) send-back has no on-screen confirmation, which the requirement names explicitly; (2) the document says void stock comes back through `trg_qc_rejected_stock` and the FP batch returns to `submitted_to_qc`, which is true for raw material and a first FP record but not an FP retest (batch back to `approved`, bulk restored by `trg_qc_void_finished_product`). Neither breaks a control: send-back is recoverable (Round 1 is kept in `qc_decision_history`, the Checker decides again), and the FP retest behaviour is the intended one. Not `contradicted`, since the core workflow matches.

Severity low: the missing confirmation is a UI convenience on a reversible step; the FP retest point belongs in the document.

---

**Open questions:**
- Whether any path other than `record_wastage()` writes `wastage` against a production batch (the trigger checks `production_batch_id` too); none found in 01xx migrations.
