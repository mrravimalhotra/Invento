import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBatchQcState, qcRecordStatusLabel } from "@/lib/batch-qc-status";
import { splitRmStock } from "@/lib/usable-stock";
import { bucketFor } from "@/lib/ageing";
import { qcRoundOutcomes } from "@/lib/qc-rounds";
import { checkYield, MAX_YIELD_PCT_OF_BATCH } from "@/lib/yield-rule";
import { lowStockCheck } from "@/lib/low-stock";
import { beforeDateError, notAfterDateError, futureDateError, isIsoDate, firstDateError } from "@/lib/date-rules";
import { toIstDateString, formatDate, formatDateTime, formatQty, escapeLike, fpBatchBoth, fpBatchShort, safeFileName, istDayStart } from "@/lib/utils";

const TODAY = "2026-10-18";

test("batch QC state: approved, retest due on the day, expired, rejected, pending", () => {
  assert.equal(computeBatchQcState("approved", "2026-12-01", TODAY, "2027-06-01"), "approved");
  assert.equal(computeBatchQcState("approved", TODAY, TODAY), "awaiting_retest");
  assert.equal(computeBatchQcState("approved", "2027-01-01", TODAY, "2026-10-17"), "expired");
  assert.equal(computeBatchQcState("rejected", null, TODAY), "rejected");
  assert.equal(computeBatchQcState("checker_approved", null, TODAY), "qc_pending");
  assert.equal(computeBatchQcState(null, null, TODAY), "qc_pending");
  assert.equal(qcRecordStatusLabel("checker_rejected"), "Rejection proposed");
  assert.equal(qcRecordStatusLabel("approved"), "approved");
});

test("raw material stock splits into usable and not usable (E38)", () => {
  const s = splitRmStock(
    [
      { liveRemaining: 10, qcStatus: "approved", retestDate: "2027-01-01", inStock: true },
      { liveRemaining: 4, qcStatus: "approved", retestDate: "2026-10-01", inStock: true },
      { liveRemaining: 3, qcStatus: "approved", retestDate: null, expiryDate: "2026-10-07", inStock: true },
      { liveRemaining: 2, qcStatus: "submitted", retestDate: null, inStock: true },
      { liveRemaining: 1, qcStatus: "rejected", retestDate: null, inStock: true },
      { liveRemaining: 9, qcStatus: "approved", retestDate: null, inStock: false },
      { liveRemaining: 0, qcStatus: "approved", retestDate: null, inStock: true },
    ],
    TODAY
  );
  assert.deepEqual(s, { usable: 10, awaitingQc: 2, rejected: 1, dueForRetest: 4, expired: 3, notYetUsable: 9 });
});

test("ageing buckets (E42)", () => {
  assert.equal(bucketFor(null, "2026-10-17", TODAY).bucket, "expired");
  assert.equal(bucketFor("2026-10-17", "2027-10-17", TODAY).bucket, "retest_overdue");
  assert.deepEqual(bucketFor("2026-11-17", "2027-10-17", TODAY), { bucket: "d30", days: 30, due: "Retest", dueDate: "2026-11-17" });
  assert.equal(bucketFor(null, "2026-12-17", TODAY).bucket, "d60");
  assert.equal(bucketFor(null, "2027-01-16", TODAY).bucket, "d90");
  assert.equal(bucketFor(null, "2027-01-17", TODAY).bucket, "later");
  assert.equal(bucketFor("2027-05-01", "2027-03-01", TODAY).due, "Expiry");
});

test("QC rounds as shown on the record page", () => {
  assert.deepEqual(qcRoundOutcomes({ status: "submitted", checker_at: null, reviewed_at: null }), { round1: "pending", round2: "not_reached" });
  assert.deepEqual(qcRoundOutcomes({ status: "checker_approved", checker_at: "x", reviewed_at: null }), { round1: "approved", round2: "pending" });
  assert.deepEqual(qcRoundOutcomes({ status: "approved", checker_at: "x", reviewed_at: "y" }), { round1: "approved", round2: "approved" });
  assert.deepEqual(qcRoundOutcomes({ status: "rejected", checker_at: "x", reviewed_at: null }), { round1: "rejected", round2: "not_reached" });
  assert.deepEqual(qcRoundOutcomes({ status: "approved", checker_at: null, reviewed_at: "y" }), { round1: "not_recorded", round2: "approved" });
});

test("yield rule: within range, needs a reason, blocked above 150%", () => {
  assert.deepEqual(checkYield({ batchYield: 95, batchSize: 100, theoreticalPct: 100, permissiblePct: 90 }), { pct: 95, blocked: false, needsReason: false, rangeText: "90% to 100%" });
  assert.equal(checkYield({ batchYield: 85, batchSize: 100, permissiblePct: 90 }).needsReason, true);
  assert.equal(checkYield({ batchYield: 120, batchSize: 100 }).needsReason, true);
  assert.equal(checkYield({ batchYield: 151, batchSize: 100 }).blocked, true);
  assert.equal(MAX_YIELD_PCT_OF_BATCH, 150);
  assert.equal(checkYield({ batchYield: "", batchSize: 100 }).pct, null);
});

test("low stock compares usable stock for raw material, on hand for others", () => {
  assert.deepEqual(lowStockCheck({ category: "raw", threshold: 5, onHand: 7.05, usable: 3.9 }), { low: true, compared: 3.9, basis: "usable" });
  assert.equal(lowStockCheck({ category: "packaging", threshold: "5", onHand: 6, usable: 0 }).low, false);
  assert.equal(lowStockCheck({ category: "raw", threshold: null, onHand: 0, usable: 0 }).low, false);
});

test("date entry rules (E30)", () => {
  assert.equal(isIsoDate("2026-10-18"), true);
  assert.equal(isIsoDate("18-10-2026"), false);
  assert.equal(beforeDateError("2026-09-27", "2026-09-28", "Batch start date", "the MFR approval date"), "Batch start date cannot be before the MFR approval date (28-09-2026).");
  assert.equal(beforeDateError("2026-09-28", "2026-09-28", "a", "b"), null);
  assert.match(notAfterDateError("2026-10-18", "2026-10-18", "Expiry", "the finish date") ?? "", /must be after/);
  assert.equal(futureDateError("2999-01-01", "Finish date"), "Finish date cannot be in the future.");
  assert.equal(futureDateError("2000-01-01", "Finish date"), null);
  assert.equal(firstDateError(null, null), null);
});

test("dates and quantities are shown in India time and format", () => {
  assert.equal(toIstDateString("2026-10-17T19:00:00Z"), "2026-10-18");
  assert.equal(toIstDateString("2026-10-18"), "2026-10-18");
  assert.equal(formatDate("2026-10-05"), "05-10-2026");
  assert.equal(formatDate("not a date"), "—");
  assert.equal(formatDateTime("2026-10-18T10:43:00Z"), "18-10-2026 16:13");
  assert.equal(istDayStart("2026-10-18"), "2026-10-18T00:00:00+05:30");
  assert.equal(formatQty(1234.5678), "1,234.568");
  assert.equal(formatQty(0.0003), "< 0.001");
  assert.equal(formatQty(null), "—");
});

test("search text, batch labels and file names", () => {
  assert.equal(escapeLike("50%_a\\b"), "50\\%\\_a\\\\b");
  assert.equal(fpBatchBoth("FP-00002-01/26", "PR-01/26"), "FP-00002-01/26 (PR-01/26)");
  assert.equal(fpBatchBoth("FP-1", "FP-1"), "FP-1");
  assert.equal(fpBatchShort("FP-00002-01/26", null), "FP-00002-01/26");
  assert.equal(safeFileName('QC list: 18/10 "final"'), "QC-list-18-10-final-");
});
