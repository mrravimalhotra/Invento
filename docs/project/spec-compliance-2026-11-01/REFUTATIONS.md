# Refutation results (independent agents; reproduced on a throwaway local database where stated)

## REQ-13 — confirmed (medium; the insert path is more serious)
Read the latest trg_fn_qc_enforce_review_stages (0126; no later redefinition): Round 1 approval checks only the shape of checker_results (`_qc_results_valid`), never `coa_templates`; the trigger is BEFORE UPDATE only; `qc_insert` checks only the role. On a throwaway database as an authenticated quality_checker: (a) Round 1 approval with invented results for an item with no COA template — allowed; (b) INSERT of a quality_checks row with status 'approved', no reason, no results — allowed; (c) INSERT with status 'checker_approved', no reason — allowed. (b) lets one Quality Checker create an approved record, skipping Round 2 and the two-person rule.

## REQ-14 — confirmed (medium)
Round 2 checks only that Round 1 results exist and that reviewer_results has the same length and shape; not the test/specification text, not that anything changed. `coa_insert` checks only the role; the only coa_records insert trigger checks current approval. As qc_reviewer: approval with reviewer_results naming a different test — allowed. As quality_checker: coa_records insert with made-up result_lines for an approved record — allowed. The "certificate uses reviewer_results ?? checker_results" rule lives only in lib/actions/coa.ts:169-180.
