# Spec-to-code compliance: Packaging and Quality Control (1 Nov 2026)

Method: Trail of Bits `spec-to-code-compliance` (installed in `.claude/skills/`). Its own workflow and agents come with the Trail of Bits plugin, which `npx skills add` does not install, so the method was run by hand with sub-agents (Ravi's choice): the "Current behaviour" sections of `docs/modules/packaging.md` and `docs/modules/qc.md` were split into 21 requirements (`BRIEF.md`, quoted verbatim); eight checker agents wrote one analysis per requirement (`requirements/REQ-xx.md`); every medium or high divergence then went to a separate agent that had not written it, which tried to refute it and reproduced it on a throwaway local database (`REFUTATIONS.md`). All eight survived. Low findings were not independently re-checked. Nothing in the app or the live database was changed.

## Verdicts

| ID | Requirement (short) | Verdict | Severity | Refutation |
|---|---|---|---|---|
| REQ-01 | Only IM / System Admin void, with a reason | implemented | none | – |
| REQ-02 | Void writes opposite rows, puts stock back | implemented | none | – |
| REQ-03 | Voided issue shown Void, skipped by sums and Batch Trace | partial | medium | confirmed |
| REQ-04 | Production void only while RM-FP unused; QC voided | implemented | low | – |
| REQ-05 | Every issue is a pack | implemented | low | – |
| REQ-06 | Only approved batches; three departments | partial | medium | confirmed |
| REQ-07 | One-step save; limited to what is left | partial | medium | confirmed |
| REQ-08 | Save asks once more | implemented | low (wording) | – |
| REQ-09 | Materials FIFO; every ledger row records its batch | partial | low | not re-checked |
| REQ-10 | Packing options view = database limit | implemented | none | – |
| REQ-11 | Packing Register PDF; multi-line save | implemented | none | – |
| REQ-12 | Status names the same everywhere | partial | low | not re-checked |
| REQ-13 | Round 1 results / COA template; reasons ≥ 3 | partial | medium (+ insert bypass) | confirmed |
| REQ-14 | Reviewer edits final; certificate uses them | partial | medium | confirmed |
| REQ-15 | Proposed rejection, send back, void, history, confirmations | partial | low | not re-checked |
| REQ-16 | Two different people; saves only in the state shown | partial | **high** | confirmed |
| REQ-17 | Round 2 expiry and retest-period rules | partial | medium | confirmed |
| REQ-18 | Retest cannot extend expiry; FP cycle; period within expiry | partial | medium | confirmed |
| REQ-19 | AR number formats | implemented | low | – |
| REQ-20 | Retest draws a real sample; legacy retests counted | implemented | low | – |
| REQ-21 | Rejected raw material leaves On hand | implemented | none | – |

10 implemented, 11 partial, none contradicted or absent.

## The pattern behind the confirmed findings

Every confirmed divergence has the same shape: **the screens and server actions enforce the documented rule, the database does not**, so a signed-in user with the right role who calls the database API directly (outside the app's screens) can do what the document rules out. None is reachable by an anonymous visitor or by a role without that permission, and nothing in the app's own screens triggers them. Earlier decisions accepted "13 direct-API findings as risk"; most of these fall in that family. Two do not fit it comfortably, because they defeat the GMP two-person control:

1. **REQ-16 (high):** a user holding both QC roles can approve a batch alone by sending `checker_by = null` (or a colleague's id) with the decision. The decision history still shows who really did both rounds, but the save is not stopped.
2. **REQ-13 insert path (medium, found during refutation):** a Quality Checker can insert a QC record that is already Approved, skipping both rounds and the reason.

The others, all confirmed: approvals with invented test results or no COA template (REQ-13), reviewer results and certificates that differ from QC's (REQ-14), packaging issues on batches not approved (REQ-06), material added to a voided issue and never returned (REQ-07), a header-only or pre-voided packaging row (REQ-03b, REQ-07), Round 2 expiry/period rules not checked by the database, including expiry in the past, period over 180 days, and later edits after approval (REQ-17, REQ-18), and the opening-stock loader accepting a retest date after the expiry (REQ-18).

One is a small app gap, not a direct-API one: tracing back from a voided RM-FP batch still shows its voided packaging issue without a Void label (REQ-03a).

## Low findings and document fixes (not re-checked)

- REQ-08: the confirmation box and packaging.md still say a saved issue "can't be undone", which is no longer true since the void (P6-01).
- REQ-09: when stock exceeds what is held in batches, the remainder is pulled in a ledger row with no batch; the bullet "every ledger row records its batch" overstates it (the module's own dated section says so).
- REQ-12: four places do not use the shared status names: the Batch Trace export (raw codes), the QC card on the finished product batch page ("Checker_approved"), the Dashboard QC chart ("Submitted", and proposed rejections counted under Round 1 approved), and User Guide line 462 ("Submitted").
- REQ-15: "Send back to the Quality Checker" saves on one click although the document says send-back asks for confirmation; for a finished product retest, voiding a rejection returns the batch to approved (not submitted_to_qc).
- REQ-05: old repack/unpack issues (before 29 Sept) cannot be voided, because the database rechecks the pack-only rule on update.
- REQ-04, REQ-19, REQ-20: minor database-level gaps (a COA created at the very moment of a void; AR format not constrained; retest count enforced in the action only).
- Document drift: packaging.md names `create_packaging_issue()` and migration 0114 where the app uses the wrappers and 0120; qc.md omits the "template changed since QC" exception documented in coa.md; numbers widen to 5 digits after 9999.

## Not covered

Only Packaging and Quality Control; the other modules' documents were not checked. Low findings rest on one agent's reading.
