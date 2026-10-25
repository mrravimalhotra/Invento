import { test } from "node:test";
import assert from "node:assert/strict";
import { tasksFor, TASKS } from "../../lib/my-tasks";

const keys = (roles: Parameters<typeof tasksFor>[0]) => tasksFor(roles).map((t) => t.key).join(",");

test("each role sees its own tasks", () => {
  assert.equal(keys(["quality_checker"]), "qc_round1");
  assert.equal(keys(["qc_reviewer"]), "qc_round2");
  assert.equal(keys(["mfr_manager"]), "fp_in_process,fp_complete,fp_draft,fp_unpacked");
  assert.equal(keys(["inventory_manager"]), "fp_in_process,fp_complete,fp_draft,fp_unpacked,po_draft");
  assert.equal(keys(["quality_checker", "mfr_manager"]), "qc_round1,fp_in_process,fp_complete,fp_draft,fp_unpacked");
  assert.equal(tasksFor(["system_admin"]).length, TASKS.length);
  assert.equal(keys(["super_auditor"]), "");
});

test("labels follow the count", () => {
  const fp = TASKS.find((t) => t.key === "fp_complete")!;
  assert.equal(fp.label(1), "Batch complete, to submit to QC");
  assert.equal(fp.label(3), "Batches complete, to submit to QC");
});
