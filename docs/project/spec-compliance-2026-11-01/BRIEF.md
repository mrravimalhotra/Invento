# Spec-to-code compliance brief (Invento, 1 Nov 2026)

You are one checker in a Trail of Bits `spec-to-code-compliance` run. Read these first (short):
- /home/user/Invento/.claude/skills/spec-to-code-compliance/resources/ANALYSIS_FORMAT.md (the format you must write)
- /home/user/Invento/.claude/skills/spec-to-code-compliance/resources/DIVERGENCE_RUBRIC.md (severity)
- /home/user/Invento/CLAUDE.md (project map)

Project: Next.js 16 + Supabase (Postgres, RLS) app at /home/user/Invento. Enforcement lives in: database
migrations `supabase/migrations/NNNN_*.sql` (THE LATEST DEFINITION OF A FUNCTION, VIEW, TRIGGER OR CONSTRAINT
WINS: always find the highest-numbered migration that defines it; `supabase/fresh-install.sql` is all
migrations concatenated in order), server actions `lib/actions/*.ts`, screens `app/(dashboard)/<module>/`,
shared code `lib/`, `components/`. A requirement enforced only on screen is weaker than one the database
enforces; record which layers enforce it.

Rules:
- READ ONLY. Do not edit any file except your own output files. Do not run git commands that change anything,
  do not run the app, do not connect to any database.
- Verdicts: implemented, partial, contradicted, stronger-than-spec, absent, undecidable.
- Quote the requirement verbatim (given below with its source). Cite code as path:Lnn.
- The **Searched** section must list each search pattern and its result.
- Write one file per requirement: /home/user/Invento/docs/project/spec-compliance-2026-11-01/requirements/<REQ-ID>.md
  in the ANALYSIS_FORMAT structure.
- Final message: ONLY a JSON array, one object per requirement:
  {"id":"REQ-xx","verdict":"...","confidence":"high|medium|low","severity":"none|low|medium|high|critical",
   "summary":"one sentence","divergence":"one sentence or empty","documentProblem":"one sentence or empty"}

## Requirements

### REQ-01
> "an Inventory Manager or System Admin can void an issue with a reason, at any time, from the Packaging list (Status column → Void → red box → Yes, void)."
> — docs/modules/packaging.md · Current behaviour, bullet 1 (Void)

### REQ-02
> "`void_packaging_issue()` writes one opposite ledger row per movement (reason "Void of PKG-…: …") and puts the bulk, materials and packed count back."
> — docs/modules/packaging.md · bullet 1 (Void)

### REQ-03
> "A voided issue stays on the list struck through with a Void badge; its bulk used moves to `voided_fp_qty`, so every bulk sum skips it; `active = false` hides it from Batch Trace; `item_position` counts each movement type both ways."
> — docs/modules/packaging.md · bullet 1 (Void)

### REQ-04
> "A Production issue can be voided only while its RM-FP batch is unused (not in any finished product batch, not written off, no COA); its RM-FP batch then leaves stock and its QC records become `voided`, recorded in the QC decision history."
> — docs/modules/packaging.md · bullet 1 (Void) + 0127 note

### REQ-05
> "Every issue is a **pack**; the database accepts only `pack`."
> — docs/modules/packaging.md · bullet 2

### REQ-06
> "Only **approved** finished-product batches can be issued. Departments: production, R&D, store."
> — docs/modules/packaging.md · bullet 3

### REQ-07
> "An issue and its packaging-material lines are saved in **one step** (`create_packaging_issue()`); an issue is limited to what is left of that batch (yield less samples, less earlier issues)."
> — docs/modules/packaging.md · bullet 4

### REQ-08
> "**Save issue(s)** asks once more in a red box ("Yes, save" / Cancel) before it saves, since a saved issue cannot be undone yet."
> — docs/modules/packaging.md · bullet 5

### REQ-09
> "Packaging materials come out of their purchase batches **oldest first (FIFO)** and every ledger row records its batch."
> — docs/modules/packaging.md · bullet 6

### REQ-10
> "The New packaging issue page reads one database view, `fp_batch_packing_options`: approved batches with product name, unit and the quantity still free to pack or issue (the same figure the database enforces)."
> — docs/modules/packaging.md · bullet 8

### REQ-11
> "The list page has a Packing Register PDF; several lines can be entered in one save (Store, R&D and Production)."
> — docs/modules/packaging.md · bullet 7

### REQ-12
> "Status names: Awaiting QC → Round 1 approved — awaiting review (or Round 1 rejection proposed) → Approved / Rejected, from `lib/status-labels.ts`, the same on every screen, report and the User Guide."
> — docs/modules/qc.md · bullet 1

### REQ-13
> "Round 1 types the result of every test on the COA template (raw material from a vendor and finished product; not Production raw material) into `checker_results`; approving needs every result and a COA template to exist, a rejection needs only the reason. Every decision in both rounds needs a reason of at least 3 characters (screen, action and `trg_fn_qc_enforce_review_stages`)."
> — docs/modules/qc.md · bullet 2 (0119)

### REQ-14
> "The QC Reviewer may edit the results: any change is stored whole in `reviewer_results` and is final, no change leaves Round 1's results standing; the certificate uses `reviewer_results` when present."
> — docs/modules/qc.md · bullet 2 (0119)

### REQ-15
> "A Round 1 rejection is only proposed (`checker_rejected`); the Reviewer confirms it (-> `rejected`, stock leaves On hand) or sends it back (-> `submitted`, Round 1 cleared). A final rejection can be voided by a QC Reviewer or System Admin with a written reason (-> `submitted`; stock restored by `trg_qc_rejected_stock`, finished product batch back to `submitted_to_qc`); refused once wastage exists. Every decision, send-back and void is written to `qc_decision_history`. Reject, void and send-back ask for confirmation on screen."
> — docs/modules/qc.md · bullet 2 (0119)

### REQ-16
> "Two rounds by two different people: Round 1 QC Checker, Round 2 QC Reviewer (System Admin exempt from the same-person rule). Both decisions only save while the record is still in the state the page showed."
> — docs/modules/qc.md · bullet 3

### REQ-17
> "Round 2 approval needs an **Expiry date** (not before today) and, except on the last retest, a **Retest period**. Raw material: period pre-filled at 180 days (the maximum), at most **3 retests**; the 3rd retest takes only the Expiry date. The sample quantity is pre-filled on New AR; the expiry is not."
> — docs/modules/qc.md · bullet 4

### REQ-18
> "A retest cannot set a later expiry than the batch was last approved with, and an expired batch is not retested. Finished product has the same retest cycle (180 days, 3 retests, last retest only an expiry date, `start_fp_retest()`). A retest period may never run past the expiry date, for every batch type (Round 2 message and trigger `trg_qc_retest_within_expiry`)."
> — docs/modules/qc.md · bullets 5-6

### REQ-19
> "Analytical Report No. format: `ARRM-0001/26` (raw material) and `ARFP-0001/26` (finished product); older `AR-001-DDMMYYYY` numbers are unchanged."
> — docs/modules/qc.md · bullet 7

### REQ-20
> "Start Retest draws a real sample (stability reserve first, then stock). Legacy (opening-stock) batches carry a Legacy tag and count earlier retests."
> — docs/modules/qc.md · bullet 8

### REQ-21
> "Rejected raw material leaves On hand automatically."
> — docs/modules/qc.md · bullet 10
