import { test } from "node:test";
import assert from "node:assert/strict";
import { canWrite, MODULE_WRITE_ROLES } from "../../lib/constants/roles";
import { QC_EVENT_LABELS } from "../../lib/qc-results";

// P6-01: who may void a packaging issue (void_packaging_issue() in 0126/0127 checks the same roles).
test("only an Inventory Manager or System Admin may void a packaging issue", () => {
  assert.deepEqual([...MODULE_WRITE_ROLES.packaging_void].sort(), ["inventory_manager", "system_admin"]);
  assert.equal(canWrite(["mfr_manager"], "packaging_void"), false);
  assert.equal(canWrite(["inventory_manager"], "packaging_void"), true);
});

test("the QC history names a void made with a packaging issue", () => {
  assert.equal(QC_EVENT_LABELS.voided_with_issue, "Voided with its packaging issue");
});
