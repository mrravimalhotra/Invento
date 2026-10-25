import { test } from "node:test";
import assert from "node:assert/strict";
import { fpWorkflow, poWorkflow } from "../../lib/workflow-steps";

const states = (w: ReturnType<typeof fpWorkflow>) => w.steps.map((s) => `${s.label}:${s.state}`).join(" ");

test("finished product batch steps follow its status and QC", () => {
  assert.match(states(fpWorkflow("draft", null, false)), /^Draft:current In Process:todo/);
  assert.match(states(fpWorkflow("submitted_to_qc", "submitted", false)), /Complete:done Submitted to QC:current Approved:todo/);
  assert.match(fpWorkflow("submitted_to_qc", "checker_approved", false).next, /Round 1 is done/);
  assert.match(states(fpWorkflow("approved", "approved", false)), /Approved:current Packed:todo$/);
  assert.match(states(fpWorkflow("approved", "approved", true)), /Approved:done Packed:done$/);
  assert.match(states(fpWorkflow("submitted_to_qc", "rejected", false)), /Submitted to QC:done Rejected:stopped$/);
  assert.equal(states(fpWorkflow("cancelled", null, false)), "Draft:done Cancelled:stopped");
});

test("purchase order steps follow its status and QC decisions", () => {
  assert.equal(states(poWorkflow("draft", 0, 0)), "Draft:current Submitted:todo QC decided:todo");
  assert.match(poWorkflow("submitted", 3, 2).next, /2 of 3 decided/);
  assert.equal(states(poWorkflow("submitted", 3, 3)), "Draft:done Submitted:done QC decided:done");
  assert.equal(states(poWorkflow("submitted", 0, 0)), "Draft:done Submitted:done");
});
