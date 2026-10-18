import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrationState, calibrationNeedsAttention, calibrationDueDateError } from "@/lib/calibration";

const TODAY = "2026-10-18";

test("status is worked out from Next due (P8-01)", () => {
  assert.deepEqual(calibrationState("required", "2027-03-15", TODAY), { label: "Calibrated", tone: "ok", days: 148 });
  assert.deepEqual(calibrationState("required", "2026-11-05", TODAY), { label: "Due in 18 days", tone: "soon", days: 18 });
  assert.deepEqual(calibrationState("required", "2026-11-17", TODAY), { label: "Due in 30 days", tone: "soon", days: 30 });
  assert.equal(calibrationState("required", "2026-11-18", TODAY).label, "Calibrated");
  assert.deepEqual(calibrationState("required", TODAY, TODAY), { label: "Due today", tone: "soon", days: 0 });
  assert.deepEqual(calibrationState("required", "2026-10-01", TODAY), { label: "Overdue by 17 days", tone: "overdue", days: -17 });
  assert.equal(calibrationState("required", "2026-10-17", TODAY).label, "Overdue by 1 day");
  assert.equal(calibrationState("required", "2026-10-19", TODAY).label, "Due in 1 day");
});

test("not applicable ignores the dates; a missing date is flagged", () => {
  assert.deepEqual(calibrationState("not_applicable", "2020-01-01", TODAY), { label: "Not applicable", tone: "none", days: null });
  assert.deepEqual(calibrationState("required", null, TODAY), { label: "No due date", tone: "soon", days: null });
  assert.equal(calibrationState(null, "2026-10-01", TODAY).tone, "overdue");
});

test("the Dashboard card lists overdue and due within 30 days only", () => {
  assert.equal(calibrationNeedsAttention(calibrationState("required", "2026-10-01", TODAY)), true);
  assert.equal(calibrationNeedsAttention(calibrationState("required", "2026-11-05", TODAY)), true);
  assert.equal(calibrationNeedsAttention(calibrationState("required", "2027-03-15", TODAY)), false);
  assert.equal(calibrationNeedsAttention(calibrationState("not_applicable", null, TODAY)), false);
  assert.equal(calibrationNeedsAttention(calibrationState("required", null, TODAY)), false);
});

test("Next due is required when the equipment needs calibration", () => {
  assert.match(calibrationDueDateError("required", "") ?? "", /required/);
  assert.equal(calibrationDueDateError("required", "2027-01-01"), null);
  assert.equal(calibrationDueDateError("not_applicable", ""), null);
});
