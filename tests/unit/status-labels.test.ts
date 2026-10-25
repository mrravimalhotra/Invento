import { test } from "node:test";
import assert from "node:assert/strict";
import { statusLabel } from "@/lib/status-labels";
import { qcRecordStatusLabel } from "@/lib/batch-qc-status";

test("one wording for every status (UX-05)", () => {
  assert.equal(statusLabel("submitted"), "Awaiting QC");
  assert.equal(statusLabel("checker_approved"), "Round 1 approved — awaiting review");
  assert.equal(statusLabel("checker_rejected"), "Round 1 rejection proposed");
  assert.equal(statusLabel("complete_awaiting_qc"), "Complete - Awaiting QC");
  assert.equal(statusLabel("in_process"), "In Process");
  assert.equal(statusLabel("approved"), "Approved");
  assert.equal(qcRecordStatusLabel("checker_approved"), statusLabel("checker_approved"));
});

test("an unknown code still reads as words", () => {
  assert.equal(statusLabel("some_new_state"), "Some new state");
  assert.equal(statusLabel(null), "");
});
