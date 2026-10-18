import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateFifo, type Candidate } from "@/lib/fifo";

const batch = (id: string, qty: number | string, source: Candidate["source"] = "purchase"): Candidate => ({
  source,
  id,
  batchNumber: `B-${id}`,
  remainingQty: qty,
});

test("takes from the oldest batch only when it holds enough", () => {
  const r = allocateFifo([batch("1", 10), batch("2", 10)], 4);
  assert.deepEqual(r.allocations.map((a) => [a.id, a.qty]), [["1", 4]]);
  assert.equal(r.shortfallQty, 0);
});

test("empties the oldest batch, then moves to the next (E22 FIFO cascade)", () => {
  const r = allocateFifo([batch("1", 3), batch("2", 10), batch("3", 10)], 8);
  assert.deepEqual(r.allocations.map((a) => [a.id, a.qty]), [["1", 3], ["2", 5]]);
  assert.equal(r.shortfallQty, 0);
});

test("reports a shortfall when every batch together is not enough", () => {
  const r = allocateFifo([batch("1", 2), batch("2", 1.5)], 5);
  assert.equal(r.allocations.length, 2);
  assert.equal(r.shortfallQty, 1.5);
});

test("skips a batch holding less than 0.0005 (SCAN-P5-08)", () => {
  const r = allocateFifo([batch("1", 0.0004), batch("2", 10)], 1);
  assert.deepEqual(r.allocations.map((a) => a.id), ["2"]);
});

test("rounding dust under 0.0005 is not a shortfall", () => {
  const r = allocateFifo([batch("1", 0.9996)], 1);
  assert.equal(r.shortfallQty, 0);
});

test("needs are rounded to three decimals", () => {
  const r = allocateFifo([batch("1", 10)], 0.1 + 0.2);
  assert.equal(r.allocations[0].qty, 0.3);
});

test("the same batch is never promised twice across recipe lines (ACC-30)", () => {
  const taken = new Map<string, number>();
  const first = allocateFifo([batch("1", 5), batch("2", 5)], 4, taken);
  const second = allocateFifo([batch("1", 5), batch("2", 5)], 4, taken);
  assert.deepEqual(first.allocations.map((a) => [a.id, a.qty]), [["1", 4]]);
  assert.deepEqual(second.allocations.map((a) => [a.id, a.qty]), [["1", 1], ["2", 3]]);
  assert.equal(taken.get("1"), 5);
});

test("accepts remaining quantities stored as text and keeps the batch source", () => {
  const r = allocateFifo([batch("p1", "2.5", "production")], 2);
  assert.equal(r.allocations[0].qty, 2);
  assert.equal(r.allocations[0].source, "production");
});

test("nothing needed, nothing taken", () => {
  const r = allocateFifo([batch("1", 5)], 0);
  assert.deepEqual(r.allocations, []);
  assert.equal(r.shortfallQty, 0);
});
